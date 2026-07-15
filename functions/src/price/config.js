import { PriceEngineError } from './errors.js';
import { requireSafeInteger, safeMultiply } from './integer-math.js';

const exactStrings = Object.freeze({
  ratioRoundingMode: 'half-up',
  boundedDeltaRoundingMode: 'toward-zero',
});

const integerRanges = Object.freeze({
  schemaVersion: [1, 1],
  configVersion: [1, Number.MAX_SAFE_INTEGER],
  issuedShares: [1, 10_000_000],
  minPrice: [1, 1_000_000],
  maxPrice: [1, 10_000_000],
  demandShardCount: [1, 100],
  priceTickSeconds: [30, 300],
  maxPriceDelaySeconds: [60, 3_600],
  maxTickChangeBps: [1, 1_000],
  maxRatingContributionBps: [0, 500],
  maxDemandContributionBps: [0, 1_000],
  maxAdminContributionBps: [0, 500],
  ratingPriorMeanMilli: [1_000, 5_000],
  ratingPriorCount: [1, 10_000],
  ratingScaleHalfRangeMilli: [1, 4_000],
  ratingRecentFullScaleMilli: [1, 4_000],
  ratingLevelWeightPermille: [0, 1_000],
  ratingRecentWeightPermille: [0, 1_000],
  demandLiquidityFloorShares: [1, 1_000_000],
  ratingFreshMinutes: [0, 1_440],
  ratingZeroMinutes: [1, 10_080],
  priceHistoryLimit: [1, 120],
  maxActiveAdminEvents: [1, 100],
});

export function validatePriceConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PriceEngineError('invalid-config', 'market/config is missing or invalid.');
  }
  const config = {};
  try {
    for (const [field, [minimum, maximum]] of Object.entries(integerRanges)) {
      config[field] = requireSafeInteger(value[field], field, { minimum, maximum });
    }
  } catch (error) {
    throw new PriceEngineError('invalid-config', error.message);
  }
  for (const [field, expected] of Object.entries(exactStrings)) {
    if (value[field] !== expected) {
      throw new PriceEngineError('invalid-config', `${field} must be ${expected}.`);
    }
    config[field] = expected;
  }
  if (config.maxPrice < config.minPrice) {
    throw new PriceEngineError('invalid-config', 'maxPrice must be at least minPrice.');
  }
  if (config.maxPriceDelaySeconds < config.priceTickSeconds) {
    throw new PriceEngineError('invalid-config', 'maxPriceDelaySeconds must cover one tick.');
  }
  if (config.ratingZeroMinutes <= config.ratingFreshMinutes) {
    throw new PriceEngineError('invalid-config', 'ratingZeroMinutes must exceed ratingFreshMinutes.');
  }
  if (config.ratingLevelWeightPermille + config.ratingRecentWeightPermille !== 1_000) {
    throw new PriceEngineError('invalid-config', 'Rating weights must add up to 1000.');
  }
  safeMultiply(config.maxPrice, config.issuedShares, 'maximum market capitalization');
  return Object.freeze(config);
}
