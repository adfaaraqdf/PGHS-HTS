import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadOfficialCatalogs } from './lib/official-catalog.js';
import { buildSeedDocuments } from './lib/seed-documents.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { clubs, etfs, validation } = await loadOfficialCatalogs(repositoryRoot);
const documents = buildSeedDocuments({ clubs, etfs, now: new Date(0) });

console.log(`공식 카탈로그 검증 완료: 동아리 ${validation.clubCount}개, ETF ${validation.etfCount}개, ETF 편입 ${validation.componentCount}개`);
console.log(`시드 문서 검증 완료: 총 ${documents.length}개 (동아리 20, 별점 20, ETF 6, 시장 2)`);
