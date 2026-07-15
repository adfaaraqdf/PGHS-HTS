import { getApps, initializeApp } from 'firebase-admin/app';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { PriceEngineError } from './errors.js';
import { createFirestorePriceCoordinator } from './firestore-coordinator.js';

if (getApps().length === 0) {
  initializeApp();
}

export function createPriceTickHandler({ coordinator } = {}) {
  return async () => {
    try {
      const result = await (coordinator ?? createFirestorePriceCoordinator()).run();
      logger.info('Price tick finished', {
        status: result.status,
        windowId: result.windowId ?? null,
      });
      return result;
    } catch (error) {
      if (error instanceof PriceEngineError) {
        logger.error('Price tick rejected', {
          reason: error.code,
          retryable: error.retryable,
        });
      } else {
        logger.error('Price tick failed', { errorName: error?.name ?? 'UnknownError' });
      }
      throw error;
    }
  };
}

export const priceTick = onSchedule({
  schedule: 'every 1 minutes',
  timeZone: 'UTC',
  timeoutSeconds: 120,
  memory: '512MiB',
  retryCount: 1,
  maxRetrySeconds: 120,
}, createPriceTickHandler());
