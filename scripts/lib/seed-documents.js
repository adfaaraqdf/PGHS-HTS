export const MARKET_DEFAULTS = Object.freeze({
  schemaVersion: 1,
  configVersion: 1,
  initialPrice: 10_000,
  basePrice: 10_000,
  previousClose: 10_000,
  issuedShares: 100_000,
  initialVolume: 0,
  minPrice: 100,
  demandShardCount: 10,
  priceTickSeconds: 60,
  maxPriceDelaySeconds: 120,
  rankingTickSeconds: 60,
  maxRankingDelaySeconds: 120,
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
  maxOrderQuantity: null,
  ratioRoundingMode: 'half-up',
  boundedDeltaRoundingMode: 'toward-zero',
  festivalTimezone: null,
});

export const FORCE_FIELDS = Object.freeze({
  clubs: [
    'schemaVersion',
    'id',
    'displayName',
    'aliases',
    'category',
    'description',
    'etfId',
    'logoUrl',
    'imageUrl',
    'boothLocation',
    'operatingHours',
  ],
  etfs: [
    'schemaVersion',
    'id',
    'displayName',
    'componentClubIds',
    'componentCount',
    'weightingMethod',
    'isTradable',
    'isDiversified',
  ],
  marketConfig: [...Object.keys(MARKET_DEFAULTS), 'updatedAt'],
});

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function selectFields(data, fields) {
  return Object.fromEntries(fields.map((field) => [field, data[field]]));
}

function buildClub(club, now) {
  const { initialPrice, basePrice, previousClose, issuedShares, initialVolume } = MARKET_DEFAULTS;
  return {
    ...club,
    schemaVersion: 1,
    logoUrl: null,
    imageUrl: null,
    boothLocation: null,
    operatingHours: null,
    isActive: true,
    tradingStatus: 'open',
    currentPrice: initialPrice,
    fundamentalPrice: basePrice,
    basePrice,
    previousClose,
    priceChange: 0,
    priceChangeRate: 0,
    issuedShares,
    marketCap: initialPrice * issuedShares,
    buyVolume: initialVolume,
    sellVolume: initialVolume,
    totalVolume: initialVolume,
    averageRating: 3,
    averageRatingMilli: 3_000,
    ratingCount: 0,
    ratingRecentDelta: 0,
    ratingRecentDeltaMilli: 0,
    lastRatingAt: null,
    lastPriceWindowId: null,
    priceCalculatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function buildRating(clubId, now) {
  return {
    schemaVersion: 1,
    clubId,
    averageRating: 3,
    averageRatingMilli: 3_000,
    ratingCount: 0,
    ratingRecentDelta: 0,
    ratingRecentDeltaMilli: 0,
    lastRatingAt: null,
    sourceUpdatedAt: null,
    ingestedAt: now,
    sourceCursor: null,
  };
}

function buildEtf(etf, now) {
  return {
    ...etf,
    schemaVersion: 1,
    componentCount: etf.componentClubIds.length,
    weightingMethod: 'equal',
    isTradable: false,
    isDiversified: etf.componentClubIds.length > 1,
    currentPrice: MARKET_DEFAULTS.initialPrice,
    previousClose: MARKET_DEFAULTS.previousClose,
    priceChange: 0,
    priceChangeRate: 0,
    valuationVersion: 'seed-v1',
    calculatedAt: now,
    sourcePriceAsOf: now,
    updatedAt: now,
    stale: false,
    isFinal: false,
  };
}

export function buildSeedDocuments({ clubs, etfs, now = new Date() }) {
  const documents = [];

  for (const club of clubs) {
    documents.push({ path: `clubs/${club.id}`, kind: 'clubs', data: buildClub(club, now) });
    documents.push({ path: `ratings/${club.id}`, kind: 'ratings', data: buildRating(club.id, now) });
  }

  for (const etf of etfs) {
    documents.push({ path: `etfs/${etf.id}`, kind: 'etfs', data: buildEtf(etf, now) });
  }

  documents.push({
    path: 'market/config',
    kind: 'marketConfig',
    data: { ...MARKET_DEFAULTS, updatedAt: now },
  });
  documents.push({
    path: 'market/state',
    kind: 'marketState',
    data: {
      schemaVersion: 1,
      status: 'closed',
      reason: 'not-opened',
      activeDemandWindowId: null,
      currentPriceWindowId: null,
      configVersion: MARKET_DEFAULTS.configVersion,
      openedAt: null,
      haltedAt: null,
      closedAt: null,
      scheduledOpenAt: null,
      scheduledCloseAt: null,
      timezone: null,
      updatedAt: now,
    },
  });

  validateSeedDocuments(documents, clubs, etfs);
  return documents;
}

export function validateSeedDocuments(documents, clubs, etfs) {
  const paths = documents.map(({ path }) => path);
  assert(paths.length === 52, `시드 문서는 52개여야 합니다. 현재 ${paths.length}개입니다.`);
  assert(new Set(paths).size === paths.length, '시드 문서 경로가 중복되었습니다.');

  const clubDocuments = documents.filter(({ kind }) => kind === 'clubs');
  const ratingDocuments = documents.filter(({ kind }) => kind === 'ratings');
  const etfDocuments = documents.filter(({ kind }) => kind === 'etfs');
  assert(clubDocuments.length === 22 && clubs.length === 22, '동아리 시드는 정확히 22개여야 합니다.');
  assert(ratingDocuments.length === 22, '별점 초기 projection은 동아리별로 22개여야 합니다.');
  assert(etfDocuments.length === 6 && etfs.length === 6, 'ETF 시드는 정확히 6개여야 합니다.');

  const initialSignatures = new Set(clubDocuments.map(({ data }) => JSON.stringify({
    currentPrice: data.currentPrice,
    fundamentalPrice: data.fundamentalPrice,
    basePrice: data.basePrice,
    previousClose: data.previousClose,
    issuedShares: data.issuedShares,
    marketCap: data.marketCap,
    buyVolume: data.buyVolume,
    sellVolume: data.sellVolume,
    totalVolume: data.totalVolume,
  })));
  assert(initialSignatures.size === 1, '모든 동아리의 초기 시장 조건은 같아야 합니다.');

  for (const { data } of clubDocuments) {
    assert(Number.isInteger(data.currentPrice), `${data.id}: 가격은 정수여야 합니다.`);
    assert(Number.isInteger(data.issuedShares), `${data.id}: 발행 수량은 정수여야 합니다.`);
    assert(data.marketCap === data.currentPrice * data.issuedShares, `${data.id}: 시가총액이 가격×발행량과 다릅니다.`);
    assert(data.totalVolume === data.buyVolume + data.sellVolume, `${data.id}: 거래량 합계가 다릅니다.`);
  }

  for (const { data } of etfDocuments) {
    assert(data.weightingMethod === 'equal', `${data.id}: ETF는 동일 가중이어야 합니다.`);
    assert(data.currentPrice === MARKET_DEFAULTS.initialPrice, `${data.id}: ETF 초기 가격이 다릅니다.`);
  }

  const sports = etfDocuments.find(({ data }) => data.id === 'etf-sports');
  assert(sports && sports.data.componentCount === 1 && sports.data.isDiversified === false, '스포츠 ETF는 1종목 비분산 projection이어야 합니다.');

  return {
    documentCount: documents.length,
    clubCount: clubDocuments.length,
    ratingCount: ratingDocuments.length,
    etfCount: etfDocuments.length,
  };
}

export function forceUpdateFor(document) {
  if (document.kind === 'clubs') {
    return selectFields(document.data, FORCE_FIELDS.clubs);
  }
  if (document.kind === 'etfs') {
    return selectFields(document.data, FORCE_FIELDS.etfs);
  }
  if (document.kind === 'marketConfig') {
    return selectFields(document.data, FORCE_FIELDS.marketConfig);
  }
  return null;
}
