import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EnvironmentConfigurationError,
  validateClientEnvironment,
} from '../src/config/environment.js';

const validTestEnvironment = {
  VITE_APP_ENV: 'test',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_placeholder',
  VITE_ALLOWED_SCHOOL_DOMAIN: 'students.example.test',
};

test('accepts a safe local Supabase test environment', () => {
  const environment = validateClientEnvironment(validTestEnvironment);

  assert.equal(environment.appEnvironment, 'test');
  assert.equal(environment.supabaseUrl, 'http://127.0.0.1:54321');
  assert.equal(environment.supabasePublishableKey, 'sb_publishable_test_placeholder');
});

test('fails clearly when a required public Supabase value is missing', () => {
  const environment = { ...validTestEnvironment, VITE_SUPABASE_PUBLISHABLE_KEY: '' };

  assert.throws(
    () => validateClientEnvironment(environment),
    (error) => error instanceof EnvironmentConfigurationError
      && error.message.includes('VITE_SUPABASE_PUBLISHABLE_KEY'),
  );
});

test('does not allow a test build to target a hosted Supabase project', () => {
  const environment = {
    ...validTestEnvironment,
    VITE_SUPABASE_URL: 'https://production-project.supabase.co',
  };

  assert.throws(
    () => validateClientEnvironment(environment),
    EnvironmentConfigurationError,
  );
});
