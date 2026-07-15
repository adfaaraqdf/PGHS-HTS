import assert from 'node:assert/strict';
import test from 'node:test';

import { createTradeHandler } from '../src/trades/callable.js';
import { TradeError } from '../src/trades/errors.js';

const request = Object.freeze({
  auth: {
    uid: 'callable-user',
    token: {
      email: 'callable-user@students.example.test',
      email_verified: true,
      name: '호출 학생',
      firebase: { sign_in_provider: 'google.com' },
    },
  },
  data: {
    clubId: 'mechanism',
    quantity: 1,
    idempotencyKey: 'callable_trade_key_123456789',
  },
});

test('callable handler returns the repository result for an authenticated school user', async () => {
  const handler = createTradeHandler({
    side: 'buy',
    allowedDomain: 'students.example.test',
    repository: {
      async execute(command) {
        return { ok: true, side: command.side, uid: command.uid };
      },
    },
  });

  assert.deepEqual(await handler(request), {
    ok: true,
    side: 'buy',
    uid: 'callable-user',
  });
});

test('callable handler exposes only stable reason, retry flag, and request ID', async () => {
  const handler = createTradeHandler({
    side: 'sell',
    allowedDomain: 'students.example.test',
    repository: {
      async execute() {
        throw new TradeError('insufficient-holdings', '보유 수량이 부족합니다.', {
          retryable: false,
          requestId: 'safe-request-id',
        });
      },
    },
  });

  await assert.rejects(handler(request), (error) => {
    assert.equal(error.code, 'failed-precondition');
    assert.deepEqual(error.details, {
      reason: 'insufficient-holdings',
      retryable: false,
      requestId: 'safe-request-id',
    });
    assert.equal(String(error).includes('callable-user'), false);
    return true;
  });
});
