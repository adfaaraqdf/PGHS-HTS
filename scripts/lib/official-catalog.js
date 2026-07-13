import { readFile } from 'node:fs/promises';
import path from 'node:path';

const CLUB_MARKER = '## 공식 목록 (`officialClubCatalog`)';
const ETF_MARKER = '## 공식 목록 (`officialEtfCatalog`)';
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readJsonBlock(markdown, marker, sourceName) {
  const markerIndex = markdown.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`${sourceName}: 정본 marker를 찾을 수 없습니다: ${marker}`);
  }

  const remaining = markdown.slice(markerIndex + marker.length);
  const match = remaining.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) {
    throw new Error(`${sourceName}: 정본 JSON code block을 찾을 수 없습니다.`);
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`${sourceName}: 정본 JSON을 해석할 수 없습니다. ${error.message}`);
  }
}

function normalizeSearchToken(value) {
  return value.normalize('NFC').trim().toLocaleLowerCase('en-US');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function validateOfficialCatalogs(clubs, etfs) {
  assert(Array.isArray(clubs), '동아리 정본은 배열이어야 합니다.');
  assert(Array.isArray(etfs), 'ETF 정본은 배열이어야 합니다.');
  assert(clubs.length === 20, `공식 동아리는 정확히 20개여야 합니다. 현재 ${clubs.length}개입니다.`);
  assert(etfs.length === 6, `공식 ETF는 정확히 6개여야 합니다. 현재 ${etfs.length}개입니다.`);

  const clubIds = new Set();
  const etfIds = new Set();
  const tokenOwners = new Map();

  for (const etf of etfs) {
    assert(etf && typeof etf === 'object', 'ETF 항목은 객체여야 합니다.');
    assert(typeof etf.id === 'string' && ID_PATTERN.test(etf.id), `잘못된 ETF ID: ${etf.id}`);
    assert(!etfIds.has(etf.id), `중복 ETF ID: ${etf.id}`);
    assert(typeof etf.displayName === 'string' && etf.displayName.trim(), `${etf.id}: displayName이 필요합니다.`);
    assert(Array.isArray(etf.componentClubIds) && etf.componentClubIds.length > 0, `${etf.id}: 구성 종목이 필요합니다.`);
    assert(new Set(etf.componentClubIds).size === etf.componentClubIds.length, `${etf.id}: 구성 종목이 중복되었습니다.`);
    etfIds.add(etf.id);
  }

  for (const club of clubs) {
    assert(club && typeof club === 'object', '동아리 항목은 객체여야 합니다.');
    assert(typeof club.id === 'string' && ID_PATTERN.test(club.id), `잘못된 동아리 ID: ${club.id}`);
    assert(!clubIds.has(club.id), `중복 동아리 ID: ${club.id}`);
    assert(Array.isArray(club.aliases) && club.aliases.every((alias) => typeof alias === 'string'), `${club.id}: aliases는 문자열 배열이어야 합니다.`);

    for (const field of ['displayName', 'category', 'description', 'etfId']) {
      assert(typeof club[field] === 'string' && club[field].trim(), `${club.id}: ${field}가 필요합니다.`);
    }

    assert(etfIds.has(club.etfId), `${club.id}: 알 수 없는 ETF ${club.etfId}`);
    clubIds.add(club.id);

    for (const rawToken of [club.id, club.displayName, ...club.aliases]) {
      const token = normalizeSearchToken(rawToken);
      const owner = tokenOwners.get(token);
      assert(!owner || owner === club.id, `검색 토큰 충돌: ${rawToken} (${owner}, ${club.id})`);
      tokenOwners.set(token, club.id);
    }
  }

  for (const aliasOnly of ['리켐', '인벨릭스', '네온']) {
    assert(!clubIds.has(aliasOnly), `${aliasOnly}은 별도 동아리 ID가 될 수 없습니다.`);
  }

  const assignedIds = etfs.flatMap((etf) => etf.componentClubIds);
  assert(assignedIds.length === 20, `ETF 구성 종목 합계는 20개여야 합니다. 현재 ${assignedIds.length}개입니다.`);
  assert(new Set(assignedIds).size === 20, '동아리가 여러 ETF에 중복 편입되었습니다.');

  for (const assignedId of assignedIds) {
    assert(clubIds.has(assignedId), `ETF가 알 수 없는 동아리를 참조합니다: ${assignedId}`);
  }

  for (const club of clubs) {
    const etf = etfs.find((candidate) => candidate.id === club.etfId);
    assert(etf.componentClubIds.includes(club.id), `${club.id}: club.etfId와 ETF 역방향 구성이 다릅니다.`);
  }

  const sports = etfs.find((etf) => etf.id === 'etf-sports');
  assert(
    sports && sports.componentClubIds.length === 1 && sports.componentClubIds[0] === 'volleyball-love',
    '스포츠 ETF는 배구사랑 하나만 포함해야 합니다.',
  );

  return {
    clubCount: clubs.length,
    etfCount: etfs.length,
    componentCount: assignedIds.length,
  };
}

export async function loadOfficialCatalogs(repositoryRoot) {
  const clubPath = path.join(repositoryRoot, 'docs', 'CLUB_CATALOG.md');
  const etfPath = path.join(repositoryRoot, 'docs', 'ETF_STRUCTURE.md');
  const [clubMarkdown, etfMarkdown] = await Promise.all([
    readFile(clubPath, 'utf8'),
    readFile(etfPath, 'utf8'),
  ]);

  const clubs = readJsonBlock(clubMarkdown, CLUB_MARKER, clubPath);
  const etfs = readJsonBlock(etfMarkdown, ETF_MARKER, etfPath);
  const validation = validateOfficialCatalogs(clubs, etfs);

  return { clubs, etfs, validation };
}
