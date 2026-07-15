import { PriceEngineError } from './errors.js';

export const PPM = 1_000_000;
export const BPS_DENOMINATOR = 10_000;

export function requireSafeInteger(value, name, { minimum, maximum } = {}) {
  if (!Number.isSafeInteger(value)) {
    throw new PriceEngineError('invalid-input', `${name} must be a safe integer.`);
  }
  if (minimum !== undefined && value < minimum) {
    throw new PriceEngineError('invalid-input', `${name} is below its minimum.`);
  }
  if (maximum !== undefined && value > maximum) {
    throw new PriceEngineError('invalid-input', `${name} is above its maximum.`);
  }
  return value;
}

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function halfUp(numerator, denominator) {
  return divideBigInt(numerator, denominator, true);
}

export function towardZero(numerator, denominator) {
  return divideBigInt(numerator, denominator, false);
}

export function safeAdd(left, right, name = 'integer sum') {
  return fromBigInt(BigInt(left) + BigInt(right), name);
}

export function safeMultiply(left, right, name = 'integer product') {
  return fromBigInt(BigInt(left) * BigInt(right), name);
}

function divideBigInt(numerator, denominator, roundHalfUp) {
  const top = BigInt(numerator);
  const bottom = BigInt(denominator);
  if (bottom <= 0n) {
    throw new PriceEngineError('invalid-input', 'The divisor must be positive.');
  }
  const sign = top < 0n ? -1n : 1n;
  const absolute = top < 0n ? -top : top;
  const quotient = roundHalfUp
    ? (absolute + (bottom / 2n)) / bottom
    : absolute / bottom;
  return fromBigInt(sign * quotient, 'integer division result');
}

function fromBigInt(value, name) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new PriceEngineError('integer-overflow', `${name} exceeds the safe integer range.`);
  }
  return Number(value);
}
