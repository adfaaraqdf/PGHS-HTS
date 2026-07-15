const requiredClientKeys = [
  'VITE_APP_ENV',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_ALLOWED_SCHOOL_DOMAIN',
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

  let supabaseUrl;
  try {
    supabaseUrl = new URL(rawEnvironment.VITE_SUPABASE_URL);
  } catch {
    throw new EnvironmentConfigurationError('VITE_SUPABASE_URL은 올바른 URL이어야 합니다.');
  }
  if (!['http:', 'https:'].includes(supabaseUrl.protocol)) {
    throw new EnvironmentConfigurationError('VITE_SUPABASE_URL은 http 또는 https URL이어야 합니다.');
  }

  if (appEnvironment === 'test' && !['127.0.0.1', 'localhost'].includes(supabaseUrl.hostname)) {
    throw new EnvironmentConfigurationError(
      'test 환경은 운영 데이터 접근을 막기 위해 로컬 Supabase URL만 사용할 수 있습니다.',
    );
  }

  return Object.freeze({
    appEnvironment,
    supabaseUrl: supabaseUrl.toString().replace(/\/$/, ''),
    supabasePublishableKey: rawEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY,
    allowedSchoolDomain: rawEnvironment.VITE_ALLOWED_SCHOOL_DOMAIN.toLowerCase(),
  });
}
