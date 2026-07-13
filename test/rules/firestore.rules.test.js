import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, before, beforeEach, describe } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectId = process.env.GCLOUD_PROJECT || 'demo-pghs-hts-rules';
const [host, portText] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let environment;

function verifiedDatabase(uid = 'user-a', claims = {}) {
  return environment.authenticatedContext(uid, {
    email: `${uid}@students.example.test`,
    email_verified: true,
    schoolVerified: true,
    ...claims,
  }).firestore();
}

async function seedFixtures() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    const now = Timestamp.now();
    await Promise.all([
      setDoc(doc(database, 'users/user-a'), {
        uid: 'user-a',
        cash: 1_000_000,
        estimatedTotalAsset: 1_000_000,
        accountStatus: 'active',
      }),
      setDoc(doc(database, 'users/user-b'), {
        uid: 'user-b',
        cash: 1_000_000,
        estimatedTotalAsset: 1_000_000,
        accountStatus: 'active',
      }),
      setDoc(doc(database, 'users/user-a/holdings/rechem'), {
        clubId: 'rechem',
        quantity: 1,
        averageBuyPrice: 10_000,
      }),
      setDoc(doc(database, 'users/user-a/tradeHistory/trade-1'), {
        tradeId: 'trade-1',
        executedAt: now,
      }),
      setDoc(doc(database, 'clubs/rechem'), {
        id: 'rechem',
        isActive: true,
        currentPrice: 10_000,
        totalVolume: 0,
      }),
      setDoc(doc(database, 'etfs/etf-natural-science'), {
        id: 'etf-natural-science',
        currentPrice: 10_000,
      }),
      setDoc(doc(database, 'ratings/rechem'), {
        clubId: 'rechem',
        averageRatingMilli: 3_000,
      }),
      setDoc(doc(database, 'market/config'), { schemaVersion: 1, initialPrice: 10_000 }),
      setDoc(doc(database, 'market/state'), { schemaVersion: 1, status: 'closed' }),
      setDoc(doc(database, 'publicLeaderboard/current'), {
        entries: [{ nickname: '학생', rank: 1, estimatedTotalAsset: 1_000_000 }],
      }),
      setDoc(doc(database, 'adminEvents/active-event'), {
        status: 'active',
        startsAt: now,
        endsAt: Timestamp.fromMillis(now.toMillis() + 60_000),
      }),
      setDoc(doc(database, 'auditLogs/log-1'), { action: 'seed', createdAt: now }),
      setDoc(doc(database, 'leaderboardEntries/user-a'), { estimatedTotalAsset: 1_000_000, publicId: 'public-a' }),
    ]);
  });
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(portText),
      rules: await readFile(path.join(repositoryRoot, 'firestore.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seedFixtures();
});

after(async () => {
  await environment.cleanup();
});

describe('허용된 최소 읽기', () => {
  test('활성 학교 사용자는 자기 계정과 bounded 공개 projection을 읽는다', async () => {
    const database = verifiedDatabase();
    await assertSucceeds(getDoc(doc(database, 'users/user-a')));
    await assertSucceeds(getDocs(query(collection(database, 'clubs'), limit(22))));
    await assertSucceeds(getDocs(query(collection(database, 'users/user-a/tradeHistory'), limit(50))));
    await assertSucceeds(getDoc(doc(database, 'publicLeaderboard/current')));
  });

  test('bounded limit 없는 시장 목록은 거부한다', async () => {
    await assertFails(getDocs(collection(verifiedDatabase(), 'clubs')));
  });

  test('활성 이벤트 목록은 상태 제약과 limit을 모두 요구한다', async () => {
    const database = verifiedDatabase();
    const activeEvents = query(collection(database, 'adminEvents'), where('status', '==', 'active'), limit(20));
    await assertSucceeds(getDocs(activeEvents));
    await assertFails(getDocs(query(collection(database, 'adminEvents'), limit(20))));
  });
});

describe('인증과 개인정보 경계', () => {
  test('인증되지 않은 읽기를 차단한다', async () => {
    const database = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(database, 'clubs/rechem')));
  });

  test('학교 검증 claim 없는 외부 도메인 계정을 차단한다', async () => {
    const database = environment.authenticatedContext('external', {
      email: 'external@example.com',
      email_verified: true,
      schoolVerified: false,
    }).firestore();
    await assertFails(getDoc(doc(database, 'clubs/rechem')));
  });

  test('다른 사용자의 비공개 자산을 읽지 못한다', async () => {
    const database = verifiedDatabase('user-b');
    await assertFails(getDoc(doc(database, 'users/user-a')));
    await assertFails(getDoc(doc(database, 'users/user-a/holdings/rechem')));
  });

  test('UID 기반 공개 프로필 원본은 일반 사용자에게 공개하지 않는다', async () => {
    await assertFails(getDoc(doc(verifiedDatabase(), 'publicProfiles/user-a')));
  });
});

describe('권위 데이터 직접 조작 차단', () => {
  test('자신의 현금 증가와 음수 현금, 잘못된 타입, 추가 필드를 차단한다', async () => {
    const database = verifiedDatabase();
    await assertFails(updateDoc(doc(database, 'users/user-a'), { cash: 2_000_000 }));
    await assertFails(updateDoc(doc(database, 'users/user-a'), { cash: -1 }));
    await assertFails(updateDoc(doc(database, 'users/user-a'), { cash: '1000000' }));
    await assertFails(updateDoc(doc(database, 'users/user-a'), { unauthorizedField: true }));
  });

  test('보유 수량 직접 증가와 음수 수량을 차단한다', async () => {
    const reference = doc(verifiedDatabase(), 'users/user-a/holdings/rechem');
    await assertFails(updateDoc(reference, { quantity: 2 }));
    await assertFails(updateDoc(reference, { quantity: -1 }));
  });

  test('가짜 개인·전역 거래 생성을 차단한다', async () => {
    const database = verifiedDatabase();
    await assertFails(setDoc(doc(database, 'users/user-a/tradeHistory/fake'), { quantity: 1 }));
    await assertFails(setDoc(doc(database, 'trades/fake'), { uid: 'user-a', quantity: 1 }));
    await assertFails(setDoc(doc(database, 'tradeRequests/fake'), { uid: 'user-a' }));
  });

  test('종목 가격, 소수점 가격, 거래량을 직접 변경하지 못한다', async () => {
    const reference = doc(verifiedDatabase(), 'clubs/rechem');
    await assertFails(updateDoc(reference, { currentPrice: 20_000 }));
    await assertFails(updateDoc(reference, { currentPrice: 10_000.5 }));
    await assertFails(updateDoc(reference, { totalVolume: 1 }));
  });

  test('ETF 가격과 별점 집계를 직접 변경하지 못한다', async () => {
    const database = verifiedDatabase();
    await assertFails(updateDoc(doc(database, 'etfs/etf-natural-science'), { currentPrice: 20_000 }));
    await assertFails(updateDoc(doc(database, 'ratings/rechem'), { averageRatingMilli: 5_000 }));
  });

  test('랭킹 점수와 공개 TOP10을 직접 변경하지 못한다', async () => {
    const database = verifiedDatabase();
    await assertFails(updateDoc(doc(database, 'leaderboardEntries/user-a'), { estimatedTotalAsset: 9_999_999 }));
    await assertFails(updateDoc(doc(database, 'publicLeaderboard/current'), { entries: [] }));
  });

  test('일반 사용자는 관리자 이벤트를 생성하지 못한다', async () => {
    await assertFails(setDoc(doc(verifiedDatabase(), 'adminEvents/fake'), { status: 'active' }));
  });

  test('위조한 admin claim도 브라우저 직접 쓰기 권한을 얻지 못한다', async () => {
    const database = verifiedDatabase('user-a', { admin: true, role: 'market-operator' });
    await assertFails(setDoc(doc(database, 'adminEvents/forged-admin'), { status: 'active' }));
    await assertFails(updateDoc(doc(database, 'market/state'), { status: 'open' }));
  });

  test('감사 로그는 수정하거나 삭제할 수 없다', async () => {
    const reference = doc(verifiedDatabase(), 'auditLogs/log-1');
    await assertFails(updateDoc(reference, { action: 'tampered' }));
    await assertFails(deleteDoc(reference));
  });
});

test('Rules 테스트 fixture 자체가 정상 생성되었다', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDoc(doc(context.firestore(), 'users/user-a'));
    assert.equal(snapshot.data().cash, 1_000_000);
  });
});
