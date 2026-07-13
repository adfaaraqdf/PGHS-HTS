import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthInitializationError } from '../src/auth/errors.js';
import { INITIAL_CASH, createUserInitializationService } from '../src/auth/user-initialization.js';

const validAuth = {
  uid: 'uid-1',
  token: {
    email: 'student@students.example.test',
    email_verified: true,
    name: '테스트 학생',
    firebase: { sign_in_provider: 'google.com' },
  },
};

function createAtomicFakeRepository() {
  const users = new Map();
  let queue = Promise.resolve();

  return {
    users,
    initialize(input) {
      const operation = queue.then(async () => {
        const existing = users.get(input.identity.uid);
        if (existing) {
          if (existing.accountStatus !== 'active') {
            throw new AuthInitializationError('permission-denied', 'disabled', 'account-disabled');
          }
          existing.displayName = input.identity.displayName;
          existing.loginCount += 1;
          return { ...existing, wasCreated: false };
        }

        if (!input.nickname) {
          throw new AuthInitializationError(
            'failed-precondition',
            'nickname required',
            'nickname-required',
          );
        }

        const created = {
          uid: input.identity.uid,
          displayName: input.identity.displayName,
          nickname: input.nickname,
          cash: INITIAL_CASH,
          estimatedTotalAsset: INITIAL_CASH,
          accountStatus: 'active',
          initialGrantApplied: true,
          loginCount: 1,
        };
        users.set(input.identity.uid, created);
        return { ...created, wasCreated: true };
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}

function createClaimService({ failFirst = false } = {}) {
  let verified = false;
  let attempts = 0;
  let writes = 0;

  return {
    get attempts() { return attempts; },
    get writes() { return writes; },
    async ensureSchoolVerified() {
      attempts += 1;
      if (failFirst && attempts === 1) {
        throw new Error('injected claim failure');
      }
      if (!verified) {
        verified = true;
        writes += 1;
      }
    },
  };
}

function createService(repository, claimService) {
  return createUserInitializationService({
    repository,
    claimService,
    allowedDomain: 'students.example.test',
  });
}

test('first login grants exactly 1,000,000 KRW and re-login reuses the user', async () => {
  const repository = createAtomicFakeRepository();
  const claimService = createClaimService();
  const initialize = createService(repository, claimService);

  const first = await initialize({ auth: validAuth, data: { nickname: '축제학생' } });
  const second = await initialize({ auth: validAuth, data: {} });

  assert.equal(first.wasCreated, true);
  assert.equal(second.wasCreated, false);
  assert.equal(second.user.cash, INITIAL_CASH);
  assert.equal(repository.users.size, 1);
  assert.equal(repository.users.get(validAuth.uid).loginCount, 2);
  assert.equal(claimService.writes, 1);
});

test('twenty concurrent initialization calls create one user and one initial grant', async () => {
  const repository = createAtomicFakeRepository();
  const claimService = createClaimService();
  const initialize = createService(repository, claimService);

  const results = await Promise.all(
    Array.from({ length: 20 }, () => initialize({
      auth: validAuth,
      data: { nickname: '동시학생' },
    })),
  );

  assert.equal(results.filter((result) => result.wasCreated).length, 1);
  assert.equal(repository.users.size, 1);
  assert.equal(repository.users.get(validAuth.uid).cash, INITIAL_CASH);
  assert.equal(repository.users.get(validAuth.uid).initialGrantApplied, true);
  assert.equal(claimService.writes, 1);
});

test('a claim failure after the transaction is retryable without another grant', async () => {
  const repository = createAtomicFakeRepository();
  const claimService = createClaimService({ failFirst: true });
  const initialize = createService(repository, claimService);

  await assert.rejects(
    initialize({ auth: validAuth, data: { nickname: '재시도학생' } }),
    /injected claim failure/,
  );
  const retry = await initialize({ auth: validAuth, data: {} });

  assert.equal(retry.wasCreated, false);
  assert.equal(retry.user.cash, INITIAL_CASH);
  assert.equal(repository.users.size, 1);
  assert.equal(claimService.attempts, 2);
  assert.equal(claimService.writes, 1);
});

test('a new user without a nickname is asked to complete onboarding', async () => {
  const initialize = createService(createAtomicFakeRepository(), createClaimService());

  await assert.rejects(
    initialize({ auth: validAuth, data: {} }),
    (error) => error.reason === 'nickname-required',
  );
});

test('a disabled existing account cannot initialize again', async () => {
  const repository = createAtomicFakeRepository();
  const initialize = createService(repository, createClaimService());
  await initialize({ auth: validAuth, data: { nickname: '정상학생' } });
  repository.users.get(validAuth.uid).accountStatus = 'disabled';

  await assert.rejects(
    initialize({ auth: validAuth, data: {} }),
    (error) => error.reason === 'account-disabled',
  );
});
