import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadOfficialCatalogs } from './lib/official-catalog.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { clubs, etfs, validation } = await loadOfficialCatalogs(repositoryRoot);
const seedSql = await readFile(path.join(repositoryRoot, 'supabase', 'seed.sql'), 'utf8');

function extractSeedIds(tableName) {
  const statement = seedSql.match(new RegExp(
    `insert into public\\.${tableName}\\([\\s\\S]*?\\) values([\\s\\S]*?)\\non conflict \\(id\\) do nothing;`,
    'i',
  ));
  if (!statement) {
    throw new Error(`Supabase seed에서 ${tableName} INSERT 문을 찾지 못했습니다.`);
  }
  return [...statement[1].matchAll(/\(\s*'([^']+)'/g)].map((match) => match[1]);
}

function assertExactIds(label, actualIds, officialItems) {
  const expectedIds = officialItems.map((item) => item.id).sort();
  const sortedActualIds = [...actualIds].sort();
  if (new Set(actualIds).size !== actualIds.length) {
    throw new Error(`Supabase seed의 ${label} ID가 중복되었습니다.`);
  }
  if (JSON.stringify(sortedActualIds) !== JSON.stringify(expectedIds)) {
    throw new Error(`Supabase seed의 ${label} ID 집합이 공식 카탈로그와 다릅니다.`);
  }
}

assertExactIds('동아리', extractSeedIds('clubs'), clubs);
assertExactIds('ETF', extractSeedIds('etfs'), etfs);

console.log(`공식 카탈로그 검증 완료: 동아리 ${validation.clubCount}개, ETF ${validation.etfCount}개, ETF 편입 ${validation.componentCount}개`);
console.log('Supabase seed 검증 완료: 공식 동아리 20개와 ETF 6개 ID 집합이 정확히 일치합니다.');
