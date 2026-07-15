import { getApps, initializeApp } from 'firebase-admin/app';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';

import { TradeError } from './errors.js';
import { createFirestoreTradeRepository } from './firestore-repository.js';
import { createTradeService } from './trade-service.js';

if (getApps().length === 0) {
  initializeApp();
}

const httpsCodeByReason = Object.freeze({
  unauthenticated: 'unauthenticated',
  'permission-denied': 'permission-denied',
  'account-disabled': 'permission-denied',
  'club-not-found': 'not-found',
  'invalid-argument': 'invalid-argument',
  'invalid-quantity': 'invalid-argument',
  'insufficient-funds': 'failed-precondition',
  'insufficient-holdings': 'failed-precondition',
  'market-closed': 'failed-precondition',
  'trading-halted': 'failed-precondition',
  'price-stale': 'unavailable',
  'duplicate-request': 'already-exists',
  conflict: 'aborted',
  'resource-exhausted': 'resource-exhausted',
  internal: 'internal',
});

export function createTradeHandler({ side, allowedDomain, repository } = {}) {
  return async (request) => {
    try {
      const executeTrade = createTradeService({
        side,
        repository: repository ?? createFirestoreTradeRepository(),
        allowedDomain,
      });
      return await executeTrade({ auth: request.auth, data: request.data });
    } catch (error) {
      if (error instanceof TradeError) {
        throw toHttpsError(error);
      }

      logger.error(`${side}Stock failed`, {
        errorName: error?.name ?? 'UnknownError',
      });
      throw new HttpsError(
        'internal',
        '거래를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        { reason: 'internal', retryable: true },
      );
    }
  };
}

function toHttpsError(error) {
  const reason = Object.hasOwn(httpsCodeByReason, error.code) ? error.code : 'internal';
  return new HttpsError(
    httpsCodeByReason[reason],
    error.message,
    {
      reason,
      retryable: error.retryable === true,
      ...(error.requestId ? { requestId: error.requestId } : {}),
    },
  );
}
