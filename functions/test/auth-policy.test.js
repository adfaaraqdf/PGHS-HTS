import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthInitializationError } from '../src/auth/errors.js';
import {
  parseInitializationRequest,
  validateNickname,
  validateSchoolIdentity,
} from '../src/auth/policy.js';

const validAuth = {
  uid: 'uid-1',
  token: {
    email: 'student@students.example.test',
    email_verified: true,
    name: '테스트 학생',
    firebase: { sign_in_provider: 'google.com' },
  },
};

test('accepts only an exact verified school email domain', () => {
  const identity = validateSchoolIdentity(validAuth, 'students.example.test');
  assert.deepEqual(identity, { uid: 'uid-1', displayName: '테스트 학생' });

  assert.throws(
    () => validateSchoolIdentity({
      ...validAuth,
      token: { ...validAuth.token, email: 'student@students.example.test.evil' },
    }, 'students.example.test'),
    (error) => error instanceof AuthInitializationError && error.code === 'permission-denied',
  );
});

test('rejects an unverified email and an unset server domain', () => {
  assert.throws(
    () => validateSchoolIdentity(null, 'students.example.test'),
    (error) => error.code === 'unauthenticated',
  );
  assert.throws(
    () => validateSchoolIdentity({
      ...validAuth,
      token: { ...validAuth.token, email_verified: false },
    }, 'students.example.test'),
    AuthInitializationError,
  );
  assert.throws(
    () => validateSchoolIdentity(validAuth, 'YOUR_SCHOOL_DOMAIN'),
    (error) => error.code === 'failed-precondition',
  );
  assert.throws(
    () => validateSchoolIdentity({
      ...validAuth,
      token: {
        ...validAuth.token,
        firebase: { sign_in_provider: 'password' },
      },
    }, 'students.example.test'),
    (error) => error.code === 'permission-denied',
  );
});

test('normalizes safe nicknames and rejects reserved, control, and extra input', () => {
  assert.equal(validateNickname('  축제  학생  '), '축제 학생');
  assert.throws(() => validateNickname('a'), AuthInitializationError);
  assert.throws(() => validateNickname('관리자01'), AuthInitializationError);
  assert.throws(() => validateNickname('학생\u202e01'), AuthInitializationError);
  assert.throws(
    () => parseInitializationRequest({ nickname: '학생01', cash: 9_999_999 }),
    AuthInitializationError,
  );
});
