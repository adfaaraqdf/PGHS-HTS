const safeMessages = Object.freeze({
  unauthenticated: '인증이 만료되었습니다. 다시 로그인해 주세요.',
  'permission-denied': '이 계정으로는 거래할 수 없습니다.',
  'account-disabled': '사용할 수 없는 계정입니다.',
  'market-closed': '현재 시장이 열려 있지 않습니다.',
  'trading-halted': '현재 거래할 수 없는 종목입니다.',
  'club-not-found': '존재하지 않는 종목입니다.',
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

export function createTradingService({ supabase }) {
  return Object.freeze({
    buy(request) { return callTrade(supabase, 'buy_stock', request); },
    sell(request) { return callTrade(supabase, 'sell_stock', request); },
  });
}

async function callTrade(supabase, functionName, request) {
  const { data, error } = await supabase.rpc(functionName, {
    p_club_id: request.clubId,
    p_quantity: request.quantity,
    p_idempotency_key: request.idempotencyKey,
  });
  if (!error) return toClientResult(data);

  const reason = Object.keys(safeMessages)
    .find((code) => String(error.message).includes(code)) ?? 'internal';
  throw new ClientTradeError(reason, safeMessages[reason], {
    retryable: ['conflict', 'resource-exhausted', 'internal'].includes(reason),
    requestId: error.hint ?? null,
  });
}

function toClientResult(result) {
  return {
    tradeId: result.trade_id,
    clubId: result.club_id,
    side: result.side,
    quantity: result.quantity,
    executionPrice: result.execution_price,
    grossAmount: result.gross_amount,
    cashAfter: result.cash_after,
    holdingQuantityAfter: result.holding_quantity_after,
    averageBuyPriceAfter: result.average_buy_price_after,
  };
}
