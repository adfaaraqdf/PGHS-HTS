export class ClientAuthError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = 'ClientAuthError';
    this.reason = reason;
  }
}

export function assertSchoolAccountForUx(user, allowedDomain) {
  if (!user?.email) {
    throw new ClientAuthError('invalid-account', 'Google 계정 이메일을 확인할 수 없습니다.');
  }

  if (user.emailVerified !== true) {
    throw new ClientAuthError('email-not-verified', '이메일 인증이 완료된 학교 계정이 필요합니다.');
  }

  const normalizedDomain = allowedDomain.trim().toLowerCase();
  const normalizedEmail = user.email.trim().toLowerCase();
  const separatorIndex = normalizedEmail.lastIndexOf('@');
  const emailDomain = separatorIndex > 0 ? normalizedEmail.slice(separatorIndex + 1) : '';
  if (!normalizedDomain || emailDomain !== normalizedDomain) {
    throw new ClientAuthError('school-account-required', '허용된 학교 Google 계정으로 로그인해 주세요.');
  }
}

export function normalizeNicknameForUx(value) {
  const nickname = String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!nickname) {
    return '';
  }

  const length = [...nickname].length;
  if (length < 2 || length > 16) {
    throw new ClientAuthError('invalid-nickname', '닉네임은 2자 이상 16자 이하여야 합니다.');
  }
  return nickname;
}
