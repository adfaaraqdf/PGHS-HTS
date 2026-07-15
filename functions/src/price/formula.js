import { validatePriceConfig } from './config.js';
import { PriceEngineError } from './errors.js';
import {
  BPS_DENOMINATOR,
  PPM,
  clamp,
  halfUp,
  requireSafeInteger,
  safeAdd,
  safeMultiply,
  towardZero,
} from './integer-math.js';

const RATING_PREMIUM_DENOMINATOR = 1_000_000_000_000;

export function calculatePriceTick({ club, demand, rating, events = [], config, windowEndMs }) {
  const checkedConfig = validatePriceConfig(config);
  const checkedClub = validateClub(club, checkedConfig);
  const checkedDemand = validateDemand(demand);
  requireSafeInteger(windowEndMs, 'windowEndMs', { minimum: 0 });

  const ratingSignal = calculateRatingSignal(rating, checkedConfig, windowEndMs);
  const adminSignal = calculateAdminSignal(events, checkedConfig, windowEndMs);
  const demandSignal = calculateDemandSignal(checkedDemand, checkedConfig);
  const cumulative = calculateCumulativeVolume(checkedClub, checkedDemand);

  if (checkedClub.isActive !== true || checkedClub.tradingStatus !== 'open') {
    return Object.freeze({
      ...baseResult(checkedClub, cumulative, ratingSignal, adminSignal, demandSignal),
      pricingStatus: 'held',
      skippedReason: checkedClub.isActive === true ? 'trading-halted' : 'club-inactive',
      newFundamentalPrice: checkedClub.fundamentalPrice,
      targetPrice: checkedClub.currentPrice,
      downBound: checkedClub.currentPrice,
      upBound: checkedClub.currentPrice,
      newPrice: checkedClub.currentPrice,
      marketCap: safeMultiply(
        checkedClub.currentPrice,
        checkedClub.issuedShares,
        'market capitalization',
      ),
      priceChange: checkedClub.currentPrice - checkedClub.previousClose,
      priceChangeRate: halfUp(
        BigInt(checkedClub.currentPrice - checkedClub.previousClose) * BigInt(BPS_DENOMINATOR),
        checkedClub.previousClose,
      ),
      appliedChangeBps: 0,
    });
  }

  const demandDeltaWon = towardZero(
    BigInt(checkedClub.fundamentalPrice) * BigInt(demandSignal.demandBps),
    BPS_DENOMINATOR,
  );
  const newFundamentalPrice = clamp(
    safeAdd(checkedClub.fundamentalPrice, demandDeltaWon, 'fundamental price'),
    checkedConfig.minPrice,
    checkedConfig.maxPrice,
  );
  const statePremiumBps = ratingSignal.desiredRatingPremiumBps
    + adminSignal.desiredAdminPremiumBps;
  const stateTargetDeltaWon = towardZero(
    BigInt(newFundamentalPrice) * BigInt(statePremiumBps),
    BPS_DENOMINATOR,
  );
  const targetPrice = clamp(
    safeAdd(newFundamentalPrice, stateTargetDeltaWon, 'target price'),
    checkedConfig.minPrice,
    checkedConfig.maxPrice,
  );
  const maxTickDeltaWon = towardZero(
    BigInt(checkedClub.currentPrice) * BigInt(checkedConfig.maxTickChangeBps),
    BPS_DENOMINATOR,
  );
  const downBound = Math.max(
    checkedConfig.minPrice,
    checkedClub.currentPrice - maxTickDeltaWon,
  );
  const upBound = Math.min(
    checkedConfig.maxPrice,
    checkedClub.currentPrice + maxTickDeltaWon,
  );
  const newPrice = clamp(targetPrice, downBound, upBound);
  const priceChange = newPrice - checkedClub.previousClose;

  return Object.freeze({
    ...baseResult(checkedClub, cumulative, ratingSignal, adminSignal, demandSignal),
    pricingStatus: 'priced',
    skippedReason: null,
    newFundamentalPrice,
    targetPrice,
    downBound,
    upBound,
    newPrice,
    marketCap: safeMultiply(newPrice, checkedClub.issuedShares, 'market capitalization'),
    priceChange,
    priceChangeRate: halfUp(
      BigInt(priceChange) * BigInt(BPS_DENOMINATOR),
      checkedClub.previousClose,
    ),
    appliedChangeBps: towardZero(
      BigInt(newPrice - checkedClub.currentPrice) * BigInt(BPS_DENOMINATOR),
      checkedClub.currentPrice,
    ),
  });
}

function baseResult(club, cumulative, ratingSignal, adminSignal, demandSignal) {
  return {
    oldPrice: club.currentPrice,
    oldFundamentalPrice: club.fundamentalPrice,
    previousClose: club.previousClose,
    issuedShares: club.issuedShares,
    ...cumulative,
    ...ratingSignal,
    ...adminSignal,
    ...demandSignal,
  };
}

function validateClub(club, config) {
  if (!club || typeof club !== 'object' || Array.isArray(club)) {
    throw new PriceEngineError('invalid-input', 'Club input is invalid.');
  }
  for (const field of [
    'currentPrice',
    'fundamentalPrice',
    'previousClose',
    'issuedShares',
    'buyVolume',
    'sellVolume',
    'totalVolume',
  ]) {
    requireSafeInteger(club[field], `club.${field}`, { minimum: 0 });
  }
  if (
    club.currentPrice < config.minPrice
    || club.currentPrice > config.maxPrice
    || club.fundamentalPrice < config.minPrice
    || club.fundamentalPrice > config.maxPrice
    || club.previousClose <= 0
    || club.issuedShares !== config.issuedShares
    || club.totalVolume !== club.buyVolume + club.sellVolume
  ) {
    throw new PriceEngineError('invalid-input', 'Club market fields violate the price contract.');
  }
  if (typeof club.tradingStatus !== 'string' || typeof club.isActive !== 'boolean') {
    throw new PriceEngineError('invalid-input', 'Club status fields are invalid.');
  }
  return club;
}

function validateDemand(demand) {
  if (!demand || typeof demand !== 'object' || Array.isArray(demand)) {
    throw new PriceEngineError('invalid-input', 'Demand input is invalid.');
  }
  const checked = {};
  for (const field of [
    'buyQuantity',
    'sellQuantity',
    'buyTradeCount',
    'sellTradeCount',
    'grossBuyAmount',
    'grossSellAmount',
  ]) {
    checked[field] = requireSafeInteger(demand[field], `demand.${field}`, { minimum: 0 });
  }
  return Object.freeze(checked);
}

function calculateDemandSignal(demand, config) {
  const activity = safeAdd(demand.buyQuantity, demand.sellQuantity, 'demand activity');
  if (activity === 0) {
    return Object.freeze({ netQuantity: 0, activityDenominator: config.demandLiquidityFloorShares,
      imbalancePpm: 0, demandBps: 0 });
  }
  const netQuantity = demand.buyQuantity - demand.sellQuantity;
  const activityDenominator = Math.max(activity, config.demandLiquidityFloorShares);
  const imbalancePpm = clamp(
    halfUp(BigInt(netQuantity) * BigInt(PPM), activityDenominator),
    -PPM,
    PPM,
  );
  const demandBps = halfUp(
    BigInt(config.maxDemandContributionBps) * BigInt(imbalancePpm),
    PPM,
  );
  return Object.freeze({ netQuantity, activityDenominator, imbalancePpm, demandBps });
}

function calculateRatingSignal(rating, config, windowEndMs) {
  const neutral = Object.freeze({
    ratingInputStatus: 'neutral',
    averageRatingMilli: config.ratingPriorMeanMilli,
    ratingCount: 0,
    ratingRecentDeltaMilli: 0,
    lastRatingAtMs: null,
    bayesianMeanMilli: config.ratingPriorMeanMilli,
    levelSignalPpm: 0,
    recentSignalPpm: 0,
    freshnessPpm: 0,
    weightedSignalPpm: 0,
    desiredRatingPremiumBps: 0,
  });
  if (!rating || typeof rating !== 'object' || Array.isArray(rating)) {
    return Object.freeze({ ...neutral, ratingInputStatus: 'invalid' });
  }
  const { averageRatingMilli, ratingCount, ratingRecentDeltaMilli, lastRatingAtMs } = rating;
  if (
    !Number.isSafeInteger(averageRatingMilli)
    || averageRatingMilli < 1_000
    || averageRatingMilli > 5_000
    || !Number.isSafeInteger(ratingCount)
    || ratingCount < 0
    || !Number.isSafeInteger(ratingRecentDeltaMilli)
    || Math.abs(ratingRecentDeltaMilli) > 4_000
  ) {
    return Object.freeze({ ...neutral, ratingInputStatus: 'invalid' });
  }
  if (ratingCount === 0 || lastRatingAtMs === null) {
    return Object.freeze({ ...neutral, averageRatingMilli, ratingCount,
      ratingRecentDeltaMilli, ratingInputStatus: 'empty' });
  }
  if (!Number.isSafeInteger(lastRatingAtMs) || lastRatingAtMs < 0 || lastRatingAtMs > windowEndMs) {
    return Object.freeze({ ...neutral, ratingInputStatus: 'invalid' });
  }

  const ageMs = windowEndMs - lastRatingAtMs;
  const freshnessPpm = calculateFreshness(ageMs, config);
  const bayesianMeanMilli = halfUp(
    BigInt(averageRatingMilli) * BigInt(ratingCount)
      + BigInt(config.ratingPriorMeanMilli) * BigInt(config.ratingPriorCount),
    ratingCount + config.ratingPriorCount,
  );
  const levelSignalPpm = clamp(
    halfUp(
      BigInt(bayesianMeanMilli - config.ratingPriorMeanMilli) * BigInt(PPM),
      config.ratingScaleHalfRangeMilli,
    ),
    -PPM,
    PPM,
  );
  const recentSignalPpm = clamp(
    halfUp(
      BigInt(ratingRecentDeltaMilli) * BigInt(PPM),
      config.ratingRecentFullScaleMilli,
    ),
    -PPM,
    PPM,
  );
  const weightedSignalPpm = halfUp(
    BigInt(config.ratingLevelWeightPermille) * BigInt(levelSignalPpm)
      + BigInt(config.ratingRecentWeightPermille) * BigInt(recentSignalPpm),
    1_000,
  );
  const desiredRatingPremiumBps = halfUp(
    BigInt(config.maxRatingContributionBps)
      * BigInt(freshnessPpm)
      * BigInt(weightedSignalPpm),
    RATING_PREMIUM_DENOMINATOR,
  );
  return Object.freeze({
    ratingInputStatus: freshnessPpm === 0 ? 'stale' : 'fresh',
    averageRatingMilli,
    ratingCount,
    ratingRecentDeltaMilli,
    lastRatingAtMs,
    bayesianMeanMilli,
    levelSignalPpm,
    recentSignalPpm,
    freshnessPpm,
    weightedSignalPpm,
    desiredRatingPremiumBps,
  });
}

function calculateFreshness(ageMs, config) {
  const freshMs = config.ratingFreshMinutes * 60_000;
  const zeroMs = config.ratingZeroMinutes * 60_000;
  if (ageMs <= freshMs) {
    return PPM;
  }
  if (ageMs >= zeroMs) {
    return 0;
  }
  return halfUp(BigInt(zeroMs - ageMs) * BigInt(PPM), zeroMs - freshMs);
}

function calculateAdminSignal(events, config, windowEndMs) {
  if (!Array.isArray(events)) {
    throw new PriceEngineError('invalid-input', 'Admin events input is invalid.');
  }
  let total = 0;
  const activeAdminEventIds = [];
  for (const event of [...events].sort((left, right) => (
    left.startsAtMs - right.startsAtMs || left.id.localeCompare(right.id)
  ))) {
    if (!event || typeof event.id !== 'string' || !event.id || event.id.includes('/')) {
      throw new PriceEngineError('invalid-input', 'Admin event ID is invalid.');
    }
    if (
      event.status !== 'active'
      || !Number.isSafeInteger(event.startsAtMs)
      || !Number.isSafeInteger(event.endsAtMs)
      || event.startsAtMs > windowEndMs
      || event.endsAtMs <= windowEndMs
    ) {
      continue;
    }
    if (
      !Number.isSafeInteger(event.impactBps)
      || event.impactBps < 0
      || event.impactBps > config.maxAdminContributionBps
      || !['positive', 'negative'].includes(event.impactType)
    ) {
      throw new PriceEngineError('invalid-input', 'Admin event impact is invalid.');
    }
    total += event.impactType === 'positive' ? event.impactBps : -event.impactBps;
    activeAdminEventIds.push(event.id);
  }
  return Object.freeze({
    activeAdminEventIds,
    desiredAdminPremiumBps: clamp(
      total,
      -config.maxAdminContributionBps,
      config.maxAdminContributionBps,
    ),
  });
}

function calculateCumulativeVolume(club, demand) {
  const buyVolume = safeAdd(club.buyVolume, demand.buyQuantity, 'cumulative buy volume');
  const sellVolume = safeAdd(club.sellVolume, demand.sellQuantity, 'cumulative sell volume');
  return Object.freeze({
    buyVolume,
    sellVolume,
    totalVolume: safeAdd(buyVolume, sellVolume, 'cumulative total volume'),
  });
}
