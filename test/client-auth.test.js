import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ClientAuthError,
  assertSchoolAccountForUx,
} from '../src/auth/client-policy.js';
import { createAuthController } from '../src/state/auth-controller.js';
import { createAuthService } from '../src/services/auth.js';

const schoolUser = {
  email: 'student@students.example.test',
  emailVerified: true,
};

const flushTasks = () => new Promise((resolve) => setTimeout(resolve, 0));

test('client UX check uses exact domain and verified-email matching', () => {
  assert.doesNotThrow(() => assertSchoolAccountForUx(schoolUser, 'students.example.test'));
  assert.throws(
    () => assertSchoolAccountForUx({
      email: 'student@students.example.test.evil',
      emailVerified: true,
    }, 'students.example.test'),
    ClientAuthError,
  );
  assert.throws(
    () => assertSchoolAccountForUx({ ...schoolUser, emailVerified: false }, 'students.example.test'),
    ClientAuthError,
  );
});

test('auth controller restores a session and logs out cleanly', async () => {
  let authListener;
  const authService = {
    completeRedirect: async () => {},
    subscribe(listener) { authListener = listener; return () => {}; },
    getPendingNickname: () => '',
    clearPendingNickname: () => {},
    initializeCurrentUser: async () => ({
      user: { nickname: '재로그인학생', cash: 1_000_000, accountStatus: 'active' },
    }),
    logout: async () => authListener(null),
  };
  const controller = createAuthController(authService);
  await controller.start();

  authListener(schoolUser);
  await flushTasks();
  assert.equal(controller.getState().status, 'authenticated');
  assert.equal(controller.getState().profile.nickname, '재로그인학생');

  await controller.logout();
  assert.equal(controller.getState().status, 'signed-out');
});

test('auth controller shows nickname completion and access denial states', async () => {
  let authListener;
  let needsNickname = true;
  const authService = {
    completeRedirect: async () => {},
    subscribe(listener) { authListener = listener; return () => {}; },
    getPendingNickname: () => '',
    clearPendingNickname: () => {},
    initializeCurrentUser: async (_user, nickname) => {
      if (needsNickname && !nickname) {
        throw new ClientAuthError('nickname-required', '닉네임 필요');
      }
      needsNickname = false;
      return { user: { nickname, cash: 1_000_000, accountStatus: 'active' } };
    },
    logout: async () => {},
  };
  const controller = createAuthController(authService);
  await controller.start();

  authListener(schoolUser);
  await flushTasks();
  assert.equal(controller.getState().status, 'nickname-required');

  await controller.submitNickname('새학생');
  assert.equal(controller.getState().status, 'authenticated');

  authService.initializeCurrentUser = async () => {
    throw new ClientAuthError('school-account-required', '학교 계정 필요');
  };
  authListener(schoolUser);
  await flushTasks();
  assert.equal(controller.getState().status, 'denied');
});

test('an expired authentication session is shown as access denied', async () => {
  let authListener;
  const controller = createAuthController({
    completeRedirect: async () => {},
    subscribe(listener) { authListener = listener; return () => {}; },
    getPendingNickname: () => '',
    clearPendingNickname: () => {},
    initializeCurrentUser: async () => {
      throw new ClientAuthError('auth-expired', '인증 만료');
    },
    logout: async () => {},
  });
  await controller.start();

  authListener(schoolUser);
  await flushTasks();
  assert.equal(controller.getState().status, 'denied');
  assert.equal(controller.getState().message, '인증 만료');
});

test('Supabase auth initializes the current UID without sending identity or cash', async () => {
  const calls = [];
  const storage = new Map();
  const service = createAuthService({
    supabase: {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        getSession: async () => ({ error: null }),
        signInWithOAuth: async () => ({ error: null }),
        signOut: async () => ({ error: null }),
      },
      async rpc(name, args) {
        calls.push({ args, name });
        return { data: { uid: 'server-uid', nickname: '학생', cash: 1_000_000 }, error: null };
      },
    },
  }, {
    allowedSchoolDomain: 'pangyo.hs.kr',
    location: { origin: 'http://127.0.0.1:5173', pathname: '/' },
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
      setItem: (key, value) => storage.set(key, value),
    },
  });

  const result = await service.initializeCurrentUser({
    uid: 'client-uid',
    email: 'student@pangyo.hs.kr',
    emailVerified: true,
  }, '학생');

  assert.deepEqual(calls, [{ name: 'initialize_user', args: { p_nickname: '학생' } }]);
  assert.equal(result.user.uid, 'server-uid');
});
