import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import {
  calculateGrossAmount,
  calculateWeightedAverage,
  safeAdd,
  safeSubtract,
} from './calculation.js';
import { TradeError } from './errors.js';
import { selectDemandShard } from './identifiers.js';
import {
  assertNonNegativeSafeInteger,
  assertPositiveSafeInteger,
} from './validation.js';

const shardCounterFields = Object.freeze([
  'buyQuantity',
  'sellQuantity',
  'buyTradeCount',
  'sellTradeCount',
  'grossBuyAmount',
  'grossSellAmount',
]);

export function createFirestoreTradeRepository({
  firestore = getFirestore(),
  now = () => Timestamp.now(),
} = {}) {
  return Object.freeze({
    async execute(command) {
      try {
        return await executeTradeTransaction(firestore, now, command);
      } catch (error) {
        if (error instanceof TradeError) {
          throw error;
        }
        if (error?.code === 10 || error?.code === 'aborted') {
          throw new TradeError('conflict', '동시 거래와 충돌했습니다. 다시 시도해 주세요.', {
            retryable: true,
          });
        }
        if (error?.code === 8 || error?.code === 'resource-exhausted') {
          throw new TradeError('resource-exhausted', '요청이 많습니다. 잠시 후 다시 시도해 주세요.', {
            retryable: true,
          });
        }
        throw error;
      }
    },
  });
}

function executeTradeTransaction(firestore, now, command) {
  return firestore.runTransaction(async (transaction) => {
    const userRef = firestore.doc(`users/${command.uid}`);
    const requestRef = firestore.doc(`tradeRequests/${command.requestId}`);
    const requestSnapshot = await transaction.get(requestRef);
    if (requestSnapshot.exists) {
      requireActiveUser(await transaction.get(userRef), command.uid);
      return replayStoredRequest(requestSnapshot.data(), command);
    }

    const holdingRef = firestore.doc(`users/${command.uid}/holdings/${command.clubId}`);
    const historyRef = firestore.doc(`users/${command.uid}/tradeHistory/${command.tradeId}`);
    const tradeRef = firestore.doc(`trades/${command.tradeId}`);
    const configRef = firestore.doc('market/config');
    const stateRef = firestore.doc('market/state');
    const clubRef = firestore.doc(`clubs/${command.clubId}`);
    const [userSnapshot, holdingSnapshot, configSnapshot, stateSnapshot, clubSnapshot]
      = await transaction.getAll(userRef, holdingRef, configRef, stateRef, clubRef);

    const user = requireActiveUser(userSnapshot, command.uid);
    const config = requireTradeConfig(configSnapshot);
    requireOrderWithinLimit(command.quantity, config.maxOrderQuantity);
    const state = requireOpenMarket(stateSnapshot, config);
    const club = requireTradableClub(clubSnapshot, command.clubId, config, now());
    const holding = readHolding(holdingSnapshot, command.clubId);
    const grossAmount = calculateGrossAmount(club.currentPrice, command.quantity);
    const assetChange = calculateAssetChange({
      side: command.side,
      cash: user.cash,
      holding,
      quantity: command.quantity,
      executionPrice: club.currentPrice,
      grossAmount,
    });

    const { shardId } = selectDemandShard(command.requestId, config.demandShardCount);
    const windowId = state.activeDemandWindowId;
    const windowRef = firestore.doc(`marketDemand/${command.clubId}/windows/${windowId}`);
    const shardRef = firestore.doc(
      `marketDemand/${command.clubId}/windows/${windowId}/shards/${shardId}`,
    );
    const [windowSnapshot, shardSnapshot] = await transaction.getAll(windowRef, shardRef);
    requireOpenDemandWindow(windowSnapshot, command.clubId, windowId, config);
    const nextShard = incrementDemandShard(
      shardSnapshot.exists ? shardSnapshot.data() : null,
      command.side,
      command.quantity,
      grossAmount,
    );

    const executedAt = now();
    requireTimestamp(executedAt);
    const result = createPublicResult({
      command,
      executionPrice: club.currentPrice,
      grossAmount,
      assetChange,
      executedAt,
    });

    transaction.update(userRef, {
      cash: assetChange.cashAfter,
      updatedAt: executedAt,
    });
    if (assetChange.holdingQuantityAfter === 0) {
      transaction.delete(holdingRef);
    } else {
      transaction.set(holdingRef, {
        schemaVersion: 1,
        clubId: command.clubId,
        quantity: assetChange.holdingQuantityAfter,
        averageBuyPrice: assetChange.averageBuyPriceAfter,
        updatedAt: executedAt,
      });
    }

    transaction.create(historyRef, {
      schemaVersion: 1,
      tradeId: command.tradeId,
      side: command.side,
      clubId: command.clubId,
      quantity: command.quantity,
      executionPrice: club.currentPrice,
      grossAmount,
      cashAfter: assetChange.cashAfter,
      holdingQuantityAfter: assetChange.holdingQuantityAfter,
      averageBuyPriceAfter: assetChange.averageBuyPriceAfter,
      executedAt,
    });
    transaction.create(tradeRef, {
      schemaVersion: 1,
      tradeId: command.tradeId,
      uid: command.uid,
      clubId: command.clubId,
      side: command.side,
      quantity: command.quantity,
      executionPrice: club.currentPrice,
      grossAmount,
      idempotencyDigest: command.idempotencyDigest,
      cashBefore: user.cash,
      cashAfter: assetChange.cashAfter,
      holdingQuantityBefore: holding.quantity,
      holdingQuantityAfter: assetChange.holdingQuantityAfter,
      averageBuyPriceBefore: holding.averageBuyPrice,
      averageBuyPriceAfter: assetChange.averageBuyPriceAfter,
      demandWindowId: windowId,
      shardId,
      configVersion: config.configVersion,
      executedAt,
    });
    transaction.create(requestRef, {
      schemaVersion: 1,
      uid: command.uid,
      idempotencyDigest: command.idempotencyDigest,
      payloadDigest: command.payloadDigest,
      side: command.side,
      clubId: command.clubId,
      quantity: command.quantity,
      status: 'succeeded',
      tradeId: command.tradeId,
      result,
      errorCode: null,
      createdAt: executedAt,
      completedAt: executedAt,
      expiresAt: null,
    });
    transaction.set(shardRef, {
      schemaVersion: 1,
      ...nextShard,
      updatedAt: executedAt,
    });
    return result;
  });
}

function replayStoredRequest(stored, command) {
  const matches = stored?.uid === command.uid
    && stored.idempotencyDigest === command.idempotencyDigest
    && stored.payloadDigest === command.payloadDigest
    && stored.side === command.side
    && stored.clubId === command.clubId
    && stored.quantity === command.quantity;
  if (!matches) {
    throw new TradeError('duplicate-request', '이미 다른 거래에 사용된 요청 키입니다.');
  }
  if (stored.status === 'rejected' && typeof stored.errorCode === 'string') {
    throw new TradeError(stored.errorCode, '이 거래 요청은 이전에 거부되었습니다.');
  }
  if (stored.status !== 'succeeded' || !isValidStoredResult(stored.result, command)) {
    throw new TradeError('internal', '이전 거래 결과를 확인할 수 없습니다.', { retryable: true });
  }
  return Object.freeze({ ...stored.result });
}

function requireActiveUser(snapshot, uid) {
  if (!snapshot.exists) {
    throw new TradeError('permission-denied', '사용자 계정이 준비되지 않았습니다.');
  }
  const user = snapshot.data();
  if (user.uid !== uid || user.accountStatus !== 'active') {
    throw new TradeError('account-disabled', '거래할 수 없는 계정입니다.');
  }
  assertNonNegativeSafeInteger(user.cash);
  return user;
}

function requireTradeConfig(snapshot) {
  if (!snapshot.exists) {
    throw new TradeError('internal', '시장 설정을 확인할 수 없습니다.');
  }
  const config = snapshot.data();
  assertPositiveSafeInteger(config.configVersion);
  assertPositiveSafeInteger(config.demandShardCount);
  if (config.demandShardCount > 100) {
    throw new TradeError('internal', '수요 샤드 설정을 확인할 수 없습니다.');
  }
  assertPositiveSafeInteger(config.minPrice);
  assertPositiveSafeInteger(config.maxPriceDelaySeconds);
  if (!Number.isSafeInteger(config.maxOrderQuantity) || config.maxOrderQuantity <= 0) {
    throw new TradeError('internal', '주문 상한 설정이 완료되지 않았습니다.');
  }
  return config;
}

function requireOpenMarket(snapshot, config) {
  if (!snapshot.exists) {
    throw new TradeError('market-closed', '시장이 열려 있지 않습니다.');
  }
  const state = snapshot.data();
  if (state.status !== 'open') {
    throw new TradeError('market-closed', '시장이 열려 있지 않습니다.');
  }
  if (
    state.configVersion !== config.configVersion
    || typeof state.activeDemandWindowId !== 'string'
    || !state.activeDemandWindowId
    || state.activeDemandWindowId.includes('/')
    || state.activeDemandWindowId.length > 128
  ) {
    throw new TradeError('market-closed', '시장 거래 준비가 완료되지 않았습니다.');
  }
  return state;
}

function requireTradableClub(snapshot, clubId, config, currentTime) {
  if (!snapshot.exists || snapshot.data()?.id !== clubId) {
    throw new TradeError('club-not-found', '존재하지 않는 종목입니다.');
  }
  const club = snapshot.data();
  if (club.isActive !== true || club.tradingStatus !== 'open') {
    throw new TradeError('trading-halted', '현재 거래할 수 없는 종목입니다.');
  }
  assertPositiveSafeInteger(club.currentPrice);
  if (club.currentPrice < config.minPrice) {
    throw new TradeError('internal', '종목 가격 데이터가 올바르지 않습니다.');
  }
  requireTimestamp(currentTime);
  requireTimestamp(club.priceCalculatedAt);
  const priceAgeMilliseconds = currentTime.toMillis() - club.priceCalculatedAt.toMillis();
  if (priceAgeMilliseconds > config.maxPriceDelaySeconds * 1_000) {
    throw new TradeError('price-stale', '가격 갱신이 지연되어 거래를 잠시 중단했습니다.', {
      retryable: true,
    });
  }
  return club;
}

function requireOrderWithinLimit(quantity, maximum) {
  if (quantity > maximum) {
    throw new TradeError('invalid-quantity', '한 번에 거래할 수 있는 수량을 초과했습니다.');
  }
}

function readHolding(snapshot, clubId) {
  if (!snapshot.exists) {
    return Object.freeze({ quantity: 0, averageBuyPrice: null });
  }
  const holding = snapshot.data();
  if (holding.clubId !== clubId) {
    throw new TradeError('internal', '보유 종목 데이터를 확인할 수 없습니다.');
  }
  assertPositiveSafeInteger(holding.quantity);
  assertPositiveSafeInteger(holding.averageBuyPrice);
  return Object.freeze({
    quantity: holding.quantity,
    averageBuyPrice: holding.averageBuyPrice,
  });
}

function calculateAssetChange({
  side,
  cash,
  holding,
  quantity,
  executionPrice,
  grossAmount,
}) {
  if (side === 'buy') {
    const cashAfter = safeSubtract(
      cash,
      grossAmount,
      'insufficient-funds',
      '보유 현금이 부족합니다.',
    );
    const holdingQuantityAfter = safeAdd(holding.quantity, quantity);
    const averageBuyPriceAfter = calculateWeightedAverage({
      oldQuantity: holding.quantity,
      oldAverageBuyPrice: holding.averageBuyPrice,
      buyQuantity: quantity,
      executionPrice,
    });
    return Object.freeze({ cashAfter, holdingQuantityAfter, averageBuyPriceAfter });
  }

  const holdingQuantityAfter = safeSubtract(
    holding.quantity,
    quantity,
    'insufficient-holdings',
    '보유 수량이 부족합니다.',
  );
  const cashAfter = safeAdd(cash, grossAmount);
  return Object.freeze({
    cashAfter,
    holdingQuantityAfter,
    averageBuyPriceAfter: holdingQuantityAfter === 0 ? null : holding.averageBuyPrice,
  });
}

function requireOpenDemandWindow(snapshot, clubId, windowId, config) {
  if (!snapshot.exists) {
    throw new TradeError('market-closed', '시장 수요 집계 창이 열려 있지 않습니다.');
  }
  const window = snapshot.data();
  if (
    window.clubId !== clubId
    || window.windowId !== windowId
    || window.status !== 'open'
    || window.shardCount !== config.demandShardCount
    || window.configVersion !== config.configVersion
  ) {
    throw new TradeError('market-closed', '시장 수요 집계 창이 열려 있지 않습니다.');
  }
}

function incrementDemandShard(stored, side, quantity, grossAmount) {
  if (stored && stored.schemaVersion !== 1) {
    throw new TradeError('internal', '수요 집계 데이터를 확인할 수 없습니다.');
  }
  const counters = {};
  for (const field of shardCounterFields) {
    counters[field] = stored ? assertNonNegativeSafeInteger(stored[field]) : 0;
  }

  if (side === 'buy') {
    counters.buyQuantity = safeAdd(counters.buyQuantity, quantity);
    counters.buyTradeCount = safeAdd(counters.buyTradeCount, 1);
    counters.grossBuyAmount = safeAdd(counters.grossBuyAmount, grossAmount);
  } else {
    counters.sellQuantity = safeAdd(counters.sellQuantity, quantity);
    counters.sellTradeCount = safeAdd(counters.sellTradeCount, 1);
    counters.grossSellAmount = safeAdd(counters.grossSellAmount, grossAmount);
  }
  return Object.freeze(counters);
}

function createPublicResult({ command, executionPrice, grossAmount, assetChange, executedAt }) {
  return Object.freeze({
    ok: true,
    tradeId: command.tradeId,
    side: command.side,
    clubId: command.clubId,
    quantity: command.quantity,
    executionPrice,
    grossAmount,
    cashAfter: assetChange.cashAfter,
    holdingQuantityAfter: assetChange.holdingQuantityAfter,
    averageBuyPriceAfter: assetChange.averageBuyPriceAfter,
    executedAt: executedAt.toDate().toISOString(),
    schemaVersion: 1,
  });
}

function isValidStoredResult(result, command) {
  return result?.ok === true
    && result.tradeId === command.tradeId
    && result.side === command.side
    && result.clubId === command.clubId
    && result.quantity === command.quantity
    && Number.isSafeInteger(result.executionPrice)
    && result.executionPrice > 0
    && Number.isSafeInteger(result.grossAmount)
    && result.grossAmount > 0
    && Number.isSafeInteger(result.cashAfter)
    && result.cashAfter >= 0
    && Number.isSafeInteger(result.holdingQuantityAfter)
    && result.holdingQuantityAfter >= 0
    && (result.averageBuyPriceAfter === null
      || (Number.isSafeInteger(result.averageBuyPriceAfter)
        && result.averageBuyPriceAfter > 0))
    && typeof result.executedAt === 'string'
    && result.schemaVersion === 1;
}

function requireTimestamp(value) {
  if (!value || typeof value.toMillis !== 'function' || typeof value.toDate !== 'function') {
    throw new TradeError('internal', '서버 시각 데이터를 확인할 수 없습니다.');
  }
}
