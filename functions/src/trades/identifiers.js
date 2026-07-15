import { createHash } from 'node:crypto';

export function createTradeIdentifiers({ uid, idempotencyKey, side, clubId, quantity }) {
  const requestId = digest(`trade-request:v1\0${uid}\0${idempotencyKey}`);
  const idempotencyDigest = digest(`idempotency:v1\0${idempotencyKey}`);
  const payloadDigest = digest(`trade-payload:v1\0${side}\0${clubId}\0${quantity}`);

  return Object.freeze({
    requestId,
    tradeId: requestId,
    idempotencyDigest,
    payloadDigest,
  });
}

export function selectDemandShard(requestId, shardCount) {
  const hashPrefix = requestId.slice(0, 16);
  const index = Number(BigInt(`0x${hashPrefix}`) % BigInt(shardCount));
  const width = Math.max(2, String(shardCount - 1).length);
  return Object.freeze({ index, shardId: String(index).padStart(width, '0') });
}

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
