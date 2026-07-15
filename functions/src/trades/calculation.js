import { TradeError } from './errors.js';

const maximumSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);

export function calculateGrossAmount(price, quantity) {
  return toSafeInteger(BigInt(price) * BigInt(quantity));
}

export function calculateWeightedAverage({
  oldQuantity,
  oldAverageBuyPrice,
  buyQuantity,
  executionPrice,
}) {
  if (oldQuantity === 0) {
    return executionPrice;
  }

  const numerator = (BigInt(oldQuantity) * BigInt(oldAverageBuyPrice))
    + (BigInt(buyQuantity) * BigInt(executionPrice));
  if (numerator > maximumSafeInteger) {
    throw new TradeError('invalid-quantity', '거래 금액이 허용 범위를 넘었습니다.');
  }
  const denominator = BigInt(oldQuantity + buyQuantity);
  const rounded = (numerator + (denominator / 2n)) / denominator;
  return toSafeInteger(rounded);
}

export function safeAdd(left, right) {
  return toSafeInteger(BigInt(left) + BigInt(right));
}

export function safeSubtract(left, right, errorCode, message) {
  const result = BigInt(left) - BigInt(right);
  if (result < 0n) {
    throw new TradeError(errorCode, message);
  }
  return toSafeInteger(result);
}

function toSafeInteger(value) {
  if (value < 0n || value > maximumSafeInteger) {
    throw new TradeError('invalid-quantity', '수량 또는 거래 금액이 허용 범위를 넘었습니다.');
  }
  return Number(value);
}
