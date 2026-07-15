import { httpsCallable } from 'firebase/functions';

const safeMessages = Object.freeze({
  unauthenticated: '인증이 만료되었습니다. 다시 로그인해 주세요.',
  'permission-denied': '이 계정으로는 거래할 수 없습니다.',
  'account-disabled': '사용할 수 없는 계정입니다.',
  'market-closed': '현재 시장이 열려 있지 않습니다.',
  'trading-halted': '현재 거래할 수 없는 종목입니다.',
  'club-not-found': '존재하지 않는 종목입니다.',
  'invalid-argument': '거래 요청 값을 확인해 주세요.',
  'invalid-quantity': '거래 수량을 확인해 주세요.',
  'insufficient-funds': '보유 현금이 부족합니다.',
  'insufficient-holdings': '보유 수량이 부족합니다.',
  'duplicate-request': '이미 다른 거래에 사용된 요청입니다.',
  conflict: '동시 거래와 충돌했습니다. 같은 요청으로 다시 시도해 주세요.',
  'price-stale': '가격 갱신이 지연되어 거래가 일시 중단되었습니다.',
  'resource-exhausted': '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
  internal: '거래를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
});

export class ClientTradeError extends Error {
  constructor(reason, message, { retryable = false, requestId = null, idempotencyKey = null } = {}) {
    super(message);
    this.name = 'ClientTradeError';
    this.reason = reason;
    this.retryable = retryable;
    this.requestId = requestId;
    this.idempotencyKey = idempotencyKey;
  }
}

export function createTradingService({ functions }) {
  const callBuyStock = httpsCallable(functions, 'buyStock');
  const callSellStock = httpsCallable(functions, 'sellStock');

  return Object.freeze({
    buy(request) {
      return callTrade(callBuyStock, request);
    },
    sell(request) {
      return callTrade(callSellStock, request);
    },
  });
}

async function callTrade(callable, request) {
  try {
    const response = await callable({
      clubId: request.clubId,
      quantity: request.quantity,
      idempotencyKey: request.idempotencyKey,
    });
    return response.data;
  } catch (error) {
    const reason = typeof error?.details?.reason === 'string'
      ? error.details.reason
      : inferReason(error?.code);
    throw new ClientTradeError(
      reason,
      safeMessages[reason] ?? safeMessages.internal,
      {
        retryable: error?.details?.retryable === true,
        requestId: error?.details?.requestId ?? null,
      },
    );
  }
}

function inferReason(code) {
  const value = String(code ?? '');
  if (value.includes('unauthenticated')) return 'unauthenticated';
  if (value.includes('permission-denied')) return 'permission-denied';
  if (value.includes('resource-exhausted')) return 'resource-exhausted';
  return 'internal';
}
