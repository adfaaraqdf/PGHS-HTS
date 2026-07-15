import assert from 'node:assert/strict';
import test from 'node:test';

import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { createFirestorePriceCoordinator } from '../src/price/firestore-coordinator.js';

const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
if (!process.env.FIRESTORE_EMULATOR_HOST || !projectId?.startsWith('demo-')) {
  throw new Error('Price engine tests require a demo project and FIRESTORE_EMULATOR_HOST.');
}

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const firestore = getFirestore();
const tickTime = Timestamp.fromMillis(Date.UTC(2026, 6, 15, 3, 0, 30));
const initialWindowId = 'price-window-initial';
const clubIds = Array.from({ length: 20 }, (_, index) => `price-club-${index.toString().padStart(2, '0')}`);

const config = Object.freeze({
  schemaVersion: 1,
  configVersion: 1,
  issuedShares: 100_000,
  minPrice: 100,
  maxPrice: 1_000_000,
  demandShardCount: 10,
  priceTickSeconds: 60,
  maxPriceDelaySeconds: 120,
  maxTickChangeBps: 200,
  maxRatingContributionBps: 50,
  maxDemandContributionBps: 120,
  maxAdminContributionBps: 60,
  ratingPriorMeanMilli: 3_000,
  ratingPriorCount: 20,
  ratingScaleHalfRangeMilli: 2_000,
  ratingRecentFullScaleMilli: 1_000,
  ratingLevelWeightPermille: 700,
  ratingRecentWeightPermille: 300,
  demandLiquidityFloorShares: 100,
  ratingFreshMinutes: 10,
  ratingZeroMinutes: 30,
  priceHistoryLimit: 60,
  maxActiveAdminEvents: 50,
  ratioRoundingMode: 'half-up',
  boundedDeltaRoundingMode: 'toward-zero',
});

async function seedFixture() {
  for (const collection of await firestore.listCollections()) {
    await firestore.recursiveDelete(collection);
  }
  const batch = firestore.batch();
  batch.set(firestore.doc('market/config'), config);
  batch.set(firestore.doc('market/state'), {
    schemaVersion: 1,
    status: 'open',
    reason: null,
    activeDemandWindowId: initialWindowId,
    currentPriceWindowId: null,
    processingPriceWindowId: null,
    configVersion: 1,
    updatedAt: Timestamp.fromMillis(tickTime.toMillis() - 60_000),
  });
  for (const clubId of clubIds) {
    batch.set(firestore.doc(`clubs/${clubId}`), {
      schemaVersion: 1,
      id: clubId,
      isActive: true,
      tradingStatus: 'open',
      currentPrice: 10_000,
      fundamentalPrice: 10_000,
      previousClose: 10_000,
      issuedShares: 100_000,
      buyVolume: 0,
      sellVolume: 0,
      totalVolume: 0,
      priceCalculatedAt: Timestamp.fromMillis(tickTime.toMillis() - 60_000),
      updatedAt: Timestamp.fromMillis(tickTime.toMillis() - 60_000),
    });
    batch.set(firestore.doc(`ratings/${clubId}`), {
      schemaVersion: 1,
      clubId,
      averageRatingMilli: 3_000,
      ratingCount: 0,
      ratingRecentDeltaMilli: 0,
      lastRatingAt: null,
    });
    batch.set(firestore.doc(`marketDemand/${clubId}/windows/${initialWindowId}`), {
      schemaVersion: 1,
      clubId,
      windowId: initialWindowId,
      status: 'open',
      shardCount: 10,
      configVersion: 1,
      openedAt: Timestamp.fromMillis(tickTime.toMillis() - 60_000),
      closedAt: null,
      appliedAt: null,
    });
  }
  batch.set(firestore.doc(`marketDemand/${clubIds[0]}/windows/${initialWindowId}/shards/00`), {
    schemaVersion: 1,
    buyQuantity: 100,
    sellQuantity: 0,
    buyTradeCount: 2,
    sellTradeCount: 0,
    grossBuyAmount: 1_000_000,
    grossSellAmount: 0,
    updatedAt: tickTime,
  });
  batch.set(firestore.doc(`marketDemand/${clubIds[1]}/windows/${initialWindowId}/shards/09`), {
    schemaVersion: 1,
    buyQuantity: 0,
    sellQuantity: 100,
    buyTradeCount: 0,
    sellTradeCount: 2,
    grossBuyAmount: 0,
    grossSellAmount: 1_000_000,
    updatedAt: tickTime,
  });
  batch.set(firestore.doc('adminEvents/price-positive'), {
    schemaVersion: 1,
    title: 'price test',
    status: 'active',
    impactType: 'positive',
    impactBps: 30,
    targetClubIds: [clubIds[0]],
    startsAt: Timestamp.fromMillis(tickTime.toMillis() - 10_000),
    endsAt: Timestamp.fromMillis(tickTime.toMillis() + 60_000),
  });
  await batch.commit();
}

test('partial failure resumes one window and publishes all 20 prices exactly once', async () => {
  await seedFixture();
  let completed = 0;
  const interrupted = createFirestorePriceCoordinator({
    firestore,
    now: () => tickTime,
    ownerId: 'price-owner-interrupted',
    afterRunCompleted: () => {
      completed += 1;
      if (completed === 5) {
        throw new Error('simulated function termination');
      }
    },
  });
  await assert.rejects(interrupted.run(), /simulated function termination/);

  const beforePublish = await Promise.all(clubIds.map((clubId) => firestore.doc(`clubs/${clubId}`).get()));
  const stateDuringRetry = await firestore.doc('market/state').get();
  assert.ok(beforePublish.every((snapshot) => snapshot.data().currentPrice === 10_000));
  assert.equal(stateDuringRetry.data().processingPriceWindowId, initialWindowId);

  const recovered = await createFirestorePriceCoordinator({
    firestore,
    now: () => tickTime,
    ownerId: 'price-owner-recovery',
  }).run();
  assert.equal(recovered.status, 'published');
  assert.equal(recovered.windowId, initialWindowId);

  const [state, version, oldWindows, runs, clubs, histories] = await Promise.all([
    firestore.doc('market/state').get(),
    firestore.doc(`priceVersions/${initialWindowId}`).get(),
    Promise.all(clubIds.map((clubId) => (
      firestore.doc(`marketDemand/${clubId}/windows/${initialWindowId}`).get()
    ))),
    Promise.all(clubIds.map((clubId) => (
      firestore.doc(`priceRuns/${initialWindowId}_${clubId}`).get()
    ))),
    Promise.all(clubIds.map((clubId) => firestore.doc(`clubs/${clubId}`).get())),
    Promise.all(clubIds.map((clubId) => firestore.doc(`priceHistory/${clubId}`).get())),
  ]);
  assert.equal(state.data().processingPriceWindowId, null);
  assert.equal(state.data().currentPriceWindowId, initialWindowId);
  assert.equal(version.data().status, 'published');
  assert.equal(version.data().completedClubCount, 20);
  assert.ok(oldWindows.every((snapshot) => snapshot.data().status === 'applied'));
  assert.ok(runs.every((snapshot) => snapshot.data().status === 'completed'));
  assert.ok(runs.every((snapshot) => snapshot.data().attemptCount === 1));
  assert.equal(clubs[0].data().currentPrice, 10_150);
  assert.equal(clubs[0].data().buyVolume, 100);
  assert.equal(clubs[1].data().currentPrice, 9_880);
  assert.ok(clubs.slice(2).every((snapshot) => snapshot.data().currentPrice === 10_000));
  assert.ok(clubs.every((snapshot) => snapshot.data().lastPriceWindowId === initialWindowId));
  assert.ok(histories.every((snapshot) => snapshot.data().points.length === 1));

  const duplicate = await createFirestorePriceCoordinator({
    firestore,
    now: () => tickTime,
    ownerId: 'price-owner-duplicate',
  }).run();
  assert.equal(duplicate.status, 'waiting');
  const firstClubAfterDuplicate = await firestore.doc(`clubs/${clubIds[0]}`).get();
  assert.equal(firstClubAfterDuplicate.data().currentPrice, 10_150);
  assert.equal(firstClubAfterDuplicate.data().buyVolume, 100);
});

test('an unexpired lease fences a competing coordinator without changing prices', async () => {
  await firestore.doc('serviceLeases/price-coordinator').set({
    schemaVersion: 1,
    ownerId: 'price-owner-current',
    fencingToken: 999,
    leaseExpiresAt: Timestamp.fromMillis(tickTime.toMillis() + 60_000),
    updatedAt: tickTime,
  });
  const result = await createFirestorePriceCoordinator({
    firestore,
    now: () => tickTime,
    ownerId: 'price-owner-competitor',
  }).run();
  assert.equal(result.status, 'busy');
  const firstClub = await firestore.doc(`clubs/${clubIds[0]}`).get();
  assert.equal(firstClub.data().currentPrice, 10_150);
});

test('a halted market does not rotate or publish a new price window', async () => {
  await firestore.doc('serviceLeases/price-coordinator').set({
    schemaVersion: 1,
    ownerId: 'expired-owner',
    fencingToken: 1_000,
    leaseExpiresAt: Timestamp.fromMillis(tickTime.toMillis() - 1),
    updatedAt: tickTime,
  });
  await firestore.doc('market/state').update({ status: 'halted' });
  const stateBefore = await firestore.doc('market/state').get();
  const result = await createFirestorePriceCoordinator({
    firestore,
    now: () => tickTime,
    ownerId: 'price-owner-halted-market',
  }).run();
  const stateAfter = await firestore.doc('market/state').get();
  assert.equal(result.status, 'market-closed');
  assert.equal(stateAfter.data().activeDemandWindowId, stateBefore.data().activeDemandWindowId);
  assert.equal(stateAfter.data().currentPriceWindowId, initialWindowId);
});

test.after(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});
