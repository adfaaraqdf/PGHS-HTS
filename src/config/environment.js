const requiredClientKeys = [
  'VITE_APP_ENV',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_FUNCTIONS_REGION',
  'VITE_USE_FIREBASE_EMULATORS',
  'VITE_ALLOWED_SCHOOL_DOMAIN',
  'VITE_FIREBASE_APP_CHECK_PROVIDER',
  'VITE_FIREBASE_APP_CHECK_SITE_KEY',
];

const supportedEnvironments = new Set(['development', 'test', 'production']);

export class EnvironmentConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EnvironmentConfigurationError';
  }
}

export function validateClientEnvironment(rawEnvironment) {
  const missing = requiredClientKeys.filter((key) => !rawEnvironment[key]?.trim());

  if (missing.length > 0) {
    throw new EnvironmentConfigurationError(
      `필수 클라이언트 환경 변수가 없습니다: ${missing.join(', ')}`,
    );
  }

  const appEnvironment = rawEnvironment.VITE_APP_ENV;
  if (!supportedEnvironments.has(appEnvironment)) {
    throw new EnvironmentConfigurationError(
      'VITE_APP_ENV는 development, test, production 중 하나여야 합니다.',
    );
  }

  const useEmulators = rawEnvironment.VITE_USE_FIREBASE_EMULATORS === 'true';
  if (!['true', 'false'].includes(rawEnvironment.VITE_USE_FIREBASE_EMULATORS)) {
    throw new EnvironmentConfigurationError(
      'VITE_USE_FIREBASE_EMULATORS는 true 또는 false여야 합니다.',
    );
  }

  if (appEnvironment === 'production' && useEmulators) {
    throw new EnvironmentConfigurationError(
      'production 환경에서는 Firebase Emulator를 연결할 수 없습니다.',
    );
  }

  if (appEnvironment === 'test' && !rawEnvironment.VITE_FIREBASE_PROJECT_ID.startsWith('demo-')) {
    throw new EnvironmentConfigurationError(
      'test 환경은 live 프로젝트 접근을 막기 위해 demo- Firebase 프로젝트 ID를 사용해야 합니다.',
    );
  }

  const appCheckProvider = rawEnvironment.VITE_FIREBASE_APP_CHECK_PROVIDER;
  if (useEmulators && appCheckProvider !== 'disabled') {
    throw new EnvironmentConfigurationError(
      'Firebase Emulator 환경에서는 App Check provider를 disabled로 설정해야 합니다.',
    );
  }
  if (!useEmulators && !['recaptcha-v3', 'recaptcha-enterprise'].includes(appCheckProvider)) {
    throw new EnvironmentConfigurationError(
      '실서비스 App Check provider는 recaptcha-v3 또는 recaptcha-enterprise여야 합니다.',
    );
  }

  return Object.freeze({
    appEnvironment,
    firebaseConfig: Object.freeze({
      apiKey: rawEnvironment.VITE_FIREBASE_API_KEY,
      authDomain: rawEnvironment.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: rawEnvironment.VITE_FIREBASE_PROJECT_ID,
      storageBucket: rawEnvironment.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: rawEnvironment.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: rawEnvironment.VITE_FIREBASE_APP_ID,
    }),
    functionsRegion: rawEnvironment.VITE_FIREBASE_FUNCTIONS_REGION,
    useEmulators,
    allowedSchoolDomain: rawEnvironment.VITE_ALLOWED_SCHOOL_DOMAIN.toLowerCase(),
    appCheckProvider,
    appCheckSiteKey: rawEnvironment.VITE_FIREBASE_APP_CHECK_SITE_KEY,
  });
}
