import assert from 'node:assert/strict';
import test from 'node:test';

import { ClientTradeError } from '../src/services/trading.js';
import { createTradeController } from '../src/state/trade-controller.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

test('trade controller blocks a repeated button action until the request settles', async () => {
  const request = deferred();
  const calls = [];
  const controller = createTradeController({
    async buy(input) { calls.push(input); return request.promise; },
    async sell() { throw new Error('unexpected'); },
  }, { createIdempotencyKey: () => 'client_generated_key_123456' });

  const first = controller.buy({ clubId: 'mechanism', quantity: 1 });
  assert.equal(controller.isPending('buy', 'mechanism'), true);
  await assert.rejects(
    controller.buy({ clubId: 'mechanism', quantity: 1 }),
    (error) => error.reason === 'request-in-progress',
  );
  assert.equal(calls.length, 1);

  request.resolve({ ok: true });
  assert.deepEqual(await first, { ok: true });
  assert.equal(controller.isPending('buy', 'mechanism'), false);
});

test('trade controller preserves the idempotency key for an explicit retry', async () => {
  const keys = [];
  let attempts = 0;
  const controller = createTradeController({
    async buy(input) {
      keys.push(input.idempotencyKey);
      attempts += 1;
      if (attempts === 1) {
        throw new ClientTradeError('internal', '응답 유실', { retryable: true });
      }
      return { ok: true };
    },
    async sell() { throw new Error('unexpected'); },
  }, { createIdempotencyKey: () => 'response_loss_key_123456789' });

  let retryKey;
  await assert.rejects(
    controller.buy({ clubId: 'mechanism', quantity: 1 }),
    (error) => {
      retryKey = error.idempotencyKey;
      return error.retryable === true;
    },
  );
  const result = await controller.buy({
    clubId: 'mechanism',
    quantity: 1,
    idempotencyKey: retryKey,
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(keys, ['response_loss_key_123456789', 'response_loss_key_123456789']);
});
