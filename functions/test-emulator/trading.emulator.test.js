import assert from 'node:assert/strict';
import test from 'node:test';

import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { createFirestoreTradeRepository } from '../src/trades/firestore-repository.js';
import { createTradeService } from '../src/trades/trade-service.js';

const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
if (!process.env.FIRESTORE_EMULATOR_HOST || !projectId?.startsWith('demo-')) {
  throw new Error('Trade integration tests require a demo project and FIRESTORE_EMULATOR_HOST.');
}

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const firestore = getFirestore();
let fixtureNumber = 0;

function auth(uid) {
  return {
    uid,
    token: {
      email: `${uid}@students.example.test`,
      email_verified: true,
      name: `거래 학생 ${uid}`,
      firebase: { sign_in_provider: 'google.com' },
    },
  };
}

function key(label) {
  return `trade_${label}_${'x'.repeat(24)}`;
}

async function createFixture({
  cash = 1_000_000,
  holdingQuantity = 0,
  averageBuyPrice = 10_000,
  maxOrderQuantity = 100,
  price = 10_000,
  priceCalculatedAt = Timestamp.now(),
  marketStatus = 'open',
  clubStatus = 'open',
  isActive = true,
  userCount = 1,
  createWindow = true,
} = {}) {
  fixtureNumber += 1;
  const suffix = `${process.pid}-${fixtureNumber}`;
  const clubId = `trade-club-${suffix}`;
  const windowId = `trade-window-${suffix}`;
  const uids = Array.from({ length: userCount }, (_, index) => `trade-user-${suffix}-${index}`);
  const now = Timestamp.now();

  const writes = [
    firestore.doc('market/config').set({
      schemaVersion: 1,
      configVersion: 1,
      demandShardCount: 10,
      minPrice: 100,
      maxPriceDelaySeconds: 120,
      maxOrderQuantity,
    }),
    firestore.doc('market/state').set({
      schemaVersion: 1,
      status: marketStatus,
      activeDemandWindowId: windowId,
      configVersion: 1,
      updatedAt: now,
    }),
    firestore.doc(`clubs/${clubId}`).set({
      schemaVersion: 1,
      id: clubId,
      isActive,
      tradingStatus: clubStatus,
      currentPrice: price,
      priceCalculatedAt,
      updatedAt: now,
    }),
    ...uids.map((uid) => firestore.doc(`users/${uid}`).set({
      schemaVersion: 1,
      uid,
      cash,
      accountStatus: 'active',
      updatedAt: now,
    })),
  ];

  if (createWindow) {
    writes.push(firestore.doc(`marketDemand/${clubId}/windows/${windowId}`).set({
      schemaVersion: 1,
      clubId,
      windowId,
      status: 'open',
      shardCount: 10,
      configVersion: 1,
      openedAt: now,
      closedAt: null,
      appliedAt: null,
    }));
  }

  if (holdingQuantity > 0) {
    writes.push(...uids.map((uid) => firestore.doc(`users/${uid}/holdings/${clubId}`).set({
      schemaVersion: 1,
      clubId,
      quantity: holdingQuantity,
      averageBuyPrice,
      updatedAt: now,
    })));
  }

  await Promise.all(writes);
  return { clubId, uids, windowId };
}

function createService(side, repository = createFirestoreTradeRepository({ firestore })) {
  return createTradeService({
    side,
    repository,
    allowedDomain: 'students.example.test',
  });
}

function execute(service, uid, clubId, quantity, idempotencyKey) {
  return service({
    auth: auth(uid),
    data: { clubId, quantity, idempotencyKey },
  });
}

async function getDemandTotals(clubId, windowId) {
  const snapshots = await firestore
    .collection(`marketDemand/${clubId}/windows/${windowId}/shards`)
    .get();
  return snapshots.docs.reduce((total, snapshot) => {
    const shard = snapshot.data();
    return {
      documentCount: total.documentCount + 1,
      buyQuantity: total.buyQuantity + shard.buyQuantity,
      sellQuantity: total.sellQuantity + shard.sellQuantity,
      buyTradeCount: total.buyTradeCount + shard.buyTradeCount,
      sellTradeCount: total.sellTradeCount + shard.sellTradeCount,
    };
  }, {
    documentCount: 0,
    buyQuantity: 0,
    sellQuantity: 0,
    buyTradeCount: 0,
    sellTradeCount: 0,
  });
}

test('buy atomically uses server price and replays a lost response without another effect', async () => {
  const fixture = await createFixture({ price: 12_345 });
  const [uid] = fixture.uids;
  const buy = createService('buy');
  const requestKey = key(`response-loss-${fixtureNumber}`);

  const first = await execute(buy, uid, fixture.clubId, 3, requestKey);
  const replay = await execute(buy, uid, fixture.clubId, 3, requestKey);
  await assert.rejects(
    execute(buy, uid, fixture.clubId, 2, requestKey),
    (error) => error.code === 'duplicate-request',
  );
  const [user, holding, trade, tradeRequest, history, demand] = await Promise.all([
    firestore.doc(`users/${uid}`).get(),
    firestore.doc(`users/${uid}/holdings/${fixture.clubId}`).get(),
    firestore.doc(`trades/${first.tradeId}`).get(),
    firestore.doc(`tradeRequests/${first.tradeId}`).get(),
    firestore.doc(`users/${uid}/tradeHistory/${first.tradeId}`).get(),
    getDemandTotals(fixture.clubId, fixture.windowId),
  ]);

  assert.deepEqual(replay, first);
  assert.equal(first.executionPrice, 12_345);
  assert.equal(first.grossAmount, 37_035);
  assert.equal(user.data().cash, 962_965);
  assert.equal(holding.data().quantity, 3);
  assert.equal(holding.data().averageBuyPrice, 12_345);
  assert.equal(trade.exists, true);
  assert.equal(tradeRequest.data().status, 'succeeded');
  assert.equal(history.exists, true);
  assert.deepEqual(demand, {
    documentCount: 1,
    buyQuantity: 3,
    sellQuantity: 0,
    buyTradeCount: 1,
    sellTradeCount: 0,
  });
});

test('buy uses half-up weighted average; partial sell preserves it; full sell deletes holding', async () => {
  const fixture = await createFixture({
    cash: 50_000,
    holdingQuantity: 1,
    averageBuyPrice: 10_001,
    price: 10_000,
  });
  const [uid] = fixture.uids;
  const buy = createService('buy');
  const sell = createService('sell');

  await execute(buy, uid, fixture.clubId, 1, key(`average-buy-${fixtureNumber}`));
  let holding = await firestore.doc(`users/${uid}/holdings/${fixture.clubId}`).get();
  assert.equal(holding.data().quantity, 2);
  assert.equal(holding.data().averageBuyPrice, 10_001);

  await execute(sell, uid, fixture.clubId, 1, key(`partial-sell-${fixtureNumber}`));
  holding = await firestore.doc(`users/${uid}/holdings/${fixture.clubId}`).get();
  assert.equal(holding.data().quantity, 1);
  assert.equal(holding.data().averageBuyPrice, 10_001);

  const fullSale = await execute(sell, uid, fixture.clubId, 1, key(`full-sell-${fixtureNumber}`));
  holding = await firestore.doc(`users/${uid}/holdings/${fixture.clubId}`).get();
  assert.equal(holding.exists, false);
  assert.equal(fullSale.holdingQuantityAfter, 0);
  assert.equal(fullSale.averageBuyPriceAfter, null);
});

test('twenty simultaneous calls with the same key create one trade and one asset effect', async () => {
  const fixture = await createFixture({ cash: 100_000 });
  const [uid] = fixture.uids;
  const buy = createService('buy');
  const requestKey = key(`same-key-${fixtureNumber}`);

  const results = await Promise.all(Array.from(
    { length: 20 },
    () => execute(buy, uid, fixture.clubId, 1, requestKey),
  ));
  const [user, holding, trades, demand] = await Promise.all([
    firestore.doc(`users/${uid}`).get(),
    firestore.doc(`users/${uid}/holdings/${fixture.clubId}`).get(),
    firestore.collection('trades').where('uid', '==', uid).get(),
    getDemandTotals(fixture.clubId, fixture.windowId),
  ]);

  assert.equal(new Set(results.map((result) => result.tradeId)).size, 1);
  assert.equal(user.data().cash, 90_000);
  assert.equal(holding.data().quantity, 1);
  assert.equal(trades.size, 1);
  assert.equal(demand.buyQuantity, 1);
  assert.equal(demand.buyTradeCount, 1);
});

test('different keys at cash and holding boundaries serialize without negative values', async () => {
  const buyFixture = await createFixture({ cash: 15_000 });
  const [buyUid] = buyFixture.uids;
  const buy = createService('buy');
  const buyResults = await Promise.allSettled([
    execute(buy, buyUid, buyFixture.clubId, 1, key(`cash-a-${fixtureNumber}`)),
    execute(buy, buyUid, buyFixture.clubId, 1, key(`cash-b-${fixtureNumber}`)),
  ]);
  const buyUser = await firestore.doc(`users/${buyUid}`).get();
  const buyHolding = await firestore.doc(`users/${buyUid}/holdings/${buyFixture.clubId}`).get();

  assert.equal(buyResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    buyResults.find((result) => result.status === 'rejected').reason.code,
    'insufficient-funds',
  );
  assert.equal(buyUser.data().cash, 5_000);
  assert.equal(buyHolding.data().quantity, 1);

  const sellFixture = await createFixture({ cash: 0, holdingQuantity: 1 });
  const [sellUid] = sellFixture.uids;
  const sell = createService('sell');
  const sellResults = await Promise.allSettled([
    execute(sell, sellUid, sellFixture.clubId, 1, key(`holding-a-${fixtureNumber}`)),
    execute(sell, sellUid, sellFixture.clubId, 1, key(`holding-b-${fixtureNumber}`)),
  ]);
  const sellUser = await firestore.doc(`users/${sellUid}`).get();
  const sellHolding = await firestore.doc(`users/${sellUid}/holdings/${sellFixture.clubId}`).get();

  assert.equal(sellResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    sellResults.find((result) => result.status === 'rejected').reason.code,
    'insufficient-holdings',
  );
  assert.equal(sellUser.data().cash, 10_000);
  assert.equal(sellHolding.exists, false);
});

test('twenty users buying one club update bounded demand shards without a club hot write', async () => {
  const fixture = await createFixture({ cash: 20_000, userCount: 20 });
  const buy = createService('buy');
  const clubBefore = await firestore.doc(`clubs/${fixture.clubId}`).get();

  await Promise.all(fixture.uids.map((uid, index) => execute(
    buy,
    uid,
    fixture.clubId,
    1,
    key(`popular-${fixtureNumber}-${index}`),
  )));
  const [demand, clubAfter] = await Promise.all([
    getDemandTotals(fixture.clubId, fixture.windowId),
    firestore.doc(`clubs/${fixture.clubId}`).get(),
  ]);

  assert.equal(demand.buyQuantity, 20);
  assert.equal(demand.buyTradeCount, 20);
  assert.ok(demand.documentCount > 1 && demand.documentCount <= 10);
  assert.deepEqual(clubAfter.data(), clubBefore.data());
});

test('simultaneous buy and sell preserve the per-user cash and holding invariant', async () => {
  const fixture = await createFixture({ cash: 10_000, holdingQuantity: 1 });
  const [uid] = fixture.uids;
  const buy = createService('buy');
  const sell = createService('sell');

  const results = await Promise.all([
    execute(buy, uid, fixture.clubId, 1, key(`mixed-buy-${fixtureNumber}`)),
    execute(sell, uid, fixture.clubId, 1, key(`mixed-sell-${fixtureNumber}`)),
  ]);
  const [user, holding, trades] = await Promise.all([
    firestore.doc(`users/${uid}`).get(),
    firestore.doc(`users/${uid}/holdings/${fixture.clubId}`).get(),
    firestore.collection('trades').where('uid', '==', uid).get(),
  ]);

  assert.equal(results.length, 2);
  assert.equal(user.data().cash, 10_000);
  assert.equal(holding.data().quantity, 1);
  assert.equal(holding.data().averageBuyPrice, 10_000);
  assert.equal(trades.size, 2);
});

test('a trade arriving while the market halt transaction owns the state lock is rejected', async () => {
  const fixture = await createFixture({ cash: 20_000 });
  const [uid] = fixture.uids;
  let releaseHalt;
  let reportHaltLock;
  const haltLockAcquired = new Promise((resolve) => { reportHaltLock = resolve; });
  const release = new Promise((resolve) => { releaseHalt = resolve; });
  const haltTransaction = firestore.runTransaction(async (transaction) => {
    const stateRef = firestore.doc('market/state');
    await transaction.get(stateRef);
    transaction.update(stateRef, { status: 'halted', updatedAt: Timestamp.now() });
    reportHaltLock();
    await release;
  });
  await haltLockAcquired;

  const buy = createService('buy');
  const pendingTrade = execute(buy, uid, fixture.clubId, 1, key(`halt-race-${fixtureNumber}`));
  releaseHalt();
  await haltTransaction;

  await assert.rejects(pendingTrade, (error) => error.code === 'market-closed');
  const [user, holding, trades] = await Promise.all([
    firestore.doc(`users/${uid}`).get(),
    firestore.doc(`users/${uid}/holdings/${fixture.clubId}`).get(),
    firestore.collection('trades').where('uid', '==', uid).get(),
  ]);
  assert.equal(user.data().cash, 20_000);
  assert.equal(holding.exists, false);
  assert.equal(trades.size, 0);
});

test('invalid market, club, price, quantity, account, and window states fail without partial writes', async () => {
  const fixture = await createFixture({ cash: 100_000, maxOrderQuantity: 5 });
  const [uid] = fixture.uids;
  const buy = createService('buy');

  await assert.rejects(
    execute(buy, uid, fixture.clubId, 6, key(`too-large-${fixtureNumber}`)),
    (error) => error.code === 'invalid-quantity',
  );
  await assert.rejects(
    execute(buy, uid, 'missing-club', 1, key(`missing-${fixtureNumber}`)),
    (error) => error.code === 'club-not-found',
  );

  await firestore.doc(`clubs/${fixture.clubId}`).update({ isActive: false });
  await assert.rejects(
    execute(buy, uid, fixture.clubId, 1, key(`inactive-${fixtureNumber}`)),
    (error) => error.code === 'trading-halted',
  );
  await firestore.doc(`clubs/${fixture.clubId}`).update({
    isActive: true,
    tradingStatus: 'halted',
  });
  await assert.rejects(
    execute(buy, uid, fixture.clubId, 1, key(`club-halted-${fixtureNumber}`)),
    (error) => error.code === 'trading-halted',
  );
  await firestore.doc(`clubs/${fixture.clubId}`).update({
    isActive: true,
    tradingStatus: 'open',
    priceCalculatedAt: Timestamp.fromMillis(Date.now() - 121_000),
  });
  await assert.rejects(
    execute(buy, uid, fixture.clubId, 1, key(`stale-${fixtureNumber}`)),
    (error) => error.code === 'price-stale',
  );
  await firestore.doc(`clubs/${fixture.clubId}`).update({ priceCalculatedAt: Timestamp.now() });
  await firestore.doc('market/config').update({ maxOrderQuantity: null });
  await assert.rejects(
    execute(buy, uid, fixture.clubId, 1, key(`missing-limit-${fixtureNumber}`)),
    (error) => error.code === 'internal',
  );
  await firestore.doc('market/config').update({ maxOrderQuantity: 5 });
  await firestore.doc(`users/${uid}`).update({ accountStatus: 'suspended' });
  await assert.rejects(
    execute(buy, uid, fixture.clubId, 1, key(`disabled-${fixtureNumber}`)),
    (error) => error.code === 'account-disabled',
  );
  await firestore.doc(`users/${uid}`).update({ accountStatus: 'active' });
  await firestore.doc(`marketDemand/${fixture.clubId}/windows/${fixture.windowId}`).delete();
  await assert.rejects(
    execute(buy, uid, fixture.clubId, 1, key(`no-window-${fixtureNumber}`)),
    (error) => error.code === 'market-closed',
  );

  const [user, holding, trades] = await Promise.all([
    firestore.doc(`users/${uid}`).get(),
    firestore.doc(`users/${uid}/holdings/${fixture.clubId}`).get(),
    firestore.collection('trades').where('uid', '==', uid).get(),
  ]);
  assert.equal(user.data().cash, 100_000);
  assert.equal(holding.exists, false);
  assert.equal(trades.size, 0);
});

test.after(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});
