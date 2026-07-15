import {
  ClientAuthError,
  assertSchoolAccountForUx,
  normalizeNicknameForUx,
} from '../auth/client-policy.js';

const pendingNicknameKey = 'pghs-hts.pending-nickname';

export function createAuthService(
  { supabase },
  { allowedSchoolDomain, storage = window.sessionStorage, location = window.location },
) {
  return Object.freeze({
    subscribe(listener) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        listener(toUxUser(session?.user));
      });
      return () => data.subscription.unsubscribe();
    },

    async completeRedirect() {
      const { error } = await supabase.auth.getSession();
      if (error) throw mapAuthError(error);
    },

    async startGoogleLogin(nicknameValue) {
      const nickname = normalizeNicknameForUx(nicknameValue);
      if (nickname) storage.setItem(pendingNicknameKey, nickname);
      else storage.removeItem(pendingNicknameKey);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${location.origin}${location.pathname}`,
          queryParams: {
            hd: allowedSchoolDomain,
            prompt: 'select_account',
          },
        },
      });
      if (error) throw mapAuthError(error);
    },

    getPendingNickname() {
      return storage.getItem(pendingNicknameKey) ?? '';
    },

    clearPendingNickname() {
      storage.removeItem(pendingNicknameKey);
    },

    async initializeCurrentUser(user, nicknameValue) {
      assertSchoolAccountForUx(user, allowedSchoolDomain);
      const nickname = normalizeNicknameForUx(nicknameValue);
      const { data, error } = await supabase.rpc('initialize_user', {
        p_nickname: nickname || null,
      });
      if (error) throw mapRpcError(error);
      return { user: data };
    },

    async logout() {
      storage.removeItem(pendingNicknameKey);
      const { error } = await supabase.auth.signOut();
      if (error) throw mapAuthError(error);
    },
  });
}

function toUxUser(user) {
  if (!user) return null;
  return {
    uid: user.id,
    email: user.email,
    emailVerified: Boolean(user.email_confirmed_at),
    displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? '',
  };
}

function mapAuthError(error) {
  return new ClientAuthError('authentication-failed', error?.message ?? '인증 요청을 처리하지 못했습니다.');
}

function mapRpcError(error) {
  const known = [
    'nickname-required', 'invalid-nickname', 'account-disabled',
    'school-account-required', 'email-not-verified', 'unauthenticated',
  ];
  const reason = known.find((value) => String(error?.message).includes(value)) ?? 'initialization-failed';
  const messages = {
    'nickname-required': '처음 이용하는 계정은 닉네임을 입력해야 합니다.',
    'invalid-nickname': '닉네임은 2~16자의 한글, 영문, 숫자와 공백만 사용할 수 있습니다.',
    'account-disabled': '사용할 수 없는 계정입니다.',
    'school-account-required': '허용된 학교 계정이 아닙니다.',
    'email-not-verified': '이메일 인증이 완료된 학교 계정이 필요합니다.',
    unauthenticated: '인증이 만료되었습니다. 다시 로그인해 주세요.',
    'initialization-failed': '사용자 정보를 준비하지 못했습니다. 다시 시도해 주세요.',
  };
  return new ClientAuthError(reason, messages[reason]);
}
