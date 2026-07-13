import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('Firebase 설정은 Rules와 index 파일을 모두 연결한다', async () => {
  const firebaseConfig = JSON.parse(await readFile(path.join(repositoryRoot, 'firebase.json'), 'utf8'));
  assert.equal(firebaseConfig.firestore.rules, 'firestore.rules');
  assert.equal(firebaseConfig.firestore.indexes, 'firestore.indexes.json');
});

test('필수 시장·뉴스·이벤트·랭킹·개인 거래 이력 index를 선언한다', async () => {
  const indexConfig = JSON.parse(await readFile(path.join(repositoryRoot, 'firestore.indexes.json'), 'utf8'));
  const signatures = indexConfig.indexes.map((index) => ({
    collectionGroup: index.collectionGroup,
    queryScope: index.queryScope,
    fieldPaths: index.fields.map(({ fieldPath }) => fieldPath),
  }));

  for (const sortField of ['currentPrice', 'priceChangeRate', 'totalVolume']) {
    assert.ok(signatures.some((index) => (
      index.collectionGroup === 'clubs'
      && index.queryScope === 'COLLECTION'
      && index.fieldPaths.join(',') === `isActive,${sortField}`
    )));
  }
  assert.ok(signatures.some((index) => index.collectionGroup === 'news' && index.fieldPaths.includes('publishedAt')));
  assert.ok(signatures.some((index) => index.collectionGroup === 'adminEvents' && index.fieldPaths.includes('startsAt')));
  assert.ok(signatures.some((index) => index.collectionGroup === 'leaderboardEntries' && index.fieldPaths.join(',') === 'estimatedTotalAsset,publicId'));
  assert.ok(signatures.some((index) => (
    index.collectionGroup === 'tradeHistory'
    && index.queryScope === 'COLLECTION'
    && index.fieldPaths.join(',') === 'executedAt,__name__'
  )));
});
