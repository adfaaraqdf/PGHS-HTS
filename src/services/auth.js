import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

import {
  ClientAuthError,
  assertSchoolAccountForUx,
  normalizeNicknameForUx,
} from '../auth/client-policy.js';

const pendingNicknameKey = 'pghs-hts.pending-nickname';

export function createAuthService({ auth, functions }, { allowedSchoolDomain, storage = window.sessionStorage }) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    hd: allowedSchoolDomain,
    prompt: 'select_account',
  });
  const callInitializeUser = httpsCallable(functions, 'initializeUser');

  return Object.freeze({
    subscribe(listener) {
      return onAuthStateChanged(auth, listener);
    },

    async completeRedirect() {
      await getRedirectResult(auth);
    },

    async startGoogleLogin(nicknameValue) {
      const nickname = normalizeNicknameForUx(nicknameValue);
      if (nickname) {
        storage.setItem(pendingNicknameKey, nickname);
      } else {
        storage.removeItem(pendingNicknameKey);
      }

      await setPersistence(auth, browserLocalPersistence);
      await signInWithRedirect(auth, provider);
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
      const payload = nickname ? { nickname } : {};

      try {
        const response = await callInitializeUser(payload);
        if (response.data.tokenRefreshRequired) {
          await user.getIdToken(true);
        }
        return response.data;
      } catch (error) {
        throw mapCallableError(error);
      }
    },

    async logout() {
      storage.removeItem(pendingNicknameKey);
      await signOut(auth);
    },
  });
}

function mapCallableError(error) {
  const reason = error?.details?.reason;
  if (reason === 'nickname-required') {
    return new ClientAuthError(reason, '처음 이용하는 계정은 닉네임을 입력해야 합니다.');
  }
  if (reason === 'account-disabled') {
    return new ClientAuthError(reason, '사용할 수 없는 계정입니다.');
  }

  const code = String(error?.code ?? '');
  if (code.includes('permission-denied')) {
    return new ClientAuthError('school-account-required', '허용된 학교 계정이 아닙니다.');
  }
  if (code.includes('unauthenticated')) {
    return new ClientAuthError('auth-expired', '인증이 만료되었습니다. 다시 로그인해 주세요.');
  }
  if (code.includes('invalid-argument')) {
    return new ClientAuthError('invalid-nickname', error.message ?? '닉네임을 확인해 주세요.');
  }
  return new ClientAuthError('initialization-failed', '사용자 정보를 준비하지 못했습니다. 다시 시도해 주세요.');
}
