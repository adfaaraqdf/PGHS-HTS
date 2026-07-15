import { TradeError } from './errors.js';

const allowedFields = new Set(['clubId', 'quantity', 'idempotencyKey']);
const clubIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const idempotencyKeyPattern = /^[A-Za-z0-9_-]+$/;

export const MIN_IDEMPOTENCY_KEY_LENGTH = 16;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export function parseTradeRequest(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TradeError('invalid-argument', '거래 요청 형식이 올바르지 않습니다.');
  }

  const fields = Object.keys(data);
  if (fields.some((field) => !allowedFields.has(field)) || fields.length !== allowedFields.size) {
    throw new TradeError('invalid-argument', '허용되지 않거나 누락된 거래 요청 필드가 있습니다.');
  }

  const clubId = validateClubId(data.clubId);
  const quantity = validateQuantity(data.quantity);
  const idempotencyKey = validateIdempotencyKey(data.idempotencyKey);

  return Object.freeze({ clubId, quantity, idempotencyKey });
}

export function validateClubId(value) {
  if (typeof value !== 'string' || value.length > 64 || !clubIdPattern.test(value)) {
    throw new TradeError('club-not-found', '거래할 수 없는 종목입니다.');
  }
  return value;
}

export function validateQuantity(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TradeError('invalid-quantity', '수량은 1 이상의 정수여야 합니다.');
  }
  return value;
}

export function validateIdempotencyKey(value) {
  if (
    typeof value !== 'string'
    || value.length < MIN_IDEMPOTENCY_KEY_LENGTH
    || value.length > MAX_IDEMPOTENCY_KEY_LENGTH
    || !idempotencyKeyPattern.test(value)
  ) {
    throw new TradeError('invalid-argument', '거래 요청 키 형식이 올바르지 않습니다.');
  }
  return value;
}

export function assertPositiveSafeInteger(value, code = 'internal') {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TradeError(code, '거래 설정 또는 데이터가 올바르지 않습니다.');
  }
  return value;
}

export function assertNonNegativeSafeInteger(value, code = 'internal') {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TradeError(code, '거래 데이터가 올바르지 않습니다.');
  }
  return value;
}
