import assert from 'node:assert/strict';
import test from 'node:test';

import { ClientTradeError, createTradingService } from '../src/services/trading.js';
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

test('Supabase trading service sends only the three allowed RPC arguments', async () => {
  const calls = [];
  const service = createTradingService({
    supabase: {
      async rpc(name, args) {
        calls.push({ args, name });
        return {
          data: {
            trade_id: 'trade-id', club_id: 'mechanism', side: 'buy', quantity: 2,
            execution_price: 10000, gross_amount: 20000, cash_after: 980000,
            holding_quantity_after: 2, average_buy_price_after: 10000,
          },
          error: null,
        };
      },
    },
  });

  const result = await service.buy({
    clubId: 'mechanism', quantity: 2, idempotencyKey: 'allowed_key_123456789',
    price: 1, uid: 'forged-user',
  });

  assert.deepEqual(calls, [{
    name: 'buy_stock',
    args: {
      p_club_id: 'mechanism',
      p_quantity: 2,
      p_idempotency_key: 'allowed_key_123456789',
    },
  }]);
  assert.equal(result.executionPrice, 10000);
});

test('Supabase RPC errors map to stable client trade messages', async () => {
  const service = createTradingService({
    supabase: { rpc: async () => ({ data: null, error: { message: 'insufficient-funds' } }) },
  });
  await assert.rejects(
    service.buy({ clubId: 'mechanism', quantity: 1, idempotencyKey: 'allowed_key_123456789' }),
    (error) => error instanceof ClientTradeError && error.reason === 'insufficient-funds',
  );
});
