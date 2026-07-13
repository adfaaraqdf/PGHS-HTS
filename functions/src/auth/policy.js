import { AuthInitializationError } from './errors.js';

const allowedRequestFields = new Set(['nickname']);
const reservedNicknames = new Set(['admin', 'administrator', 'system', '관리자', '운영자']);
const nicknamePattern = /^[\p{L}\p{N} _.-]+$/u;
const forbiddenControlPattern = /[\p{Cc}\p{Cf}]/u;

export function parseInitializationRequest(data) {
  if (data === undefined || data === null) {
    return {};
  }

  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new AuthInitializationError('invalid-argument', '요청 형식이 올바르지 않습니다.');
  }

  const unexpectedFields = Object.keys(data).filter((key) => !allowedRequestFields.has(key));
  if (unexpectedFields.length > 0) {
    throw new AuthInitializationError('invalid-argument', '허용되지 않은 요청 필드가 있습니다.');
  }

  return Object.hasOwn(data, 'nickname') ? { nickname: data.nickname } : {};
}

export function validateSchoolIdentity(auth, configuredDomain) {
  if (!auth?.uid || !auth.token) {
    throw new AuthInitializationError('unauthenticated', '로그인이 필요합니다.');
  }

  if (auth.token.email_verified !== true) {
    throw new AuthInitializationError('permission-denied', '인증된 학교 이메일이 필요합니다.');
  }

  if (auth.token.firebase?.sign_in_provider !== 'google.com') {
    throw new AuthInitializationError('permission-denied', 'Google 학교 계정 로그인이 필요합니다.');
  }

  const allowedDomain = normalizeAllowedDomain(configuredDomain);
  const email = normalizeEmail(auth.token.email);
  const emailDomain = email.slice(email.lastIndexOf('@') + 1);

  if (emailDomain !== allowedDomain) {
    throw new AuthInitializationError('permission-denied', '허용된 학교 계정이 아닙니다.');
  }

  const displayName = normalizeDisplayName(auth.token.name);
  return Object.freeze({ uid: auth.uid, displayName });
}

export function validateNickname(value, configuredForbiddenWords = []) {
  if (typeof value !== 'string') {
    throw new AuthInitializationError('invalid-argument', '닉네임은 문자열이어야 합니다.');
  }

  const nickname = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  const length = [...nickname].length;
  if (length < 2 || length > 16) {
    throw new AuthInitializationError('invalid-argument', '닉네임은 2자 이상 16자 이하여야 합니다.');
  }

  if (forbiddenControlPattern.test(nickname) || !nicknamePattern.test(nickname)) {
    throw new AuthInitializationError('invalid-argument', '닉네임에 사용할 수 없는 문자가 있습니다.');
  }

  const normalizedNickname = nickname.toLocaleLowerCase('ko-KR');
  const forbiddenWords = new Set([
    ...reservedNicknames,
    ...configuredForbiddenWords.map((word) => word.normalize('NFC').trim().toLocaleLowerCase('ko-KR')),
  ]);

  if ([...forbiddenWords].some((word) => word && normalizedNickname.includes(word))) {
    throw new AuthInitializationError('invalid-argument', '사용할 수 없는 닉네임입니다.');
  }

  return nickname;
}

export function parseForbiddenWords(value) {
  if (!value?.trim()) {
    return [];
  }

  return value.split(',').map((word) => word.trim()).filter(Boolean);
}

function normalizeAllowedDomain(value) {
  const domain = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!domain || domain.includes('your_') || domain.includes('@') || domain.includes('/')) {
    throw new AuthInitializationError('failed-precondition', '학교 도메인 설정이 완료되지 않았습니다.');
  }
  return domain;
}

function normalizeEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const separatorIndex = email.lastIndexOf('@');
  if (separatorIndex <= 0 || separatorIndex === email.length - 1) {
    throw new AuthInitializationError('permission-denied', '인증 토큰에 유효한 이메일이 없습니다.');
  }
  return email;
}

function normalizeDisplayName(value) {
  const displayName = typeof value === 'string' ? value.normalize('NFC').trim() : '';
  if (!displayName || [...displayName].length > 80 || forbiddenControlPattern.test(displayName)) {
    throw new AuthInitializationError('failed-precondition', '인증 토큰에 유효한 이름이 없습니다.');
  }
  return displayName;
}
