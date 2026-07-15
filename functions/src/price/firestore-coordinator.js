import { randomUUID } from 'node:crypto';

import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { validatePriceConfig } from './config.js';
import { stableDigest } from './digest.js';
import { PriceEngineError } from './errors.js';
import { calculatePriceTick } from './formula.js';
import { appendBoundedPricePoint } from './history.js';
import { requireSafeInteger, safeAdd } from './integer-math.js';

const EXPECTED_CLUB_COUNT = 20;
const demandFields = Object.freeze([
  'buyQuantity',
  'sellQuantity',
  'buyTradeCount',
  'sellTradeCount',
  'grossBuyAmount',
  'grossSellAmount',
]);

export function createFirestorePriceCoordinator({
  firestore = getFirestore(),
  now = () => Timestamp.now(),
  ownerId = randomUUID(),
  afterRunCompleted = null,
} = {}) {
  return Object.freeze({
    async run() {
      const clubIds = await listOfficialClubIds(firestore);
      let lease = null;
      try {
        lease = await acquireLease({ firestore, now, ownerId });
        const rotation = await rotateOrResume({ firestore, now, lease, clubIds });
        if (rotation.status !== 'processing') {
          return Object.freeze(rotation);
        }
        await prepareRuns({ firestore, now, lease, clubIds, windowId: rotation.windowId });
        for (const clubId of clubIds) {
          await completeRun({ firestore, now, lease, clubId, windowId: rotation.windowId });
          if (afterRunCompleted) {
            await afterRunCompleted({ clubId, windowId: rotation.windowId });
          }
        }
        await markVersionReady({ firestore, now, lease, clubIds, windowId: rotation.windowId });
        const published = await publishVersion({
          firestore,
          now,
          lease,
          clubIds,
          windowId: rotation.windowId,
        });
        return Object.freeze({ status: 'published', ...published });
      } catch (error) {
        if (error instanceof PriceEngineError && error.code === 'lease-held') {
          return Object.freeze({ status: 'busy' });
        }
        throw error;
      } finally {
        if (lease) {
          await releaseLease({ firestore, now, lease }).catch(() => undefined);
        }
      }
    },
  });
}

async function listOfficialClubIds(firestore) {
  const snapshot = await firestore.collection('clubs').limit(EXPECTED_CLUB_COUNT + 1).get();
  if (snapshot.size !== EXPECTED_CLUB_COUNT) {
    throw new PriceEngineError(
      'invalid-catalog',
      `Expected exactly ${EXPECTED_CLUB_COUNT} official clubs.`,
    );
  }
  const ids = snapshot.docs.map((document) => {
    if (document.data()?.id !== document.id) {
      throw new PriceEngineError('invalid-catalog', 'A club document ID does not match its id field.');
    }
    return document.id;
  }).sort();
  return Object.freeze(ids);
}

async function acquireLease({ firestore, now, ownerId }) {
  return firestore.runTransaction(async (transaction) => {
    const configRef = firestore.doc('market/config');
    const leaseRef = firestore.doc('serviceLeases/price-coordinator');
    const [configSnapshot, leaseSnapshot] = await transaction.getAll(configRef, leaseRef);
    const config = validateConfigSnapshot(configSnapshot);
    const acquiredAt = requireTimestamp(now(), 'current time');
    const stored = leaseSnapshot.exists ? leaseSnapshot.data() : null;
    if (
      stored
      && stored.ownerId !== ownerId
      && timestampMillis(stored.leaseExpiresAt, 'lease expiry') > acquiredAt.toMillis()
    ) {
      throw new PriceEngineError('lease-held', 'Another price coordinator owns the lease.', {
        retryable: true,
      });
    }
    const fencingToken = stored === null
      ? 1
      : safeAdd(
        requireSafeInteger(stored.fencingToken, 'lease fencing token', { minimum: 0 }),
        1,
        'lease fencing token',
      );
    const leaseExpiresAt = Timestamp.fromMillis(
      acquiredAt.toMillis() + config.maxPriceDelaySeconds * 1_000,
    );
    transaction.set(leaseRef, {
      schemaVersion: 1,
      ownerId,
      fencingToken,
      leaseExpiresAt,
      updatedAt: acquiredAt,
    });
    return Object.freeze({ ownerId, fencingToken, leaseExpiresAt });
  });
}

async function rotateOrResume({ firestore, now, lease, clubIds }) {
  return firestore.runTransaction(async (transaction) => {
    const leaseRef = firestore.doc('serviceLeases/price-coordinator');
    const configRef = firestore.doc('market/config');
    const stateRef = firestore.doc('market/state');
    const [leaseSnapshot, configSnapshot, stateSnapshot] = await transaction.getAll(
      leaseRef,
      configRef,
      stateRef,
    );
    const currentTime = requireTimestamp(now(), 'current time');
    requireLease(leaseSnapshot, lease, currentTime);
    const config = validateConfigSnapshot(configSnapshot);
    if (!stateSnapshot.exists || stateSnapshot.data()?.status !== 'open') {
      return { status: 'market-closed' };
    }
    const state = stateSnapshot.data();
    if (state.configVersion !== config.configVersion) {
      throw new PriceEngineError('invalid-state', 'Market state configVersion is stale.');
    }
    if (state.processingPriceWindowId) {
      validateDocumentId(state.processingPriceWindowId, 'processing price window');
      return { status: 'processing', windowId: state.processingPriceWindowId, resumed: true };
    }
    const oldWindowId = validateDocumentId(state.activeDemandWindowId, 'active demand window');
    const newWindowId = `window-${Math.floor(currentTime.toMillis() / 60_000)}`;
    if (newWindowId === oldWindowId) {
      return { status: 'waiting' };
    }
    const oldWindowRefs = clubIds.map((clubId) => (
      firestore.doc(`marketDemand/${clubId}/windows/${oldWindowId}`)
    ));
    const oldWindowSnapshots = await transaction.getAll(...oldWindowRefs);
    for (let index = 0; index < clubIds.length; index += 1) {
      requireOpenWindow(oldWindowSnapshots[index], clubIds[index], oldWindowId, config);
    }

    for (let index = 0; index < clubIds.length; index += 1) {
      const clubId = clubIds[index];
      transaction.update(oldWindowRefs[index], { status: 'closed', closedAt: currentTime });
      transaction.create(firestore.doc(`marketDemand/${clubId}/windows/${newWindowId}`), {
        schemaVersion: 1,
        clubId,
        windowId: newWindowId,
        status: 'open',
        shardCount: config.demandShardCount,
        configVersion: config.configVersion,
        openedAt: currentTime,
        closedAt: null,
        appliedAt: null,
      });
    }
    transaction.create(firestore.doc(`priceVersions/${oldWindowId}`), {
      schemaVersion: 1,
      windowId: oldWindowId,
      status: 'computing',
      configVersion: config.configVersion,
      expectedClubCount: EXPECTED_CLUB_COUNT,
      completedClubCount: 0,
      inputDigest: null,
      startedAt: currentTime,
      preparedAt: null,
      readyAt: null,
      publishedAt: null,
    });
    transaction.update(stateRef, {
      activeDemandWindowId: newWindowId,
      processingPriceWindowId: oldWindowId,
      updatedAt: currentTime,
    });
    return { status: 'processing', windowId: oldWindowId, resumed: false };
  });
}

async function prepareRuns({ firestore, now, lease, clubIds, windowId }) {
  return firestore.runTransaction(async (transaction) => {
    const leaseRef = firestore.doc('serviceLeases/price-coordinator');
    const configRef = firestore.doc('market/config');
    const stateRef = firestore.doc('market/state');
    const versionRef = firestore.doc(`priceVersions/${windowId}`);
    const clubRefs = clubIds.map((clubId) => firestore.doc(`clubs/${clubId}`));
    const ratingRefs = clubIds.map((clubId) => firestore.doc(`ratings/${clubId}`));
    const windowRefs = clubIds.map((clubId) => (
      firestore.doc(`marketDemand/${clubId}/windows/${windowId}`)
    ));
    const shardRefs = clubIds.flatMap((clubId) => Array.from(
      { length: 100 },
      (_, index) => ({ clubId, index }),
    )).filter(({ index }) => index < 100);
    const firstSnapshots = await transaction.getAll(
      leaseRef,
      configRef,
      stateRef,
      versionRef,
      ...clubRefs,
      ...ratingRefs,
      ...windowRefs,
    );
    const [leaseSnapshot, configSnapshot, stateSnapshot, versionSnapshot] = firstSnapshots;
    const currentTime = requireTimestamp(now(), 'current time');
    requireLease(leaseSnapshot, lease, currentTime);
    const config = validateConfigSnapshot(configSnapshot);
    requireProcessingState(stateSnapshot, windowId, config);
    const version = requireVersion(versionSnapshot, windowId, config);
    if (version.preparedAt) {
      return;
    }

    const actualShardRefs = shardRefs
      .filter(({ index }) => index < config.demandShardCount)
      .map(({ clubId, index }) => (
        firestore.doc(
          `marketDemand/${clubId}/windows/${windowId}/shards/${formatShardId(index, config.demandShardCount)}`,
        )
      ));
    const runRefs = clubIds.map((clubId) => firestore.doc(`priceRuns/${windowId}_${clubId}`));
    const shardSnapshots = await transaction.getAll(...actualShardRefs);
    const runSnapshots = await transaction.getAll(...runRefs);
    const eventSnapshots = await transaction.get(
      firestore.collection('adminEvents')
        .where('status', '==', 'active')
        .limit(config.maxActiveAdminEvents + 1),
    );
    if (eventSnapshots.size > config.maxActiveAdminEvents) {
      throw new PriceEngineError('input-limit-exceeded', 'Too many active admin events.');
    }
    if (runSnapshots.some((snapshot) => snapshot.exists)) {
      throw new PriceEngineError('invalid-run-state', 'Unprepared version already has price runs.');
    }

    const offset = 4;
    const clubSnapshots = firstSnapshots.slice(offset, offset + clubIds.length);
    const ratingSnapshots = firstSnapshots.slice(
      offset + clubIds.length,
      offset + clubIds.length * 2,
    );
    const windowSnapshots = firstSnapshots.slice(offset + clubIds.length * 2);
    const events = eventSnapshots.docs.map(toEventInput).sort((left, right) => (
      left.startsAtMs - right.startsAtMs || left.id.localeCompare(right.id)
    ));
    let shardOffset = 0;
    let windowEndMs = null;

    for (let clubIndex = 0; clubIndex < clubIds.length; clubIndex += 1) {
      const clubId = clubIds[clubIndex];
      const window = requireClosedWindow(windowSnapshots[clubIndex], clubId, windowId, config);
      const clubWindowEndMs = timestampMillis(window.closedAt, 'window closedAt');
      if (windowEndMs === null) {
        windowEndMs = clubWindowEndMs;
      } else if (windowEndMs !== clubWindowEndMs) {
        throw new PriceEngineError('invalid-window', 'Closed windows have different boundaries.');
      }
      const demand = aggregateShards(
        shardSnapshots.slice(shardOffset, shardOffset + config.demandShardCount),
      );
      shardOffset += config.demandShardCount;
      const club = toClubInput(clubSnapshots[clubIndex], clubId, config);
      const rating = toRatingInput(ratingSnapshots[clubIndex], clubId);
      const clubEvents = events
        .filter((event) => event.targetClubIds.includes(clubId))
        .map((event) => ({
          id: event.id,
          status: event.status,
          impactType: event.impactType,
          impactBps: event.impactBps,
          startsAtMs: event.startsAtMs,
          endsAtMs: event.endsAtMs,
        }));
      const input = Object.freeze({ club, demand, rating, events: clubEvents, config, windowEndMs });
      transaction.create(runRefs[clubIndex], {
        schemaVersion: 1,
        runId: `${windowId}_${clubId}`,
        windowId,
        clubId,
        status: 'pending',
        configVersion: config.configVersion,
        inputDigest: stableDigest(input),
        input,
        result: null,
        attemptCount: 0,
        createdAt: currentTime,
        completedAt: null,
      });
    }
    transaction.update(versionRef, { preparedAt: currentTime });
  });
}

async function completeRun({ firestore, now, lease, clubId, windowId }) {
  return firestore.runTransaction(async (transaction) => {
    const leaseRef = firestore.doc('serviceLeases/price-coordinator');
    const runRef = firestore.doc(`priceRuns/${windowId}_${clubId}`);
    const [leaseSnapshot, runSnapshot] = await transaction.getAll(leaseRef, runRef);
    const currentTime = requireTimestamp(now(), 'current time');
    requireLease(leaseSnapshot, lease, currentTime);
    if (!runSnapshot.exists) {
      throw new PriceEngineError('invalid-run-state', 'Price run is missing.');
    }
    const run = runSnapshot.data();
    if (run.windowId !== windowId || run.clubId !== clubId) {
      throw new PriceEngineError('invalid-run-state', 'Price run identity is invalid.');
    }
    if (run.status === 'completed') {
      return run.result;
    }
    if (run.status !== 'pending' || stableDigest(run.input) !== run.inputDigest) {
      throw new PriceEngineError('invalid-run-state', 'Price run input is invalid.');
    }
    const result = calculatePriceTick(run.input);
    transaction.update(runRef, {
      status: 'completed',
      result,
      attemptCount: requireSafeInteger(run.attemptCount, 'run attempt count', { minimum: 0 }) + 1,
      completedAt: currentTime,
    });
    return result;
  });
}

async function markVersionReady({ firestore, now, lease, clubIds, windowId }) {
  return firestore.runTransaction(async (transaction) => {
    const leaseRef = firestore.doc('serviceLeases/price-coordinator');
    const versionRef = firestore.doc(`priceVersions/${windowId}`);
    const runRefs = clubIds.map((clubId) => firestore.doc(`priceRuns/${windowId}_${clubId}`));
    const [leaseSnapshot, versionSnapshot, ...runSnapshots] = await transaction.getAll(
      leaseRef,
      versionRef,
      ...runRefs,
    );
    const currentTime = requireTimestamp(now(), 'current time');
    requireLease(leaseSnapshot, lease, currentTime);
    const version = requireBasicVersion(versionSnapshot, windowId);
    if (version.status === 'ready' || version.status === 'published') {
      return;
    }
    const digests = runSnapshots.map((snapshot) => {
      if (!snapshot.exists || snapshot.data()?.status !== 'completed') {
        throw new PriceEngineError('incomplete-version', 'Not all price runs are complete.', {
          retryable: true,
        });
      }
      return snapshot.data().inputDigest;
    });
    transaction.update(versionRef, {
      status: 'ready',
      completedClubCount: clubIds.length,
      inputDigest: stableDigest(digests),
      readyAt: currentTime,
    });
  });
}

async function publishVersion({ firestore, now, lease, clubIds, windowId }) {
  return firestore.runTransaction(async (transaction) => {
    const leaseRef = firestore.doc('serviceLeases/price-coordinator');
    const stateRef = firestore.doc('market/state');
    const configRef = firestore.doc('market/config');
    const versionRef = firestore.doc(`priceVersions/${windowId}`);
    const runRefs = clubIds.map((clubId) => firestore.doc(`priceRuns/${windowId}_${clubId}`));
    const clubRefs = clubIds.map((clubId) => firestore.doc(`clubs/${clubId}`));
    const historyRefs = clubIds.map((clubId) => firestore.doc(`priceHistory/${clubId}`));
    const windowRefs = clubIds.map((clubId) => (
      firestore.doc(`marketDemand/${clubId}/windows/${windowId}`)
    ));
    const snapshots = await transaction.getAll(
      leaseRef,
      stateRef,
      configRef,
      versionRef,
      ...runRefs,
      ...clubRefs,
      ...historyRefs,
      ...windowRefs,
    );
    const currentTime = requireTimestamp(now(), 'current time');
    requireLease(snapshots[0], lease, currentTime);
    const config = validateConfigSnapshot(snapshots[2]);
    requireProcessingState(snapshots[1], windowId, config);
    const version = requireBasicVersion(snapshots[3], windowId);
    if (version.status === 'published') {
      return { windowId, publishedAt: timestampMillis(version.publishedAt, 'publishedAt') };
    }
    if (version.status !== 'ready' || version.completedClubCount !== clubIds.length) {
      throw new PriceEngineError('incomplete-version', 'Price version is not ready.');
    }
    let offset = 4;
    const runSnapshots = snapshots.slice(offset, offset += clubIds.length);
    const clubSnapshots = snapshots.slice(offset, offset += clubIds.length);
    const historySnapshots = snapshots.slice(offset, offset += clubIds.length);
    const windowSnapshots = snapshots.slice(offset);

    for (let index = 0; index < clubIds.length; index += 1) {
      const clubId = clubIds[index];
      const run = requireCompletedRun(runSnapshots[index], clubId, windowId, config);
      const storedClub = clubSnapshots[index].data();
      if (
        !clubSnapshots[index].exists
        || storedClub.currentPrice !== run.result.oldPrice
        || storedClub.fundamentalPrice !== run.result.oldFundamentalPrice
      ) {
        throw new PriceEngineError('publish-conflict', 'A club changed after the input snapshot.', {
          retryable: true,
        });
      }
      requireClosedWindow(windowSnapshots[index], clubId, windowId, config);
      const history = readHistory(historySnapshots[index], clubId, config.priceHistoryLimit);
      const lastRatingAt = run.result.lastRatingAtMs === null
        ? null
        : Timestamp.fromMillis(run.result.lastRatingAtMs);
      transaction.update(clubRefs[index], {
        currentPrice: run.result.newPrice,
        fundamentalPrice: run.result.newFundamentalPrice,
        priceChange: run.result.priceChange,
        priceChangeRate: run.result.priceChangeRate,
        marketCap: run.result.marketCap,
        buyVolume: run.result.buyVolume,
        sellVolume: run.result.sellVolume,
        totalVolume: run.result.totalVolume,
        averageRating: run.result.averageRatingMilli / 1_000,
        averageRatingMilli: run.result.averageRatingMilli,
        ratingCount: run.result.ratingCount,
        ratingRecentDelta: run.result.ratingRecentDeltaMilli / 1_000,
        ratingRecentDeltaMilli: run.result.ratingRecentDeltaMilli,
        lastRatingAt,
        lastPriceWindowId: windowId,
        priceCalculatedAt: currentTime,
        updatedAt: currentTime,
      });
      transaction.set(historyRefs[index], {
        schemaVersion: 1,
        clubId,
        points: appendBoundedPricePoint(
          history,
          { windowId, price: run.result.newPrice, calculatedAt: currentTime },
          config.priceHistoryLimit,
        ),
        updatedAt: currentTime,
      });
      transaction.update(windowRefs[index], { status: 'applied', appliedAt: currentTime });
    }
    transaction.update(stateRef, {
      currentPriceWindowId: windowId,
      processingPriceWindowId: null,
      updatedAt: currentTime,
    });
    transaction.update(versionRef, { status: 'published', publishedAt: currentTime });
    return { windowId, publishedAt: currentTime.toMillis() };
  });
}

async function releaseLease({ firestore, now, lease }) {
  await firestore.runTransaction(async (transaction) => {
    const leaseRef = firestore.doc('serviceLeases/price-coordinator');
    const snapshot = await transaction.get(leaseRef);
    if (
      snapshot.exists
      && snapshot.data().ownerId === lease.ownerId
      && snapshot.data().fencingToken === lease.fencingToken
    ) {
      const currentTime = requireTimestamp(now(), 'current time');
      transaction.update(leaseRef, { leaseExpiresAt: currentTime, updatedAt: currentTime });
    }
  });
}

function validateConfigSnapshot(snapshot) {
  if (!snapshot.exists) {
    throw new PriceEngineError('invalid-config', 'market/config does not exist.');
  }
  return validatePriceConfig(snapshot.data());
}

function requireLease(snapshot, expected, currentTime) {
  if (!snapshot.exists) {
    throw new PriceEngineError('lease-lost', 'Price coordinator lease is missing.', { retryable: true });
  }
  const stored = snapshot.data();
  if (
    stored.ownerId !== expected.ownerId
    || stored.fencingToken !== expected.fencingToken
    || timestampMillis(stored.leaseExpiresAt, 'lease expiry') <= currentTime.toMillis()
  ) {
    throw new PriceEngineError('lease-lost', 'Price coordinator lease was lost.', {
      retryable: true,
    });
  }
}

function requireOpenWindow(snapshot, clubId, windowId, config) {
  if (!snapshot.exists) {
    throw new PriceEngineError('invalid-window', 'An active demand window is missing.');
  }
  const window = snapshot.data();
  if (
    window.clubId !== clubId
    || window.windowId !== windowId
    || window.status !== 'open'
    || window.shardCount !== config.demandShardCount
    || window.configVersion !== config.configVersion
  ) {
    throw new PriceEngineError('invalid-window', 'An active demand window is invalid.');
  }
}

function requireClosedWindow(snapshot, clubId, windowId, config) {
  if (!snapshot.exists) {
    throw new PriceEngineError('invalid-window', 'A closed demand window is missing.');
  }
  const window = snapshot.data();
  if (
    window.clubId !== clubId
    || window.windowId !== windowId
    || !['closed', 'applied'].includes(window.status)
    || window.shardCount !== config.demandShardCount
    || window.configVersion !== config.configVersion
  ) {
    throw new PriceEngineError('invalid-window', 'A closed demand window is invalid.');
  }
  requireTimestamp(window.closedAt, 'window closedAt');
  return window;
}

function requireProcessingState(snapshot, windowId, config) {
  if (
    !snapshot.exists
    || snapshot.data()?.status !== 'open'
    || snapshot.data()?.processingPriceWindowId !== windowId
    || snapshot.data()?.configVersion !== config.configVersion
  ) {
    throw new PriceEngineError('invalid-state', 'Market state is not processing this window.');
  }
}

function requireVersion(snapshot, windowId, config) {
  const version = requireBasicVersion(snapshot, windowId);
  if (
    version.configVersion !== config.configVersion
    || version.expectedClubCount !== EXPECTED_CLUB_COUNT
    || version.status !== 'computing'
  ) {
    throw new PriceEngineError('invalid-version', 'Price version configuration is invalid.');
  }
  return version;
}

function requireBasicVersion(snapshot, windowId) {
  if (!snapshot.exists || snapshot.data()?.windowId !== windowId) {
    throw new PriceEngineError('invalid-version', 'Price version is missing or invalid.');
  }
  return snapshot.data();
}

function requireCompletedRun(snapshot, clubId, windowId, config) {
  if (!snapshot.exists) {
    throw new PriceEngineError('incomplete-version', 'A price run is missing.');
  }
  const run = snapshot.data();
  if (
    run.clubId !== clubId
    || run.windowId !== windowId
    || run.configVersion !== config.configVersion
    || run.status !== 'completed'
    || stableDigest(run.input) !== run.inputDigest
    || !run.result
  ) {
    throw new PriceEngineError('invalid-run-state', 'A completed price run is invalid.');
  }
  return run;
}

function toClubInput(snapshot, clubId, config) {
  if (!snapshot.exists || snapshot.data()?.id !== clubId) {
    throw new PriceEngineError('invalid-catalog', 'A club input is missing.');
  }
  const club = snapshot.data();
  if (club.issuedShares !== config.issuedShares) {
    throw new PriceEngineError('invalid-catalog', 'A club has a per-club issuedShares override.');
  }
  return Object.freeze(Object.fromEntries([
    'currentPrice',
    'fundamentalPrice',
    'previousClose',
    'issuedShares',
    'buyVolume',
    'sellVolume',
    'totalVolume',
    'isActive',
    'tradingStatus',
  ].map((field) => [field, club[field]])));
}

function toRatingInput(snapshot, clubId) {
  if (!snapshot.exists || snapshot.data()?.clubId !== clubId) {
    return null;
  }
  const rating = snapshot.data();
  return Object.freeze({
    averageRatingMilli: rating.averageRatingMilli,
    ratingCount: rating.ratingCount,
    ratingRecentDeltaMilli: rating.ratingRecentDeltaMilli,
    lastRatingAtMs: rating.lastRatingAt === null
      ? null
      : timestampMillis(rating.lastRatingAt, 'rating lastRatingAt'),
  });
}

function toEventInput(snapshot) {
  const event = snapshot.data();
  if (!Array.isArray(event.targetClubIds) || event.targetClubIds.length > EXPECTED_CLUB_COUNT) {
    throw new PriceEngineError('invalid-input', 'Admin event targets are invalid.');
  }
  return Object.freeze({
    id: snapshot.id,
    status: event.status,
    impactType: event.impactType,
    impactBps: event.impactBps,
    startsAtMs: timestampMillis(event.startsAt, 'event startsAt'),
    endsAtMs: timestampMillis(event.endsAt, 'event endsAt'),
    targetClubIds: [...new Set(event.targetClubIds)].sort(),
  });
}

function aggregateShards(snapshots) {
  const total = Object.fromEntries(demandFields.map((field) => [field, 0]));
  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      continue;
    }
    const shard = snapshot.data();
    if (shard.schemaVersion !== 1) {
      throw new PriceEngineError('invalid-input', 'Demand shard schema is invalid.');
    }
    for (const field of demandFields) {
      requireSafeInteger(shard[field], `demand shard ${field}`, { minimum: 0 });
      total[field] = safeAdd(total[field], shard[field], `demand ${field}`);
    }
  }
  return Object.freeze(total);
}

function readHistory(snapshot, clubId, limit) {
  if (!snapshot.exists) {
    return [];
  }
  const history = snapshot.data();
  if (
    history.schemaVersion !== 1
    || history.clubId !== clubId
    || !Array.isArray(history.points)
    || history.points.length > limit
  ) {
    throw new PriceEngineError('invalid-history', 'Recent price history is invalid.');
  }
  return history.points;
}

function validateDocumentId(value, name) {
  if (typeof value !== 'string' || !value || value.length > 128 || value.includes('/')) {
    throw new PriceEngineError('invalid-state', `${name} is invalid.`);
  }
  return value;
}

function formatShardId(index, shardCount) {
  const width = Math.max(2, String(shardCount - 1).length);
  return String(index).padStart(width, '0');
}

function requireTimestamp(value, name) {
  timestampMillis(value, name);
  return value;
}

function timestampMillis(value, name) {
  if (!value || typeof value.toMillis !== 'function') {
    throw new PriceEngineError('invalid-input', `${name} is not a timestamp.`);
  }
  const milliseconds = value.toMillis();
  requireSafeInteger(milliseconds, name, { minimum: 0 });
  return milliseconds;
}
