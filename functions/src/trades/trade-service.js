import { AuthInitializationError } from '../auth/errors.js';
import { validateSchoolIdentity } from '../auth/policy.js';
import { TradeError } from './errors.js';
import { createTradeIdentifiers } from './identifiers.js';
import { parseTradeRequest } from './validation.js';

const allowedSides = new Set(['buy', 'sell']);

export function createTradeService({ side, repository, allowedDomain }) {
  if (!allowedSides.has(side)) {
    throw new Error(`Unsupported trade side: ${side}`);
  }
  if (!repository?.execute) {
    throw new Error('A trade repository is required.');
  }

  return async ({ auth, data }) => {
    let identity;
    try {
      identity = validateSchoolIdentity(auth, allowedDomain);
    } catch (error) {
      if (error instanceof AuthInitializationError) {
        const code = error.code === 'failed-precondition' ? 'internal' : error.reason;
        throw new TradeError(code, error.message);
      }
      throw error;
    }

    const request = parseTradeRequest(data);
    const identifiers = createTradeIdentifiers({
      uid: identity.uid,
      idempotencyKey: request.idempotencyKey,
      side,
      clubId: request.clubId,
      quantity: request.quantity,
    });

    try {
      return await repository.execute({
        uid: identity.uid,
        side,
        clubId: request.clubId,
        quantity: request.quantity,
        ...identifiers,
      });
    } catch (error) {
      if (error instanceof TradeError && !error.requestId) {
        error.requestId = identifiers.requestId;
      }
      throw error;
    }
  };
}
