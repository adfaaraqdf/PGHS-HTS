import { PriceEngineError } from './errors.js';
import { requireSafeInteger } from './integer-math.js';

export function appendBoundedPricePoint(points, point, limit) {
  requireSafeInteger(limit, 'price history limit', { minimum: 1, maximum: 120 });
  if (!Array.isArray(points) || points.length > limit) {
    throw new PriceEngineError('invalid-history', 'Recent price history is invalid.');
  }
  if (
    !point
    || typeof point.windowId !== 'string'
    || !point.windowId
    || !Number.isSafeInteger(point.price)
    || point.price <= 0
    || !point.calculatedAt
  ) {
    throw new PriceEngineError('invalid-history', 'New price history point is invalid.');
  }
  return Object.freeze([...points, point].slice(-limit));
}
