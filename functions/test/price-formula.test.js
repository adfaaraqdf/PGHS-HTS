import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePriceConfig } from '../src/price/config.js';
import { calculatePriceTick } from '../src/price/formula.js';
import { appendBoundedPricePoint } from '../src/price/history.js';

const config = Object.freeze({
  schemaVersion: 1,
  configVersion: 1,
  issuedShares: 100_000,
  minPrice: 100,
  maxPrice: 1_000_000,
  demandShardCount: 10,
  priceTickSeconds: 60,
  maxPriceDelaySeconds: 120,
  maxTickChangeBps: 200,
  maxRatingContributionBps: 50,
  maxDemandContributionBps: 120,
  maxAdminContributionBps: 60,
  ratingPriorMeanMilli: 3_000,
  ratingPriorCount: 20,
  ratingScaleHalfRangeMilli: 2_000,
  ratingRecentFullScaleMilli: 1_000,
  ratingLevelWeightPermille: 700,
  ratingRecentWeightPermille: 300,
  demandLiquidityFloorShares: 100,
  ratingFreshMinutes: 10,
  ratingZeroMinutes: 30,
  priceHistoryLimit: 60,
  maxActiveAdminEvents: 50,
  ratioRoundingMode: 'half-up',
  boundedDeltaRoundingMode: 'toward-zero',
});

const neutralRating = Object.freeze({
  averageRatingMilli: 3_000,
  ratingCount: 0,
  ratingRecentDeltaMilli: 0,
  lastRatingAtMs: null,
});

const zeroDemand = Object.freeze({
  buyQuantity: 0,
  sellQuantity: 0,
  buyTradeCount: 0,
  sellTradeCount: 0,
  grossBuyAmount: 0,
  grossSellAmount: 0,
});

function input(overrides = {}) {
  return {
    club: {
      currentPrice: 10_000,
      fundamentalPrice: 10_000,
      previousClose: 10_000,
      issuedShares: 100_000,
      buyVolume: 0,
      sellVolume: 0,
      totalVolume: 0,
      isActive: true,
      tradingStatus: 'open',
      ...overrides.club,
    },
    demand: { ...zeroDemand, ...overrides.demand },
    rating: overrides.rating === undefined ? neutralRating : overrides.rating,
    events: overrides.events ?? [],
    config: { ...config, ...overrides.config },
    windowEndMs: overrides.windowEndMs ?? 1_800_000,
  };
}

test('config validator rejects unsafe limits and accepts the common versioned config', () => {
  assert.deepEqual(validatePriceConfig(config), config);
  assert.throws(() => validatePriceConfig({ ...config, maxPrice: 99 }), /maxPrice/);
  assert.throws(
    () => validatePriceConfig({ ...config, ratingRecentWeightPermille: 301 }),
    /add up/,
  );
});

test('zero and balanced demand are stable; buy and sell dominance move in opposite directions', () => {
  const none = calculatePriceTick(input());
  const balanced = calculatePriceTick(input({ demand: {
    buyQuantity: 100,
    sellQuantity: 100,
    buyTradeCount: 1,
    sellTradeCount: 1,
    grossBuyAmount: 1_000_000,
    grossSellAmount: 1_000_000,
  } }));
  const buy = calculatePriceTick(input({ demand: {
    buyQuantity: 500,
    buyTradeCount: 5,
    grossBuyAmount: 5_000_000,
  } }));
  const sell = calculatePriceTick(input({ demand: {
    sellQuantity: 500,
    sellTradeCount: 5,
    grossSellAmount: 5_000_000,
  } }));

  assert.equal(none.newPrice, 10_000);
  assert.equal(balanced.newPrice, 10_000);
  assert.ok(buy.newPrice > none.newPrice);
  assert.ok(sell.newPrice < none.newPrice);
  assert.equal(buy.demandBps, 120);
  assert.equal(sell.demandBps, -120);
});

test('Bayesian shrinkage limits one rating and 500 ratings have a stronger signed effect', () => {
  const oneHigh = calculatePriceTick(input({ rating: {
    averageRatingMilli: 5_000,
    ratingCount: 1,
    ratingRecentDeltaMilli: 1_000,
    lastRatingAtMs: 1_800_000,
  } }));
  const manyHigh = calculatePriceTick(input({ rating: {
    averageRatingMilli: 5_000,
    ratingCount: 500,
    ratingRecentDeltaMilli: 1_000,
    lastRatingAtMs: 1_800_000,
  } }));
  const manyLow = calculatePriceTick(input({ rating: {
    averageRatingMilli: 1_000,
    ratingCount: 500,
    ratingRecentDeltaMilli: -1_000,
    lastRatingAtMs: 1_800_000,
  } }));

  assert.ok(oneHigh.desiredRatingPremiumBps > 0);
  assert.ok(manyHigh.desiredRatingPremiumBps > oneHigh.desiredRatingPremiumBps);
  assert.ok(manyLow.desiredRatingPremiumBps < 0);
  assert.ok(Math.abs(manyHigh.desiredRatingPremiumBps) <= config.maxRatingContributionBps);
});

test('stale, future, and malformed rating inputs become neutral without NaN', () => {
  const stale = calculatePriceTick(input({
    windowEndMs: 3_600_001,
    rating: {
      averageRatingMilli: 5_000,
      ratingCount: 500,
      ratingRecentDeltaMilli: 1_000,
      lastRatingAtMs: 1_800_000,
    },
  }));
  const future = calculatePriceTick(input({ rating: {
    averageRatingMilli: 5_000,
    ratingCount: 500,
    ratingRecentDeltaMilli: 1_000,
    lastRatingAtMs: 1_800_001,
  } }));
  const malformed = calculatePriceTick(input({ rating: {
    averageRatingMilli: Number.NaN,
    ratingCount: 500,
    ratingRecentDeltaMilli: 0,
    lastRatingAtMs: 1_800_000,
  } }));

  for (const result of [stale, future, malformed]) {
    assert.equal(result.desiredRatingPremiumBps, 0);
    assert.ok(['stale', 'invalid'].includes(result.ratingInputStatus));
    assert.equal(Number.isFinite(result.newPrice), true);
  }
});

test('positive, negative, overlapping, and expired events use a bounded absolute target', () => {
  const event = (id, impactType, impactBps, endsAtMs = 2_000_000) => ({
    id,
    status: 'active',
    impactType,
    impactBps,
    startsAtMs: 1_000_000,
    endsAtMs,
  });
  const positive = calculatePriceTick(input({ events: [event('good', 'positive', 30)] }));
  const negative = calculatePriceTick(input({ events: [event('bad', 'negative', 30)] }));
  const stacked = calculatePriceTick(input({ events: [
    event('a', 'positive', 50),
    event('b', 'positive', 50),
    event('c', 'negative', 10),
  ] }));
  const expired = calculatePriceTick(input({ events: [event('old', 'positive', 50, 1_800_000)] }));

  assert.ok(positive.newPrice > 10_000);
  assert.ok(negative.newPrice < 10_000);
  assert.equal(stacked.desiredAdminPremiumBps, 60);
  assert.equal(expired.desiredAdminPremiumBps, 0);
  assert.equal(expired.newPrice, 10_000);
});

test('minimum, maximum, and per-tick bounds hold with integer toward-zero rounding', () => {
  const atMinimum = calculatePriceTick(input({
    club: { currentPrice: 100, fundamentalPrice: 100, previousClose: 100 },
    demand: { sellQuantity: 1_000, sellTradeCount: 1, grossSellAmount: 100_000 },
  }));
  const atMaximum = calculatePriceTick(input({
    club: {
      currentPrice: 1_000_000,
      fundamentalPrice: 1_000_000,
      previousClose: 1_000_000,
    },
    demand: { buyQuantity: 1_000, buyTradeCount: 1, grossBuyAmount: 1_000_000_000 },
  }));
  const lowPrice = calculatePriceTick(input({
    club: { currentPrice: 125, fundamentalPrice: 125, previousClose: 125 },
    demand: { buyQuantity: 1_000, buyTradeCount: 1, grossBuyAmount: 125_000 },
    events: [{
      id: 'boost', status: 'active', impactType: 'positive', impactBps: 60,
      startsAtMs: 1_000_000, endsAtMs: 2_000_000,
    }],
  }));

  assert.equal(atMinimum.newPrice, 100);
  assert.equal(atMaximum.newPrice, 1_000_000);
  assert.equal(lowPrice.newFundamentalPrice, 126);
  assert.ok(lowPrice.newPrice - 125 <= 2);
  assert.ok(Math.abs(lowPrice.appliedChangeBps) <= 200);
});

test('same input is byte-equivalent, event order independent, and all numeric results are finite integers', () => {
  const events = [
    { id: 'z', status: 'active', impactType: 'positive', impactBps: 20,
      startsAtMs: 1_000_000, endsAtMs: 2_000_000 },
    { id: 'a', status: 'active', impactType: 'negative', impactBps: 5,
      startsAtMs: 1_000_000, endsAtMs: 2_000_000 },
  ];
  const first = calculatePriceTick(input({ events }));
  const second = calculatePriceTick(input({ events: [...events].reverse() }));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  for (const value of Object.values(first)) {
    if (typeof value === 'number') {
      assert.equal(Number.isSafeInteger(value), true);
    }
  }
});

test('halted clubs keep price but consume the closed-window volume projection', () => {
  const result = calculatePriceTick(input({
    club: { tradingStatus: 'halted' },
    demand: { buyQuantity: 10, buyTradeCount: 1, grossBuyAmount: 100_000 },
  }));
  assert.equal(result.pricingStatus, 'held');
  assert.equal(result.newPrice, 10_000);
  assert.equal(result.newFundamentalPrice, 10_000);
  assert.equal(result.buyVolume, 10);
});

test('invalid authoritative market or demand input fails closed', () => {
  assert.throws(() => calculatePriceTick(input({ demand: { buyQuantity: -1 } })), /minimum/);
  assert.throws(() => calculatePriceTick(input({ club: { currentPrice: 0 } })), /contract/);
  assert.throws(
    () => calculatePriceTick(input({ demand: { grossBuyAmount: Number.POSITIVE_INFINITY } })),
    /safe integer/,
  );
});

test('recent price history never grows past the configured limit', () => {
  let points = [];
  for (let index = 0; index < 80; index += 1) {
    points = appendBoundedPricePoint(points, {
      windowId: `window-${index}`,
      price: 10_000 + index,
      calculatedAt: { second: index },
    }, 60);
  }
  assert.equal(points.length, 60);
  assert.equal(points[0].windowId, 'window-20');
  assert.equal(points[59].windowId, 'window-79');
});
