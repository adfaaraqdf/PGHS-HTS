import { getApps, initializeApp } from 'firebase-admin/app';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';

import { AuthInitializationError } from './errors.js';
import {
  createFirebaseClaimService,
  createFirestoreUserRepository,
} from './firebase-adapters.js';
import { parseForbiddenWords } from './policy.js';
import { createUserInitializationService } from './user-initialization.js';

if (getApps().length === 0) {
  initializeApp();
}

const allowedSchoolDomain = defineString('ALLOWED_SCHOOL_DOMAIN');
const nicknameForbiddenWords = defineString('NICKNAME_FORBIDDEN_WORDS', { default: '' });
const enforceAppCheck = process.env.FUNCTIONS_EMULATOR !== 'true'
  && process.env.ENFORCE_APP_CHECK === 'true';

export function createInitializeUserHandler({ repository, claimService } = {}) {
  return async (request) => {
    try {
      const initializeUserService = createUserInitializationService({
        repository: repository ?? createFirestoreUserRepository(),
        claimService: claimService ?? createFirebaseClaimService(),
        allowedDomain: allowedSchoolDomain.value(),
        forbiddenWords: parseForbiddenWords(nicknameForbiddenWords.value()),
      });

      return await initializeUserService({ auth: request.auth, data: request.data });
    } catch (error) {
      if (error instanceof AuthInitializationError) {
        throw new HttpsError(error.code, error.message, { reason: error.reason });
      }

      logger.error('initializeUser failed', {
        errorName: error?.name ?? 'UnknownError',
      });
      throw new HttpsError('internal', '사용자 초기화에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };
}

export const initializeUser = onCall(
  { enforceAppCheck },
  createInitializeUserHandler(),
);
