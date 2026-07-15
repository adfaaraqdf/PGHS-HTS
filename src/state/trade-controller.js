import { ClientTradeError } from '../services/trading.js';

export function createTradeController(
  tradingService,
  { createIdempotencyKey = () => globalThis.crypto.randomUUID() } = {},
) {
  const pending = new Set();
  const listeners = new Set();

  const notify = () => {
    const snapshot = Object.freeze({ pending: new Set(pending) });
    listeners.forEach((listener) => listener(snapshot));
  };

  const execute = async ({ side, clubId, quantity, idempotencyKey }) => {
    if (side !== 'buy' && side !== 'sell') {
      throw new ClientTradeError('invalid-request', '지원하지 않는 거래 요청입니다.');
    }

    const pendingKey = `${side}:${clubId}`;
    if (pending.has(pendingKey)) {
      throw new ClientTradeError('request-in-progress', '같은 거래 요청을 처리하고 있습니다.');
    }

    const requestKey = idempotencyKey ?? createIdempotencyKey();
    pending.add(pendingKey);
    notify();
    try {
      return await tradingService[side]({
        clubId,
        quantity,
        idempotencyKey: requestKey,
      });
    } catch (error) {
      if (error instanceof ClientTradeError && !error.idempotencyKey) {
        error.idempotencyKey = requestKey;
      }
      throw error;
    } finally {
      pending.delete(pendingKey);
      notify();
    }
  };

  return Object.freeze({
    execute,
    buy(request) {
      return execute({ ...request, side: 'buy' });
    },
    sell(request) {
      return execute({ ...request, side: 'sell' });
    },
    isPending(side, clubId) {
      return pending.has(`${side}:${clubId}`);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      listeners.clear();
    },
  });
}
