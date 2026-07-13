import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EnvironmentConfigurationError,
  validateClientEnvironment,
} from '../src/config/environment.js';

const validTestEnvironment = {
  VITE_APP_ENV: 'test',
  VITE_FIREBASE_API_KEY: 'demo-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-pghs-hts.local',
  VITE_FIREBASE_PROJECT_ID: 'demo-pghs-hts',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-pghs-hts.local',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000000000',
  VITE_FIREBASE_FUNCTIONS_REGION: 'us-central1',
  VITE_USE_FIREBASE_EMULATORS: 'true',
  VITE_ALLOWED_SCHOOL_DOMAIN: 'students.example.test',
  VITE_FIREBASE_APP_CHECK_PROVIDER: 'disabled',
  VITE_FIREBASE_APP_CHECK_SITE_KEY: 'demo-not-used',
};

test('accepts a safe demo-project test environment', () => {
  const environment = validateClientEnvironment(validTestEnvironment);

  assert.equal(environment.appEnvironment, 'test');
  assert.equal(environment.useEmulators, true);
  assert.equal(environment.firebaseConfig.projectId, 'demo-pghs-hts');
});

test('fails clearly when a required public Firebase value is missing', () => {
  const environment = { ...validTestEnvironment, VITE_FIREBASE_APP_ID: '' };

  assert.throws(
    () => validateClientEnvironment(environment),
    (error) => error instanceof EnvironmentConfigurationError
      && error.message.includes('VITE_FIREBASE_APP_ID'),
  );
});

test('does not allow a production build to target emulators', () => {
  const environment = {
    ...validTestEnvironment,
    VITE_APP_ENV: 'production',
  };

  assert.throws(
    () => validateClientEnvironment(environment),
    EnvironmentConfigurationError,
  );
});
