import assert from 'node:assert/strict';
import test from 'node:test';

import { TradeError } from '../src/trades/errors.js';
import { createTradeService } from '../src/trades/trade-service.js';

const validAuth = Object.freeze({
  uid: 'trade-user',
  token: {
    email: 'student@students.example.test',
    email_verified: true,
    name: '거래 학생',
    firebase: { sign_in_provider: 'google.com' },
  },
});
const data = Object.freeze({
  clubId: 'mechanism',
  quantity: 1,
  idempotencyKey: 'service_trade_key_123456789',
});

function createService(side = 'buy') {
  const calls = [];
  const service = createTradeService({
    side,
    allowedDomain: 'students.example.test',
    repository: {
      async execute(command) {
        calls.push(command);
        return { ok: true, tradeId: command.tradeId };
      },
    },
  });
  return { calls, service };
}

test('service derives UID and side from the verified callable context', async () => {
  const { calls, service } = createService('buy');
  const result = await service({ auth: validAuth, data });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].uid, validAuth.uid);
  assert.equal(calls[0].side, 'buy');
  assert.equal(calls[0].clubId, 'mechanism');
  assert.equal(calls[0].quantity, 1);
  assert.equal(Object.hasOwn(calls[0], 'price'), false);
});

test('service rejects unauthenticated, unverified, non-Google, and external accounts', async () => {
  const { service } = createService();
  const cases = [
    null,
    { ...validAuth, token: { ...validAuth.token, email_verified: false } },
    { ...validAuth, token: { ...validAuth.token, email: 'student@example.com' } },
    {
      ...validAuth,
      token: { ...validAuth.token, firebase: { sign_in_provider: 'password' } },
    },
  ];

  for (const auth of cases) {
    await assert.rejects(
      service({ auth, data }),
      (error) => error instanceof TradeError
        && ['unauthenticated', 'permission-denied'].includes(error.code),
    );
  }
});

test('repository errors receive the safe deterministic request ID', async () => {
  const service = createTradeService({
    side: 'sell',
    allowedDomain: 'students.example.test',
    repository: {
      async execute() {
        throw new TradeError('insufficient-holdings', '부족');
      },
    },
  });

  await assert.rejects(
    service({ auth: validAuth, data }),
    (error) => error.code === 'insufficient-holdings'
      && typeof error.requestId === 'string'
      && error.requestId.length === 64,
  );
});
