# 시스템 아키텍처

## 1. 문서 목적과 범위

이 문서는 학교 축제용 실시간 모의 주식 서비스의 0단계 기준 아키텍처다. 대상 규모는 축제 당일 수백 명 동시 접속이며, 기능 수보다 자산 무결성, 서버 권위, 장애 복구, 모바일 사용성, Firebase 비용 예측 가능성을 우선한다. 이 단계에서는 애플리케이션 코드를 정의하지 않는다.

공식 데이터 범위는 동아리 20개와 조회 전용 ETF 6개다. 지정가 주문, 호가창, 공매도, 파생상품, 실제 화폐, 사용자 간 송금·주식 양도는 범위 밖이다.

## 2. 핵심 아키텍처 결정

1. 브라우저는 인증·표시·요청만 담당한다. 현금, 보유 수량, 평균 매수가, 체결 가격, 거래 기록, 종목 가격, 집계, 랭킹, 관리자 상태의 최종 기록 권한은 모두 서버에 있다.
2. 매수·매도와 사용자 초기화는 인증된 callable Cloud Functions를 통한다. 거래 한 건의 자산 변경과 중복 방지 기록은 하나의 Firestore 트랜잭션으로 원자적으로 확정한다.
3. 거래 요청은 `idempotencyKey`로 식별한다. 동일 사용자·키·요청 본문은 이전 결과를 재사용하고, 같은 키의 다른 본문은 거부한다.
4. 인기 종목 병목을 피하기 위해 거래가 `clubs/{clubId}`를 직접 갱신하지 않는다. 거래 수요는 종목·시간 창별 10개 고정 샤드에 누적하고 가격 엔진이 닫힌 창만 집계한다.
5. 가격 엔진은 1분 단위 스케줄로 실행하며 정상 목표 주기 60초, 허용 최대 지연 120초다. 한 tick의 총 변동은 ±200bp로 제한한다.
6. 랭킹은 내부 원장과 공개 투영을 분리한다. `leaderboardEntries/{uid}`는 클라이언트에서 목록 조회할 수 없고, `publicLeaderboard/current`에는 닉네임·총자산·순위만 최대 10개 둔다. UID·이메일·실명·내부 `publicId`는 공개하지 않는다. 목표 주기 60초, 최대 지연 120초다.
7. ETF는 거래 자산이 아니라 동일 가중 조회용 지수다. 한 가격 회차의 20개 종목 반영이 끝난 뒤 같은 회차 번호로 계산한다.
8. Firestore 실시간 리스너는 현재 보이는 화면의 제한된 문서·쿼리에만 연결하고 화면 이탈, 로그아웃, 백그라운드 전환 시 해제한다.
9. Firebase Authentication은 신원을, Security Rules는 클라이언트 접근을, App Check는 비정상 클라이언트 남용 완화를 담당한다. Admin SDK를 쓰는 서버 함수는 Rules를 우회하므로 모든 권한·타입·상태 검증을 함수에서 반복한다.

## 3. 논리 구성

| 계층 | 구성 요소 | 책임 |
|---|---|---|
| 모바일 웹 | Vanilla HTML/CSS/JavaScript, Firebase Web SDK | Google 로그인, 입력 검증 보조, 최소 범위 조회, callable 호출, 오류·재시도 UI |
| 인증·앱 진위 | Firebase Authentication, App Check | 학교 Google 계정 토큰, 이메일 검증 상태, 승인된 앱 요청 신호 |
| 명령 계층 | callable Cloud Functions | 사용자 초기화, 매수·매도, 내 순위 조회, 관리자 명령, 별점 공급자 연동 |
| 데이터 계층 | Cloud Firestore | 사용자 원장, 보유 종목, 불변 거래, 시장 상태, 공식 카탈로그, 제한된 공개 투영 |
| 비동기 계층 | scheduled/triggered Cloud Functions | 수요 창 회전, 가격·ETF·랭킹 계산, 감사·정합성 검사, 만료 데이터 정리 |
| 운영 계층 | Firebase Hosting, Emulator Suite, Cloud Logging/Monitoring | 배포, 사전 검증, 경보, 복구 근거 |

### 신뢰 경계

- 브라우저가 보내는 UID, 가격, 총액, 현금, 보유량, 관리자 여부, 시간은 신뢰하지 않는다.
- Auth 토큰의 `uid`, `email`, `email_verified`도 서버에서 다시 확인한다. 허용 도메인은 단일 서버 설정 `ALLOWED_SCHOOL_DOMAIN`을 기준으로 한다.
- 관리자 custom claim은 필요조건이지 단독 충분조건이 아니다. 함수는 토큰 만료, 계정 상태, 시장 상태와 요청 허용 목록을 함께 검사한다.
- 외부 별점 시스템은 신뢰된 내부 원장이 아니다. 공급자 응답을 서버 어댑터에서 검증·정규화한 집계값만 가격 입력으로 사용한다.

## 4. 주요 데이터 흐름

### 4.1 로그인과 최초 사용자 초기화

1. 클라이언트가 Google 인증을 완료한다.
2. UI는 도메인을 조기 확인하되 이것을 보안 통제로 간주하지 않는다.
3. 초기화 함수가 토큰의 UID, 검증된 이메일, 허용 학교 도메인과 계정 상태를 확인한다.
4. Firestore 트랜잭션이 `users/{uid}` 존재 여부를 읽고, 없을 때만 `initialGrantApplied=true`, 초기 현금 1,000,000원과 생성 시각을 함께 기록한다. 재호출은 기존 문서를 사용하며 현금을 다시 지급하지 않는다.
5. 서버는 검증 성공 후 환경값을 Rules에 직접 주입하는 대신 `schoolVerified=true` custom claim을 발급하고 클라이언트가 ID token을 새로고침하게 한다. Rules는 이 claim을 요구하며 모든 callable은 현재 토큰 이메일·도메인을 다시 검증한다.
6. 공개 닉네임 정보와 내부 랭킹 엔트리는 서버가 별도 투영한다. 이메일은 사용자 문서에 복제하지 않는다.

보장 범위는 Google UID당 사용자 문서 하나다. 한 학생이 여러 학교 계정을 소유한 상황은 학생 명부나 별도 학생 식별자 없이는 완전히 차단할 수 없다.

### 4.2 매수·매도

1. 클라이언트는 `clubId`, 양의 정수 `quantity`, 충분한 무작위성을 가진 `idempotencyKey`만 보낸다.
2. 함수는 Auth, App Check, 학교 도메인, 계정 상태, 시장·종목 거래 상태를 확인한다.
3. 트랜잭션은 중복 방지 문서, 사용자, 보유 종목, 시장 상태, 종목의 서버 가격을 읽는다.
4. 서버가 원 단위 체결 금액과 새 현금·수량·평균 매수가를 계산한다.
5. 같은 트랜잭션에서 사용자, 보유 종목, 개인 거래 이력, 전역 거래 원장, idempotency 결과, 현재 수요 창의 결정적 샤드를 기록한다.
6. 응답 유실 후 같은 키로 재호출해도 자산 변경은 한 번만 일어나고 저장된 결과가 반환된다.

가격 엔진이 `clubs/{clubId}`를 갱신하는 순간과 거래가 겹치면 Firestore의 충돌 감지·자동 재시도 후 최신 서버 가격으로 체결한다. 시장 정지 명령도 거래가 읽는 `market/state`를 갱신하므로 정지 전에 시작했어도 그 뒤 커밋하려는 트랜잭션은 재검증된다.

### 4.3 수요 창과 가격 갱신

1. 거래는 `market/state.activeDemandWindowId`를 읽고 `marketDemand/{clubId}/windows/{windowId}/shards/{00..09}` 중 요청 해시로 정한 한 샤드만 증가시킨다.
2. 스케줄러가 lease를 획득하고 트랜잭션으로 활성 창을 다음 창으로 회전한다. 이전 창을 읽었던 미완료 거래는 충돌 후 새 창으로 재시도하므로 닫힌 창에는 뒤늦은 커밋이 남지 않는다.
3. 가격 작업은 닫힌 창의 종목당 10개 샤드, 별점 스냅샷, 적용 가능한 관리자 이벤트, 설정 버전을 읽는다.
4. 수요는 정수 `fundamentalPrice`를 움직이고 별점·이벤트는 그 기준의 절대 target premium을 만든다. 현재가는 target을 향해 tick당 상한 안에서 이동하므로 반복 복리와 최저가 반올림 비대칭을 피한다.
5. `priceRuns/{windowId_clubId}`를 idempotency 경계로 사용해 20개 후보 결과를 만들되 아직 공개 `clubs`에는 쓰지 않는다.
6. 20개 run이 완료되면 `priceVersions/{windowId}`를 ready로 만든다. 5단계 pre-ETF publisher는 20개 `clubs`, `market/state.currentPriceWindowId`, version 상태를 한 transaction에 커밋한다. 7단계에서 ETF 계산이 추가되면 최종 publisher가 6개 `etfs`까지 같은 transaction에 포함한다. 각 단계에서 공개 중인 자료 전체가 같은 회차로만 바뀌어 시장·상세·거래가 혼합 회차 가격을 보지 않게 한다.

스케줄러 중복 호출과 함수 재시도는 정상 상황으로 간주한다. lease와 결정적 run ID가 중복 가격 반영을 막는다.

### 4.4 랭킹

- 내부 `leaderboardEntries/{uid}`는 서버가 계산한 총자산, 동점 키, 갱신 시각을 가진다.
- 공개 함수는 상위 항목만 읽어 competition rank를 부여한다. 동일 총자산은 같은 순위이며, 안정된 출력 순서는 opaque `publicId`로 정한다.
- 랭킹 작업은 한 회차의 20개 가격을 한 번 읽은 뒤 활성 사용자와 holdings를 고정 page 크기로 순회하고, run ID·cursor로 재개한다. 수백 명 전체 재평가는 요청 경로 밖의 bounded batch 작업이며 일부 사용자만 끝난 상태를 공개하지 않는다.
- 공개 `publicLeaderboard/current`에는 최대 10개 `{nickname, estimatedTotalAsset, rank}`만 포함한다. 내부 `publicId`는 안정 정렬에만 사용한다.
- 내 순위는 인증 `getMyRank` callable이 token UID의 내부 entry를 읽고 식별자를 제거해 반환한다. 전체 사용자 스캔을 화면 요청 시 수행하지 않는다.
- 폐장 시 최종 스냅샷은 불변 보관하고 이후 일반 갱신에서 제외한다.

### 4.5 별점과 관리자 이벤트

- 기존 별점 API 규격이 확정되기 전에는 `averageRating=3.0`, `ratingCount=0`, `ratingRecentDelta=0`, `lastRatingAt=null`인 중립 집계만 사용한다. UI는 `ratingCount=0`을 “평가 없음”으로 표시한다.
- 향후 별점 쓰기는 공급자 계약에 맞춘 서버 함수만 허용하고 브라우저의 집계 직접 쓰기는 금지한다.
- 관리자 이벤트·뉴스·시장 상태 변경은 역할별 관리자 함수만 수행한다. 함수는 custom claim과 `adminAuthorizations/{uid}`의 활성 role/version을 모두 확인하며 고위험 작업은 `adminApprovals`의 서로 다른 2인 승인을 소비한다. 행위자 UID는 공개 문서가 아니라 append-only 감사 로그에만 남긴다.
- 시장 초기화는 일반 CRUD가 아니라 사전 백업, 재인증, 명시적 확인 문자열, 단일 실행 잠금과 결과 감사가 필요한 별도 운영 절차다.

## 5. 실시간 읽기와 비용 경계

| 화면 | 허용 리스너 | 상한/해제 조건 |
|---|---|---|
| 공통 셸 | `market/state`, 필요 시 공지 1건 | 로그인 세션당 각 1개, 로그아웃 시 해제 |
| 홈 | 제한된 TOP 상승·하락·인기 쿼리, 최신 뉴스, ETF 미리보기 | 각 `limit` 지정, 화면 이탈 시 모두 해제 |
| 시장 | 활성 동아리 20개 이하 쿼리 | 공식 종목 수를 상한으로 하고 페이지 비가시 시 해제 |
| 종목 상세 | 선택한 `clubs/{clubId}`, 최근 뉴스 제한 쿼리, 본인 holding | 다른 종목 선택 전 기존 리스너 해제 |
| ETF | ETF 6개 이하 | 화면 이탈 시 해제 |
| 내 자산 | 본인 사용자 1개와 본인 holdings 최대 20개 | 다른 사용자의 경로 금지 |
| 랭킹 | `publicLeaderboard/current` 1개와 본인 결과 1개 | 전체 엔트리 쿼리 금지 |

거래 이력은 실시간 구독하지 않고 최신순 cursor pagination으로 읽는다. 전역 `trades`, `users`, `auditLogs`, demand shards, price runs에는 클라이언트 목록 리스너를 허용하지 않는다. 검색은 공식 20개 종목을 이미 읽은 시장 화면에서 로컬 필터링하며 추가 검색 인덱스 서비스를 두지 않는다.

비용 예산은 운영 전 실제 축제 시간과 예상 로그인 수가 정해진 뒤 산정한다. 최소 산식은 “초기 쿼리 문서 수 + 변경 문서 수 × 활성 리스너 수 + 분당 배치 읽기/쓰기 × 개장 분”으로 기록하며, Emulator 부하 테스트와 별도의 비운영 Firebase 프로젝트로 검증한다.

## 6. 일관성·지연 계약

| 대상 | 일관성/지연 |
|---|---|
| 현금·보유량·평균 매수가·거래 결과 | 단일 거래 트랜잭션 안에서 원자적, 성공 응답 전에 커밋 완료 |
| idempotency 결과 | 자산 변경과 같은 트랜잭션에 저장 |
| 수요 샤드 | 거래와 같은 트랜잭션, 화면 표시 집계는 다음 가격 회차까지 지연 가능 |
| 종목 가격 | 목표 60초, 정상 허용 최대 120초 |
| ETF | 해당 종목 가격 회차 완료 뒤 공개, 목표 60초·최대 120초 |
| 총자산·랭킹 | 파생 투영, 목표 60초·최대 120초 |
| 뉴스·시장 정지 | 서버 커밋 직후 listener 전파, 연결 상태에 따라 UI 지연 가능 |

`market/state.status`는 `open|halted|closed`만 사용한다. 개장 전은 `closed`이면서 `openedAt=null`, cutoff 이후도 `closed`다. 폐장 진행은 별도 `closureRuns/{closureId}`의 `pending→running→ready→finalized` workflow로 관리하고, 최종 결과는 `finalMarketSnapshots/{closureId}`에 불변 보관한다.

가격 `priceCalculatedAt`이 120초를 넘으면 UI는 “갱신 지연”을 표시한다. 일반 `updatedAt`은 freshness에 사용하지 않는다. 거래 함수는 설정된 최대 가격 나이를 초과하면 신규 체결을 fail-closed로 거부하고 운영 경보를 발생시킨다. 로컬 캐시 값으로 체결하지 않는다.

## 7. 장애 복구와 운영 안전장치

### 감지

- 함수 오류율·지연, 거래 거부율, 트랜잭션 재시도 초과, 가격/랭킹 stale age, App Check 실패율, 샤드 편중, Firestore 사용량에 경보를 둔다.
- 매 회차마다 `sum(user cash + holdings valuation)` 같은 운영 지표와 거래 원장-사용자 투영 표본 정합성을 검사하되, 자동 수정을 하지 않는다.

### 격리

- 가격 작업이 두 회 연속 최대 지연을 넘거나 정합성 검사가 실패하면 자동 거래 정지를 권장한다.
- 종목 단위 이상은 해당 `tradingStatus=halted`, 광범위 이상은 `market/state.status=halted`로 격리한다.
- 오류 중인 가격·ETF·랭킹 투영은 마지막 정상 버전을 유지하고 stale 표시를 붙인다.

### 복구

1. 운영자는 감사 로그와 run ID로 마지막 정상 창을 식별한다.
2. 중복 안전한 가격/랭킹 작업을 같은 결정적 ID로 재실행한다.
3. 사용자 자산 불일치는 불변 거래 원장에서 별도 검증 작업으로 재구성해 차이를 보고한 뒤 승인된 복구 함수로만 교정한다.
4. 교정 전후 스냅샷, 행위자, 이유, 영향 문서 수를 감사 로그에 남긴다.
5. 복구 확인 뒤 시장을 명시적으로 재개한다. 누락 구간을 임의 가격으로 보간하지 않는다.

Firestore 관리형 백업/PITR 사용 가능 여부와 보존 정책은 실제 Firebase 요금제·프로젝트 지역을 확정한 뒤 운영 전 검증한다. 백업이 있어도 거래 원장, 감사 로그, idempotency 보존을 대체하지 않는다.

## 8. 환경과 배포 경계

- 개발, 테스트/스테이징, 운영 Firebase 프로젝트를 분리한다. Emulator 설정은 운영 자격 증명과 섞지 않는다.
- 브라우저용 Firebase 구성은 비밀키가 아니지만 프로젝트별 값으로 관리한다. Admin SDK 비밀, 외부 별점 자격 증명, 운영 관리자 설정은 Secret Manager/서버 환경에만 둔다.
- `ALLOWED_SCHOOL_DOMAIN`의 확인값은 `pangyo.hs.kr`이며 환경별 설정에 주입해야 한다. `FESTIVAL_TIMEZONE`, 개장·폐장 시각, 관리자 UID/이메일, Firebase Auth authorized domain, 별점 공급자 규격은 아직 미정이며 자리표시자를 운영 값으로 바꾸기 전 배포를 차단한다.
- 리전은 학교 사용자와 Firestore가 가까운 동일 리전 계열로 통일하고, 확정된 리전은 운영 중 임의 변경하지 않는다.
- 운영 배포와 Git push는 사용자 명시 지시 없이 수행하지 않는다.

가격·랭킹·폐장 coordinator는 `serviceLeases/{leaseId}`의 만료와 증가하는 fencing token을 사용한다. callable 남용 제한은 `rateLimits/{uid}/windows/{command_window}`에 사용자·명령별로 분산하고 서버 transaction만 갱신한다. 두 경로는 클라이언트 접근을 전면 거부한다.

## 9. 용량 확장 판단

10샤드는 수백 명 규모의 보수적 개발 기본값이다. 부하 테스트에서 특정 샤드의 충돌·지연이 임계치를 넘으면 개장 전에만 shard count를 올리고 설정 버전을 고정한다. 운영 중 샤드 수 변경은 기존 창과 새 창의 해석이 달라지므로 새 window 경계에서만 허용한다.

다음 현상은 구조 재검토 신호다.

- 거래 함수 p95 지연이 지속 증가하거나 트랜잭션 재시도가 집중됨
- 가격 회차가 120초 안에 완료되지 않음
- 공개 리스너 읽기 비용이 예산을 초과함
- 랭킹 계산이 전체 사용자 스캔에 의존하게 됨

이 경우 우선 리스너 축소, 샤드 조정, 파생 투영 주기 조정, 작업 큐 분리를 검토한다. 새로운 데이터베이스나 프레임워크 추가는 실제 측정 근거와 별도 결정 없이 하지 않는다.

## 10. 공식 참고 자료

- [Cloud Firestore 모범 사례](https://firebase.google.com/docs/firestore/best-practices)
- [Cloud Firestore 트랜잭션과 일괄 쓰기](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [분산 카운터](https://firebase.google.com/docs/firestore/solutions/counters)
- [실시간 리스너 분리](https://firebase.google.com/docs/firestore/query-data/listen#detach_a_listener)
- [Firebase App Check 웹](https://firebase.google.com/docs/app-check/web/recaptcha-provider)

## 11. 1단계 전 미확정 외부 정보

- Firebase Auth authorized domain과 관리자 계정
- 축제 날짜, 타임존 확인, 개장·폐장 시각
- Firebase 프로젝트 ID, 요금제, 리전, 예산·경보 한도
- 기존 별점 시스템 API, 인증, 갱신 주기, 장애 시 정책
- 로고, 이미지, 부스 위치·번호, 운영 시간, 당일 체험 내용

이 값들은 제공되기 전까지 자리표시자 또는 `null`을 유지하며 임의 생성하지 않는다.
