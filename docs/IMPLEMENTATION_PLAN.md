# 구현 계획

## 적용 원칙

- 0→12 순서를 지킨다. 사용자가 요청한 한 단계만 구현하며 다음 단계 코드를 선행하지 않는다.
- 각 단계는 관련 문서·테스트·롤백 가능 상태를 함께 완료해야 통과한다. 운영 데이터 변경, Git push, 운영 배포는 별도 사용자 승인이 필요하다.
- 파일 경로는 계획상 경로다. 구현 중 변경할 때는 `ARCHITECTURE.md`, `DATA_CONTRACTS.md`, `DECISIONS.md`와 이 문서를 먼저 동기화한다.
- 공통 불변식은 서버 권위 쓰기, 정수 금액·가격·수량, UID 범위 격리, 멱등성, 22개 공식 종목·6개 ETF, bounded query/listener, 감사 가능성이다.

## 0단계 — 설계 문서

### 목표
요구사항을 구현 가능한 제품·아키텍처·데이터·보안·가격·운영 계약으로 고정하고 미결정 외부 입력을 드러낸다.

### 선행 조건
첨부된 전체 요구사항과 공식 동아리·ETF 목록을 정본으로 사용한다.

### 생성·수정 파일
`AGENTS.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/FIRESTORE_SCHEMA.md`, `docs/SECURITY_MODEL.md`, `docs/DATA_CONTRACTS.md`, `docs/CLUB_CATALOG.md`, `docs/ETF_STRUCTURE.md`, `docs/PRICE_ENGINE.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/TEST_PLAN.md`, `docs/DEPLOYMENT_PLAN.md`, `docs/FESTIVAL_OPERATIONS.md`, `docs/DECISIONS.md`.

### 구현 범위
기능·비기능 요구, 데이터 흐름, 컬렉션, Rules 경계, 가격·ETF·랭킹 정책, 0~12단계, 시험·배포·현장 운영·장애 복구·비용·폐장 계획을 문서화한다. 22개/6개/소속·별칭을 교차 검증한다.

### 구현하지 않을 범위
애플리케이션 코드, Firebase 리소스 생성, 패키지 설치, 시드 실행, Git commit/push, 배포.

### 데이터 흐름
요구사항 → 정본 카탈로그·ETF 검증 → 데이터 계약 → 아키텍처·보안·가격 계약 → 구현·시험·배포·운영 계획 → 미결정 항목 기록 순으로 추적한다.

### 보안 고려사항
비밀·실제 계정 값을 기록하지 않고 자리표시자를 쓴다. 클라이언트 비신뢰와 서버 권위 쓰기를 모든 문서에서 일관되게 유지한다.

### 테스트 방법
동아리 22개, 고유 ID 22개, ETF 6개, 구성 합계 22개, 각 동아리 정확히 1회, 모든 참조 유효, 세 별칭 비증권 여부를 검증한다. 요구·제외 기능·보안·동시성·비용·복구 항목의 추적표를 검토한다.

### 완료 조건
필수 14개 문서가 서로 모순 없이 존재하고, 외부 미정값이 `DECISIONS.md` 형식으로 기록되며 애플리케이션 변경이 없다.

### 롤백 방법
문서 변경만 되돌린다. 다음 단계가 시작됐다면 계약 변경 영향을 먼저 분석하고 코드를 임의로 과거 계약에 맞추지 않는다.

## 1단계 — 프로젝트 기반과 Firebase 연결

### 목표
Vite 기반 Vanilla 앱 셸, Firebase 모듈식 초기화, Functions JavaScript 기반, Hosting·Emulator·환경 분리를 만든다.

### 선행 조건
0단계 승인, 개발 Firebase 프로젝트 또는 Emulator 사용 방침, Node/Firebase CLI 버전 결정.

### 생성·수정 파일
`package.json`, lockfile, `vite.config.js`, `index.html`, `src/main.js`, `src/styles/`, `src/config/{env,firebase}.js`, `src/router/`, `src/views/`, `src/components/`, `functions/package.json`, `functions/src/index.js`, `firebase.json`, `.firebaserc.example`, `.env.example`, 기본 테스트·린트 설정.

### 구현 범위
로그인·홈·시장·ETF·내 자산·랭킹·관리자 자리 화면, 모바일 하단 내비게이션, 360px 앱 셸, 공통 loading/empty/error/retry 상태, Auth/Firestore/Functions 핸들 초기화, Emulator 연결, 개발·테스트·운영 환경 검증을 구현한다.

### 구현하지 않을 범위
로그인 동작, 데이터 조회, 거래, 가격, 공식 카탈로그 하드코딩, 관리자 기능, 다음 단계 비즈니스 로직.

### 데이터 흐름
브라우저 시작 → 환경 스키마 검증 → Firebase app/Auth/Firestore/Functions 초기화 → 현재 route의 자리 화면 렌더 → 화면 해제 시 자원 정리.

### 보안 고려사항
Web config와 서버 secret을 구분하고 실제 secret·서비스 계정 키를 저장소/번들에 넣지 않는다. 환경 누락은 fail-fast하며 production이 Emulator에 연결되거나 반대가 되지 않게 한다.

### 테스트 방법
`npm ci`, lint, unit, production build, Functions 정적 검사, Emulator 기동을 검증한다. 360px·대표 모바일 폭, 키보드 포커스, 44px 터치, console error 0, 환경 누락 오류, secret scan을 확인한다.

### 완료 조건
문서화된 명령이 새 clone에서 재현되고 일곱 자리 화면을 이동할 수 있으며 실제 기능은 연결되지 않았다.

### 롤백 방법
스캐폴드와 Firebase 설정을 이전 태그로 되돌린다. 생성된 원격 리소스가 없어야 하며 로컬 Emulator 데이터만 삭제한다.

## 2단계 — Google 로그인과 사용자 초기화

### 목표
학교 Google 계정 로그인·로그아웃·세션 복구와 UID당 1회 사용자 초기화·닉네임 등록을 안전하게 구현한다.

### 선행 조건
1단계 통과, `ALLOWED_SCHOOL_DOMAIN`의 Emulator 값, 사용자·공개 프로필 계약, 닉네임 기본 정책.

### 생성·수정 파일
`src/services/auth.js`, 로그인/닉네임/거부 화면, auth state 모듈, `functions/src/auth/initializeUser.js`, 공통 검증·오류 모듈, Auth/Functions Emulator 테스트와 관련 문서.

### 구현 범위
모바일 Google sign-in, `email_verified`, UX용 도메인 검사, 서버 토큰·도메인·계정 상태 재검사, 트랜잭션 기반 idempotent create, 최초 현금 1,000,000원, `schoolVerified` custom claim 발급·token refresh, 서버 시각, 재로그인 `lastLoginAt`, 안전한 닉네임 검증을 구현한다.

### 구현하지 않을 범위
학생 명부 없는 실제 학생 복수 계정 차단, 거래, 전체 Rules 완성, 관리자 UI.

### 데이터 흐름
Google Auth → ID token → `initializeUser({nickname})` → 서버 email/domain 검증 → UID 문서 트랜잭션 get-or-create → `schoolVerified` claim 발급 → token refresh → private user/public profile 최소 필드 → 클라이언트 세션.

### 보안 고려사항
클라이언트는 UID·현금·이메일을 전달하지 않는다. 인증 토큰만 신뢰 원천으로 삼고 비허용·미인증 이메일은 앱 데이터 접근 전에 거부한다. 이메일은 사용자 문서에 저장하지 않으며 Rules는 환경값 대신 서버 발급 claim을 검사한다.

### 테스트 방법
허용 최초/재로그인, claim 발급 전 접근 거부와 refresh 후 허용, 외부 도메인, 미인증 이메일, 연속·동시 초기화, 중간 실패 재시도, logout/token 만료, 잘못된 닉네임, 현금·문서 중복 없음 테스트를 Emulator에서 자동화한다.

### 완료 조건
동시 재호출 후에도 UID 문서 1개·초기 현금 1회이며 거부 계정은 데이터에 접근하지 못한다.

### 롤백 방법
새 로그인 진입을 feature flag로 막고 이전 Auth/Function 버전으로 되돌린다. 이미 생성된 사용자는 삭제하거나 현금을 재지급하지 않는다.

## 3단계 — Firestore 스키마, Security Rules, 공식 시드

### 목표
데이터 계약, deny-by-default Rules, 인덱스, 공정한 공식 22종목·6ETF·시장 설정 시드를 구현한다.

### 선행 조건
2단계 통과, 스키마·Rules·카탈로그·ETF·개발 기본값 승인.

### 생성·수정 파일
`firestore.rules`, `firestore.indexes.json`, `scripts/seed.js`, 정본 데이터 모듈, `tests/rules/`, `tests/seed/`, `firebase.json`, Functions 공유 validator와 관련 문서.

### 구현 범위
문서화된 users/holdings/history/profiles/clubs/etfs/trades/tradeRequests/ratings/news/adminEvents/auditLogs/leaderboard/market/price·demand 집계 구조와 필수 인덱스를 만든다. seed는 Emulator 기본, `--dry-run`, 대상 표시, 비파괴 재실행, production 확인, 제한된 `--force`를 제공한다.

### 구현하지 않을 범위
거래 Function, 가격 계산, 실제 별점, 임의 동아리·콘텐츠, 운영 데이터 자동 덮어쓰기.

### 데이터 흐름
정본 JSON/모듈 → schema validation·관계 검증 → 대상 프로젝트 확인 → create/skip 또는 명시적 허용 필드 update → 생성·건너뜀·갱신 보고. 클라이언트 읽기/쓰기 → Rules의 auth/domain/owner/role/type/field/query 제한.

### 보안 고려사항
현금·보유·원장·가격·거래량·별점·ETF·랭킹·시장·감사 로그의 클라이언트 권위 쓰기를 차단한다. 타인 private read, 추가 필드, 잘못된 타입·음수·소수, 감사 로그 수정·삭제를 차단한다.

### 테스트 방법
요구된 공격 Rules matrix 전체와 인덱스 query를 Emulator에서 검증한다. 22/6/고유성/정확히 1 ETF/alias 비중복/공통 초기값/재실행/비강제 덮어쓰기 차단을 자동 검증한다.

### 완료 조건
Rules·seed 테스트와 빌드가 통과하고 공식 데이터 외 항목이 없으며 일반 클라이언트가 권위 필드를 쓸 수 없다.

### 롤백 방법
Rules·인덱스는 직전 검증 버전으로 재배포한다. Emulator 시드는 재생성하고 운영 시드는 생성 manifest·백업을 기준으로 승인된 신규 문서만 제거한다. `--force`로 복구하지 않는다.

## 4단계 — 매수·매도 거래 엔진

### 목표
동시성·재시도에도 자산이 한 번만 원자적으로 바뀌는 서버 시장가 매수·매도를 구현한다.

### 선행 조건
3단계 Rules/seed 통과, U-008 거래 상대방·발행 수량 의미 확정, 시장 상태·오류·평균가 계약 승인.

### 생성·수정 파일
`functions/src/trades/{buy,sell,transaction,validation}.js`, 수요 샤드 모듈, 클라이언트 거래 service·상태 UI, 단위/통합/Emulator 동시성 테스트, 관련 계약 문서.

### 구현 범위
callable buy/sell, `{clubId,quantity,idempotencyKey}` 검증, 계정/시장/종목 상태·서버 가격·현금/보유 확인, 평균가, user/holding/history/global trade/request/demand shard 원자 갱신, 안전한 오류 코드, 버튼 중복 잠금·재시도 UX를 구현한다.

### 구현하지 않을 범위
클라이언트 가격·총액 신뢰, 지정가·호가·주문 매칭, 가격 변경, 공매도·파생상품·송금·사용자 간 양도.

### 데이터 흐름
클라이언트 UUID → callable → auth/domain/account/market/club 검증 → request·user·holding·club 읽기 → 서버 가격 계산 → 단일 transaction 쓰기 → 안정 오류/체결 응답 → 화면 최신 스냅샷. 수요 샤드는 요청 해시로 10개 중 하나를 선택한다.

### 보안 고려사항
토큰 UID만 사용하고 가격·현금·보유·admin·시각을 입력으로 받지 않는다. 시장 halt 이후 시작된 주문을 금지하며 같은 사용자 동시 거래는 user 문서 충돌 재시도로 직렬화한다.

### 테스트 방법
버튼 연타, 같은/다른 키 동시 요청, 잔액·보유 전량 경계, 다중 사용자 인기 종목, buy/sell 동시, 거래 중 halt, 잘못된 종목·상태·수량·인증·도메인, 함수 재시도·응답 유실을 시험한다. 잔액/수량 비음수와 원장 합계를 property test한다.

### 완료 조건
모든 성공 거래가 완전 반영되고 실패는 무반영이며 동일 키 재호출이 재체결되지 않는다. 목표 부하에서 무결성 오류 0이다.

### 롤백 방법
즉시 전체 시장 halt 후 거래 Function을 직전 버전으로 되돌린다. 부분 데이터를 직접 수정하지 않고 request/trade/audit 원장으로 진단한 승인 repair만 수행한다.

## 5단계 — 가격 변동 엔진

### 목표
별점·수요·관리자 이벤트를 제한적으로 반영하는 결정론적 서버 가격 tick을 구현한다.

### 선행 조건
4단계 통과, `PRICE_ENGINE.md`와 개발 계수 승인, rating 중립 집계, 예약 실행·멱등성 설계.

### 생성·수정 파일
`functions/src/price/{tick,formula,inputs,aggregate}.js`, scheduler 설정, 가격 history/집계 Rules·index, 시뮬레이션·golden/property·Emulator 테스트, 모니터링 쿼리.

### 구현 범위
60초 목표 tick, window별 10샤드 합산, milli-star Bayesian 수축, 수요 기반 `fundamentalPrice`, 별점·이벤트 절대 target premium, 현재가의 tick당 ±200bp 이동, 신호 half-up·bounded delta toward-zero, 최저 100원, 설정 버전·입력 해시·tick ID, 22개 club 후보와 `priceVersions` barrier, 22개 공개 가격의 단일 transaction publish, `priceCalculatedAt` 기준 120초 stale 감지를 구현한다.

### 구현하지 않을 범위
클라이언트 가격 쓰기, 전체 trade scan, 종목별 차등 계수, 복잡한 예측·랜덤성, 0 이하 가격, ETF 계산·publish(7단계), 랭킹(8단계).

### 데이터 흐름
멱등 scheduler tick → market state/config 읽기 → 닫힌 demand window 샤드·rating·활성 events 읽기 → 정수 fundamental/target 계산 → 22개 `priceRuns` 후보 → version barrier → 22개 clubs+market price pointer+version 원자 publish. 7·8단계가 사용할 회차 완료 신호만 남긴다.

### 보안 고려사항
Admin SDK 전용 쓰기, 설정 변경 관리자·감사 로그, tick lease/ID로 중복 실행 차단, 입력·설정 해시로 재현성을 보장한다.

### 테스트 방법
동일 입력 동일 결과, 입력 순서 무관, 각·총 상한, 최저가, 저표본 별점, stale rating, 상쇄 이벤트, zero volume, rounding 경계, 중복/지연 tick, hotspot·부분 실패, 모든 종목 동일 계수를 시험한다.

### 완료 조건
시뮬레이션에서 가격 불변식이 모두 지켜지고 60초 목표/120초 최대 지연과 비용 예산을 만족한다.

### 롤백 방법
시장을 halt하고 scheduler를 비활성화한 뒤 직전 설정/Function으로 되돌린다. 마지막 정상 tick 이후 잘못된 가격은 감사 가능한 복구 작업으로만 복원하고 거래가 있었다면 임의 되감지 않는다.

## 6단계 — 홈·시장·종목·내 자산 UI

### 목표
학생이 설명 없이 한 손으로 핵심 시장·거래·자산 기능을 사용할 수 있는 모바일 화면을 완성한다.

### 선행 조건
5단계 거래·가격 API 안정, 쿼리·리스너 계약과 인덱스 준비.

### 생성·수정 파일
`src/views/{home,market,club,portfolio}.js`, 관련 component/service/store/CSS, 접근성·UI·E2E 테스트.

### 구현 범위
TOP 상승/하락, 인기, 속보, 22종목 검색·정렬, 상세 정보·별점·뉴스·보유·buy/sell, 현금·평가액·총자산·평균가·수익률, loading/empty/error/retry/offline/stale 상태를 구현한다. 홈의 ETF preview 영역은 7단계 전까지 명시적 준비 상태만 제공한다.

### 구현하지 않을 범위
복잡한 차트·과도한 애니메이션, 무제한 거래 내역, 누락 부스 정보 추정, 실제 ETF 계산·목록·preview, ETF 거래, 관리자·랭킹·별점 연동 선행 구현.

### 데이터 흐름
route enter → 제한 query/listener 등록 → view model/정수 formatter → 화면 → 거래 callable → 성공 시 authoritative snapshot 반영 → route leave 시 unsubscribe/abort.

### 보안 고려사항
HTML 주입 방지, 입력 수량 정수 검증, private cache 최소화, 관리자 route 숨김을 권한 경계로 간주하지 않으며 오류에 내부정보를 노출하지 않는다.

### 테스트 방법
360px 이상 대표 폭, 44px touch, 키보드·screen reader·대비, 색 외 상승/하락 표지, 느린/오프라인/재시도, listener 해제, bounded query, 검색 별칭, 거래 중복 클릭, integer formatting을 시험한다.

### 완료 조건
지원 모바일 브라우저에서 모든 핵심 여정이 접근 가능하고 console 오류·listener 누수·PII 노출이 없다.

### 롤백 방법
Hosting을 이전 UI release로 되돌린다. 서버 계약은 하위 호환을 유지하며 긴급 시 거래를 halt하고 읽기 전용 화면을 제공한다.

## 7단계 — ETF

### 목표
6개 조회용 ETF의 동일 가중 가격·등락률·구성 정보를 제공한다.

### 선행 조건
6단계 시장 가격 UI, 22→6 정확한 구성 검증, ETF 기준가 계약.

### 생성·수정 파일
ETF 계산/자료화 Function 또는 서버 모듈, `src/views/etf.js`, ETF components/service, Rules·index·단위/E2E 테스트.

### 구현 범위
구성 가격의 동일 가중 산술평균, 원 단위 결정론 반올림, 기준 대비 등락률, 구성 종목 표시를 구현한다. 가격 publisher를 확장해 22개 price run이 준비된 뒤 ETF 후보 6개를 만들고 clubs·ETF·price pointer를 같은 publish transaction에 넣는다. 홈 preview와 ETF 화면을 연결하고 스포츠 ETF 단일종목 경고를 표시한다.

### 구현하지 않을 범위
ETF 매수·매도, 배당·리밸런싱·가중치 사용자 변경, 분산효과 과장.

### 데이터 흐름
22개 price run 준비 → 공식 구성 검증·ETF 후보 6개 계산 → 22 clubs+6 ETFs+price pointer+version 원자 publish → 홈 preview/ETF 화면 bounded listener.

### 보안 고려사항
클라이언트 ETF 쓰기를 금지하고 구성은 공식 정본만 허용한다. 잘못된/누락 component면 이전 정상값 유지와 장애 표시를 한다.

### 테스트 방법
6개, 모든 22개 정확히 1회, invalid/duplicate ID, 동일 가중·반올림·등락률, 스포츠 ETF, 중복 실행·부분 실패를 시험한다. publish 전후 club `lastPriceWindowId`와 ETF `valuationVersion`이 섞이지 않고 UI stale/error가 정확한지 검증한다.

### 완료 조건
ETF 수·구성과 계산이 정본과 일치하고 거래 UI/Function이 존재하지 않는다.

### 롤백 방법
ETF 갱신을 중지하고 이전 정상 snapshot을 stale 표시로 제공한다. club 거래·가격에는 영향을 주지 않는다.

## 8단계 — 실시간 랭킹

### 목표
개인정보를 노출하지 않는 TOP 10, 내 competition rank, 내 총자산을 bounded 자료화 데이터로 제공한다.

### 선행 조건
7단계 가격·ETF 안정, 총자산 평가 계약, competition rank와 공개 payload 결정.

### 생성·수정 파일
`functions/src/leaderboard/`, private entries·public snapshot Rules/index, `src/views/ranking.js`, ranking service/components, privacy·tie·부하 테스트.

### 구현 범위
60초 목표/120초 최대 갱신, 전체 최종 자산 평가의 서버 작업, 최대 10명 public snapshot, 동일 자산 동일 순위, 경계 동점의 내부 opaque publicId 안정화, 본인 전용 내 순위·자산·갱신시각을 구현한다.

### 구현하지 않을 범위
화면 요청별 전체 사용자/holding scan, 이메일·UID·실명 공개, TOP 10 초과 무제한 실시간 목록.

### 데이터 흐름
가격/거래 변화 → bounded 서버 ranking job → private entry와 sanitized TOP10 snapshot 원자 publish → public listener; 본인 요청 → auth UID → own entry만 반환.

### 보안 고려사항
UID keyed 내부 문서는 클라이언트 list/read 금지, public snapshot에는 허용 필드만 저장, 자신의 점수 직접 쓰기 금지, nickname XSS를 방지한다.

### 테스트 방법
tie competition rank, 10명 경계 동점, stable ordering, 내 순위, 탈퇴/disabled 계정, 가격변화 평가, 동시 job, 120초 stale, 공개 payload의 UID/email/실명/publicId 부재, query 비용을 시험한다.

### 완료 조건
목표 부하에서 최대 지연 내 결과가 나오고 public payload에는 직접·내부 식별자가 없으며 화면 요청 비용이 사용자 수에 비례하지 않는다.

### 롤백 방법
ranking job을 중지하고 마지막 snapshot을 stale 표시한다. 거래를 계속할지는 지연 원인과 시상 중요도에 따라 운영자가 결정하며 최종 순위는 재계산 전 확정하지 않는다.

## 9단계 — 관리자·속보·호재·악재

### 목표
권한 분리·감사 로그가 있는 뉴스, 이벤트, 공지, 시장/종목 halt·resume, 안전한 사전 초기화 기능을 제공한다.

### 선행 조건
8단계 통과, 실제 관리자·역할·승인 절차, 이벤트 정책과 상한 승인.

### 생성·수정 파일
관리자 callable Functions, `src/views/admin.js`, admin services/components, claim provisioning 도구, news/events/market/audit Rules·index와 보안/E2E 테스트.

### 구현 범위
호재·악재 시작/종료/종목/bp, 속보·전체 공지, 전시장·종목 halt/resume, 거래 전 market initialize, 폐장 설정 준비, actor/before/after/reason/correlation 감사 로그와 확인 UI를 구현한다.

### 구현하지 않을 범위
클라이언트 직접 Admin SDK, 무감사 수정·삭제, 첫 실거래 후 초기화, 이벤트 상한 우회, 임의 현금·가격 편집.

### 데이터 흐름
admin UI → callable → token claim·계정·역할·App Check·입력 검증 → target+append-only audit 원자 write → public sanitized listener → 가격 엔진은 시간상 활성 event만 읽기.

### 보안 고려사항
서버 재인가, 최소 권한, 고위험 2인 확인, audit 수정·삭제 금지, 관리자 PII 비공개, 재인증·claim 회수 절차를 적용한다.

### 테스트 방법
일반/위조/회수 claim, disabled admin, 잘못된 시간·종목·bp, 합산 ±60bp, 동시 halt와 거래, audit 누락/변조, 초기화 precondition, XSS·oversize news를 시험한다.

### 완료 조건
모든 관리자 변경이 권한 검사와 감사 기록을 통과하며 halt가 새 거래를 즉시 차단한다.

### 롤백 방법
관리자 쓰기 기능을 feature flag로 끄고 시장 halt 후 이전 Function/UI로 되돌린다. 감사 로그는 보존하고 잘못된 이벤트는 취소 이벤트로 상쇄한다.

## 10단계 — 별점 시스템 연동

### 목표
외부 별점을 인증·중복·최신성 검증을 거친 서버 집계로 연결하고, 확정된 U-019 방식으로 학생 평가 활동의 제출 또는 공식 이동 UX를 제공한다.

### 선행 조건
9단계 통과, U-006/U-007 API 계약·secret·ID mapping·평가 정책과 U-019 제출 경로 확정, 공급자 staging 사용 가능.

### 생성·수정 파일
`functions/src/ratings/{adapter,webhook,poll,reconcile}.js`, 확정 시 제출 callable과 평가 UI/공식 링크, secret/feature flag 설정, ratings 집계·dead-letter/monitoring, fixture/contract/integration/security 테스트와 운영 문서.

### 구현 범위
서명/인증, 공식 club ID mapping, 점수 범위·event ID 중복 제거, 평균·수·최근변화·source timestamp, freshness, 재시도·대조, 중립 fallback을 구현한다. 공급자 계약이 제출을 지원하면 학교 계정·학생당 중복 정책을 서버에서 강제하고, 그렇지 않으면 승인된 기존 시스템 이동 또는 조회 전용 안내를 구현한다.

### 구현하지 않을 범위
규격 추측, 임의 로컬 평가 저장소, 클라이언트 별점 집계 직접 쓰기, 원본 PII 불필요 저장, 공급자 장애 시 가짜 평가 생성.

### 데이터 흐름
학생 평가(지원 시) → 인증 callable → provider 계약 또는 공식 이동; provider webhook/poll → 서명·schema·idempotency → canonical event/aggregate → `ratings/{clubId}` 원자 갱신 → 가격 tick이 닫힌 snapshot 읽기. 실패는 quarantine·alert·재대조한다.

### 보안 고려사항
secret은 Secret Manager, replay 방지, 허용 source·rate limit·payload limit, 최소 PII, 원본 로그 redaction을 적용한다.

### 테스트 방법
contract fixture, 서명 실패, replay/out-of-order/duplicate, unknown club, 점수 경계, 학생당 중복·권한·rate limit(제출 지원 시), 공식 이동/조회 전용 fallback, provider timeout/429/5xx, stale 감쇠, reconciliation, price input 상한을 시험한다.

### 완료 조건
공급자 staging과 대조 결과가 일치하고 장애 시 중립/stale 동작으로 가격 불변식이 유지된다.

### 롤백 방법
`ratingIntegrationEnabled=false`로 즉시 중립화하고 ingest를 중지한다. 기존 집계는 삭제하지 않고 stale 표시·감사 후 adapter 이전 버전으로 복귀한다.

## 11단계 — 폐장 특수

### 목표
거래 cutoff부터 최종 가격·ETF·전체 랭킹 snapshot/finalized까지 재시도 가능한 폐장 상태 머신을 구현한다.

### 선행 조건
10단계 통과, 축제 시각·시간대, U-009 평가/보유 처리, U-018 시상 규칙 승인과 리허설.

### 생성·수정 파일
폐장 orchestration/admin Functions, final snapshot 스키마·Rules, 폐장/결과 UI, 감사·복구 도구, 상태 머신·E2E·failure injection 테스트.

### 구현 범위
market `status=closed` cutoff로 새 거래를 차단하고, 별도 closure workflow의 in-flight 확정·마지막 rating cutoff·price tick·ETF·전체 사용자 재평가·competition rank·immutable final snapshot·`finalized` 전환과 재실행 안전성을 구현한다.

### 구현하지 않을 범위
승인 없는 강제 청산, 클라이언트 시각 기준 폐장, 부분 결과 시상, 원장 삭제·시장 무단 초기화.

### 데이터 흐름
2인 승인 → market `status=closed` cutoff와 closure workflow `running` → trade drain 확인 → final input window seal → price/ETF → full asset/ranking → snapshot checksum → operator verify → workflow `finalized` publish.

### 보안 고려사항
고위험 역할·재인증·2인 확인, 단계별 lease/idempotency, snapshot 불변·checksum·audit, 미완료 상태에서 결과 공개 금지를 적용한다.

### 테스트 방법
cutoff 경계 동시 거래, 각 단계 crash/retry, duplicate close, rating/price 지연, partial batch, ranking tie, snapshot mutation 거부, 시간대, 복구·재개 불가 조건을 시험한다.

### 완료 조건
전체 재계산과 checksum 검증 후 한 번만 finalized되고 같은 입력 재실행 결과가 같으며 최종 결과가 변경 불가다.

### 롤백 방법
workflow finalized 전에는 market을 `closed` 또는 `halted`로 유지하고 실패 단계부터 멱등 재개한다. finalized 후에는 되감지 않고 별도 correction record와 학교 승인 절차를 사용한다.

## 12단계 — 부하 테스트·보안 검토·배포 준비

### 목표
수백 명 실사용 조건에서 무결성·성능·비용·보안·복구를 입증하고 승인 가능한 release candidate를 만든다.

### 선행 조건
0~11단계 통과, staging과 시험 계정, 예상 참여 규모·예산·SLO·운영자·일정 확정.

### 생성·수정 파일
load/chaos/E2E scripts, CI 설정, monitoring/alert 정책, release checklist, 검증 보고서와 필요한 문서 보정. 운영 secret·실데이터는 저장하지 않는다.

### 구현 범위
동시 500명 임시 기준과 1.5배 확정 부하, hotspot·listener·auth ramp, Rules/OWASP/App Check/IAM/secret 검토, 비용 산정, 백업·rollback·시장 halt·폐장 리허설, staging canary와 go/no-go 자료를 완성한다.

### 구현하지 않을 범위
사용자 승인 없는 운영 배포·Git push, 운영에서 부하 시험, 테스트 약화, 미결정 placeholder를 임의 운영값으로 대체.

### 데이터 흐름
고정 fixture → isolated staging load → 지표·operation count·오류/원장 수집 → invariant reconciliation → 병목·비용 조정 → 전체 회귀 → signed go/no-go artifact.

### 보안 고려사항
가짜 계정·비식별 데이터만 사용하고 least-privilege IAM, dependency/secret scan, Rules negative test, App Check 모니터→enforce, 로그 redaction, 관리자 claim 회수를 검증한다.

### 테스트 방법
`TEST_PLAN.md` 전체 gate를 실행한다. 임시 기준은 warm p95 거래 ≤2초, p99 ≤5초, 예상 밖 오류 <1%, 무결성 오류 0, 가격·랭킹 최대 지연 ≤120초이며 실제 승인값으로 대체한다.

### 완료 조건
차단 결함 0, 모든 필수 gate·복구 리허설 통과, 비용이 승인 예산 이내, 미정 운영값 0, 담당자 서명과 롤백 release가 준비됐다. 이는 운영 배포 승인을 의미하지 않는다.

### 롤백 방법
release candidate를 폐기하고 마지막 통과 버전으로 돌아간다. staging 데이터만 정리하며 운영 변경이 있었다면 `DEPLOYMENT_PLAN.md`의 컴포넌트별 rollback과 시장 halt를 적용한다.
