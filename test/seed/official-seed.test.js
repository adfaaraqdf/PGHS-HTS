import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadOfficialCatalogs, validateOfficialCatalogs } from '../../scripts/lib/official-catalog.js';
import { buildSeedDocuments, forceUpdateFor, MARKET_DEFAULTS } from '../../scripts/lib/seed-documents.js';
import { createSeedPlan } from '../../scripts/lib/seed-plan.js';
import { parseSeedArguments } from '../../scripts/seed-firestore.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('문서 정본은 동아리 20개와 ETF 6개를 중복 없이 정의한다', async () => {
  const { clubs, etfs, validation } = await loadOfficialCatalogs(repositoryRoot);
  assert.deepEqual(validation, { clubCount: 20, etfCount: 6, componentCount: 20 });
  assert.equal(new Set(clubs.map(({ id }) => id)).size, 20);
  assert.equal(new Set(etfs.map(({ id }) => id)).size, 6);
  assert.equal(new Set(etfs.flatMap(({ componentClubIds }) => componentClubIds)).size, 20);
});

test('Re, invelix, neon의 한글 명칭은 별도 종목이 아니라 alias다', async () => {
  const { clubs } = await loadOfficialCatalogs(repositoryRoot);
  assert.equal(clubs.find(({ id }) => id === 'rechem').displayName, 'Re:chem');
  assert.deepEqual(clubs.find(({ id }) => id === 'rechem').aliases, ['리켐']);
  assert.deepEqual(clubs.find(({ id }) => id === 'invelix').aliases, ['인벨릭스']);
  assert.deepEqual(clubs.find(({ id }) => id === 'neon').aliases, ['네온']);
  assert.equal(clubs.some(({ id }) => ['리켐', '인벨릭스', '네온'].includes(id)), false);
});

test('모든 동아리는 한 ETF에 한 번만 편입되고 스포츠 ETF는 배구사랑 하나다', async () => {
  const { clubs, etfs } = await loadOfficialCatalogs(repositoryRoot);
  const flattened = etfs.flatMap(({ componentClubIds }) => componentClubIds);
  assert.deepEqual(new Set(flattened), new Set(clubs.map(({ id }) => id)));
  assert.equal(flattened.length, new Set(flattened).size);
  assert.deepEqual(etfs.find(({ id }) => id === 'etf-sports').componentClubIds, ['volleyball-love']);
});

test('시드는 48개 문서와 완전히 동일한 초기 시장 조건을 만든다', async () => {
  const { clubs, etfs } = await loadOfficialCatalogs(repositoryRoot);
  const documents = buildSeedDocuments({ clubs, etfs, now: new Date(0) });
  const clubDocuments = documents.filter(({ kind }) => kind === 'clubs');
  const etfDocuments = documents.filter(({ kind }) => kind === 'etfs');
  assert.equal(documents.length, 48);
  assert.equal(clubDocuments.length, 20);
  assert.equal(etfDocuments.length, 6);

  for (const { data } of clubDocuments) {
    assert.equal(data.currentPrice, 10_000);
    assert.equal(data.previousClose, 10_000);
    assert.equal(data.issuedShares, 100_000);
    assert.equal(data.marketCap, 1_000_000_000);
    assert.equal(data.buyVolume, 0);
    assert.equal(data.sellVolume, 0);
    assert.equal(data.totalVolume, 0);
  }
  for (const { data } of etfDocuments) {
    assert.equal(data.currentPrice, 10_000);
    assert.equal(data.weightingMethod, 'equal');
  }
  assert.equal(MARKET_DEFAULTS.ratingLevelWeightPermille + MARKET_DEFAULTS.ratingRecentWeightPermille, 1_000);
});

test('재실행은 중복을 만들지 않고 --force 없이는 기존 문서를 모두 건너뛴다', async () => {
  const { clubs, etfs } = await loadOfficialCatalogs(repositoryRoot);
  const documents = buildSeedDocuments({ clubs, etfs, now: new Date(0) });
  const firstRun = createSeedPlan(documents, []);
  const secondRun = createSeedPlan(documents, documents.map(({ path: documentPath }) => documentPath));
  assert.deepEqual(firstRun.counts, { created: 48, skipped: 0, updated: 0, failed: 0 });
  assert.deepEqual(secondRun.counts, { created: 0, skipped: 48, updated: 0, failed: 0 });
  assert.equal(secondRun.operations.length, 0);
});

test('--force도 가격, 거래량, rating, market state를 갱신하지 않는다', async () => {
  const { clubs, etfs } = await loadOfficialCatalogs(repositoryRoot);
  const documents = buildSeedDocuments({ clubs, etfs, now: new Date(0) });
  const plan = createSeedPlan(documents, documents.map(({ path: documentPath }) => documentPath), { force: true });
  assert.deepEqual(plan.counts, { created: 0, skipped: 21, updated: 27, failed: 0 });

  const clubUpdate = forceUpdateFor(documents.find(({ kind }) => kind === 'clubs'));
  for (const protectedField of ['currentPrice', 'buyVolume', 'sellVolume', 'totalVolume', 'isActive', 'tradingStatus']) {
    assert.equal(Object.hasOwn(clubUpdate, protectedField), false);
  }
  assert.equal(plan.operations.some(({ kind }) => kind === 'ratings' || kind === 'marketState'), false);
});

test('운영 시드는 프로젝트 ID를 동일하게 재확인해야 한다', () => {
  assert.throws(
    () => parseSeedArguments(['--live', '--project', 'pghs-production']),
    /--confirm-project pghs-production/,
  );
  assert.throws(
    () => parseSeedArguments(['--live', '--project', 'pghs-production', '--confirm-project', 'wrong-project']),
    /재확인이 필요/,
  );
  assert.deepEqual(
    parseSeedArguments(['--live', '--project', 'pghs-production', '--confirm-project', 'pghs-production', '--dry-run']),
    {
      projectId: 'pghs-production',
      dryRun: true,
      force: false,
      live: true,
      confirmProject: 'pghs-production',
    },
  );
});

test('잘못된 ETF 편입과 정본 개수는 시드 전에 실패한다', async () => {
  const { clubs, etfs } = await loadOfficialCatalogs(repositoryRoot);
  assert.throws(() => validateOfficialCatalogs(clubs.slice(1), etfs), /정확히 20개/);
  const invalidEtfs = JSON.parse(JSON.stringify(etfs));
  invalidEtfs[0].componentClubIds[0] = invalidEtfs[1].componentClubIds[0];
  assert.throws(() => validateOfficialCatalogs(clubs, invalidEtfs), /중복 편입/);
});
