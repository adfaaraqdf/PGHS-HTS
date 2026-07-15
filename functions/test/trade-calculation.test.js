import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateGrossAmount,
  calculateWeightedAverage,
  safeAdd,
} from '../src/trades/calculation.js';
import { TradeError } from '../src/trades/errors.js';
import { createTradeIdentifiers, selectDemandShard } from '../src/trades/identifiers.js';
import { parseTradeRequest } from '../src/trades/validation.js';

const validRequest = Object.freeze({
  clubId: 'mechanism',
  quantity: 3,
  idempotencyKey: 'trade_request_key_1234567890',
});

test('trade input accepts only clubId, quantity, and idempotencyKey', () => {
  assert.deepEqual(parseTradeRequest(validRequest), validRequest);
  assert.throws(
    () => parseTradeRequest({ ...validRequest, price: 10_000 }),
    (error) => error instanceof TradeError && error.code === 'invalid-argument',
  );
  assert.throws(
    () => parseTradeRequest({ clubId: 'mechanism', quantity: 1 }),
    (error) => error.code === 'invalid-argument',
  );
});

test('trade input rejects zero, negative, fractional, unsafe, and malformed values', () => {
  for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => parseTradeRequest({ ...validRequest, quantity }),
      (error) => error.code === 'invalid-quantity',
    );
  }
  assert.throws(
    () => parseTradeRequest({ ...validRequest, clubId: '../market/state' }),
    (error) => error.code === 'club-not-found',
  );
  assert.throws(
    () => parseTradeRequest({ ...validRequest, idempotencyKey: 'too-short' }),
    (error) => error.code === 'invalid-argument',
  );
});

test('money multiplication and weighted average use safe integer half-up math', () => {
  assert.equal(calculateGrossAmount(10_000, 3), 30_000);
  assert.equal(calculateWeightedAverage({
    oldQuantity: 1,
    oldAverageBuyPrice: 100,
    buyQuantity: 1,
    executionPrice: 101,
  }), 101);
  assert.equal(calculateWeightedAverage({
    oldQuantity: 2,
    oldAverageBuyPrice: 100,
    buyQuantity: 1,
    executionPrice: 101,
  }), 100);
  assert.throws(
    () => safeAdd(Number.MAX_SAFE_INTEGER, 1),
    (error) => error.code === 'invalid-quantity',
  );
});

test('request IDs are deterministic, UID-scoped, payload-bound, and shard-bounded', () => {
  const input = {
    uid: 'user-a',
    idempotencyKey: validRequest.idempotencyKey,
    side: 'buy',
    clubId: validRequest.clubId,
    quantity: validRequest.quantity,
  };
  const first = createTradeIdentifiers(input);
  const same = createTradeIdentifiers(input);
  const otherUser = createTradeIdentifiers({ ...input, uid: 'user-b' });
  const otherPayload = createTradeIdentifiers({ ...input, side: 'sell' });

  assert.deepEqual(first, same);
  assert.notEqual(first.requestId, otherUser.requestId);
  assert.equal(first.requestId, otherPayload.requestId);
  assert.notEqual(first.payloadDigest, otherPayload.payloadDigest);
  assert.equal(first.requestId.length, 64);
  assert.equal(first.idempotencyDigest.length, 64);

  const shard = selectDemandShard(first.requestId, 10);
  assert.ok(shard.index >= 0 && shard.index < 10);
  assert.match(shard.shardId, /^0[0-9]$/);
});
