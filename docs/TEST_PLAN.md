# 테스트 계획

## 1. 목적과 통과 원칙

이 서비스의 최우선 합격 기준은 기능 수가 아니라 자산 무결성, 권한 격리, 장애 복구, 모바일 사용성, bounded read/write, 비용 예측 가능성이다. 실패한 필수 테스트를 삭제·skip·완화해서 통과시키지 않는다. 자동화 결과에는 명령, 환경, release ID, 시작/종료 시각, pass/fail, operation count를 남긴다.

다음은 모든 단계의 차단 불변식이다.

- 커밋된 거래 뒤 현금·보유 수량은 정수이며 음수가 아니다.
- 같은 idempotency key는 자산을 한 번만 바꾼다. 성공은 전부 반영되고 실패는 전혀 반영되지 않는다.
- 클라이언트는 현금, 보유, 원장, 가격, 거래량, 별점, ETF, 랭킹, 시장 상태, 감사 로그를 권위 있게 쓸 수 없다.
- 다른 사용자의 private 자산, 공개 랭킹의 이메일·UID·실명은 노출되지 않는다.
- 가격은 정수·100원 이상·tick당 ±200bp 이내이고 동일 입력은 동일 결과다.
- 공식 종목은 정확히 20개, ETF는 6개이며 모든 종목은 정확히 한 ETF에 한 번만 속한다.
- 가격과 랭킹 자료의 최대 age는 각각 120초다. 초과하면 성공처럼 보이지 않고 stale/장애 상태가 표시된다.
- 비활성 화면 listener가 남지 않고 전체 users/trades를 무제한 구독하지 않는다.

## 2. 테스트 환경과 데이터

| 환경 | 용도 | 데이터·제약 |
| --- | --- | --- |
| 단위 | 순수 계산·validator·view model | 고정 clock/seed, 네트워크 없음 |
| Firebase Emulator | Auth/Firestore/Functions/Rules/transaction/seed 통합 | 가짜 학교 도메인·가짜 UID만 사용, 매 실행 초기화 |
| 브라우저 자동화 | 모바일 흐름·listener lifecycle·접근성 | Emulator 연결, 360/390/430px와 desktop 보조 확인 |
| 격리 staging | 실제 Google redirect, App Check, index, scheduler, cold start, 부하·비용 측정 | 운영과 다른 프로젝트·시험 계정·비식별 데이터 |
| production smoke | 승인 배포 직후 최소 읽기·관리 제어 확인 | 부하/파괴 시험 금지, 실제 거래 전용 smoke 계정 |

운영 프로젝트는 자동 테스트 대상으로 사용하지 않는다. 실제 Google 계정 도메인과 App Check enforcement는 Emulator만으로 증명할 수 없으므로 staging smoke를 필수로 한다.

## 3. 단계별 품질 게이트

| 단계 | 필수 게이트 |
| --- | --- |
| 0 | 14개 문서, 요구 추적, 20/6 관계, 미결정값, 모순·범위 확대 없음 |
| 1 | clean install, lint/unit/build, Functions 검사, Emulator 기동, 360px·환경 fail-fast·secret scan |
| 2 | 허용/거부 로그인, email verified, 동시 initialize, 초기 현금 1회, logout/token 만료, nickname |
| 3 | 전체 Rules negative matrix, index query, seed 20/6·dry-run·idempotent·non-force 보호 |
| 4 | 거래 단위·통합·동시성·응답 유실·halt race, 원장 reconciliation |
| 5 | 가격 golden/property/simulation, 20-club 원자 publish, 중복 tick, hotspot, 60초/120초 age; ETF는 미구현 |
| 6 | 핵심 모바일 E2E, 접근성, loading/empty/error/retry/offline, listener 해제 |
| 7 | 6 ETF/20 구성, 동일 가중·반올림, club+ETF 동일 회차 publish, 스포츠 단일종목, ETF 거래 부재 |
| 8 | competition rank, TOP payload 10명, own rank, 개인정보 부재, 60초/120초 age |
| 9 | role/claim 위조, halt race, 이벤트 상한, 감사 로그, 초기화 보호 |
| 10 | 공급자 contract/signature/replay/reconcile/stale/fallback |
| 11 | cutoff race, 단계별 failure/retry, final full recompute, checksum, immutable finalized |
| 12 | load/security/cost/backup/rollback/현장 리허설 및 전체 회귀 |

## 4. 정본·스키마·시드 테스트

필수 assertion은 다음과 같다.

1. club 배열 길이와 고유 ID 수가 모두 20다.
2. ETF 배열 길이와 고유 ID 수가 모두 6이다.
3. 모든 club의 `etfId`가 실제 ETF를 가리킨다.
4. 모든 `componentClubIds`가 실제 club ID이고 flatten 결과가 20개·고유 20개다.
5. club의 `etfId`와 ETF 역방향 구성 관계가 완전히 일치한다.
6. `리켐`, `인벨릭스`, `네온`은 각각 `rechem`, `invelix`, `neon`의 alias이고 별도 ID가 아니다.
7. 모든 club의 초기/기준/전일 가격은 10,000원, 발행량 100,000주, 시총 10억원, 초기 거래량 0으로 같다.
8. 초기 `averageRating=3.0`, `averageRatingMilli=3000`, `ratingCount=0`, `ratingRecentDelta=0`, `ratingRecentDeltaMilli=0`, `lastRatingAt=null`이며 UI는 count 0을 '평가 없음'으로 표시한다. `fundamentalPrice`도 전 종목 10,000원으로 같다.
9. nullable 콘텐츠는 `null`, 임의 문자열이 아니다.
10. seed 두 번 실행 결과가 같고 `--force` 없이는 기존 허용 필드도 덮어쓰지 않으며 production은 명시 확인 없이는 중단된다.

Schema contract test는 허용 필드, 필수 필드, 타입, enum, 정수 범위, timestamp, 문서 크기, bounded map/array를 검사한다. 새 필드 추가는 Rules와 contract 버전이 함께 바뀌지 않으면 실패한다.

## 5. 인증·사용자 초기화 테스트

- 허용 학교 도메인·`email_verified=true`의 최초 로그인은 UID 문서 1개와 1,000,000원을 만든다.
- 초기화 전/claim refresh 전 Firestore 접근은 거부되고, 서버 검증 후 발급된 `schoolVerified=true` token으로만 허용된다. 외부 도메인이 claim을 위조한 Emulator 토큰과 회수·disabled 계정도 거부한다.
- 동일 계정 재로그인, 연속 10회 호출, barrier를 둔 동시 20회 호출 후에도 초기 현금과 생성 문서가 한 번뿐이다.
- transaction write 직전/직후 fault injection과 재시도에서 반쪽 public/private profile이 남지 않거나 안전하게 복구된다.
- 외부 도메인, 대소문자·subdomain 혼동, suffix 공격(`school.example.evil`), 미인증 이메일, 토큰 없는/만료/변조 호출을 거부한다.
- 입력 UID·현금·이메일·관리자 필드를 추가해도 무시가 아니라 명시 거부한다.
- 닉네임 길이·공백·제어문자·HTML·금지어·oversize를 서버가 검증한다.
- Rules는 거부 계정의 앱 데이터 읽기와 다른 UID private read를 차단한다.

## 6. Security Rules 공격 매트릭스

Emulator에서 최소 다음 allow/deny를 데이터가 존재할 때와 없을 때 모두 확인한다.

- unauthenticated 읽기/쓰기, 외부 도메인, disabled account
- 다른 사용자의 user/holding/history 읽기, 자신의 현금 증가·holding 증가·가짜 history/trade 생성
- club 가격·거래량, rating aggregate, ETF 가격, leaderboard score 직접 변경
- 일반 사용자의 news/event/market state 생성·수정, 관리자 claim 위조
- 허용되지 않은 필드, 잘못된 타입, 음수 현금/수량, 소수 가격/수량, 초과 문자열/배열
- query limit/order 조건 없는 collection read와 history 무페이지네이션
- audit log create 위조·update·delete, final snapshot 수정
- public TOP 10 응답 및 문서에 email/실명 displayName/UID/문서 경로/`publicId`/내부 tie-break key가 없는지 검사한다.
- 학생이 읽는 news/adminEvents/market state에 관리자 UID나 내부 승인 정보가 없는지 검사한다.

Admin SDK가 Rules를 우회한다는 사실 때문에 Rules 통과만으로 서버 Function 안전성을 주장하지 않는다. 같은 공격 입력을 Function validator 테스트에도 반복한다.

## 7. 거래 엔진 테스트

### 계산과 상태

- 매수 가중 평균의 정수 half-up 경계, 매도 시 평균가 유지, 전량 매도 처리 계약
- 잔액 정확히 0, 보유 정확히 0, 1주, 최대 허용 수량, overflow 안전 범위
- market `open|halted|closed`, club `open|halted|closed`·`isActive`, closure workflow `pending|running|ready|finalized` 조합
- 서버 club price와 응답 체결가 일치, 클라이언트 price/total/uid/cash/admin/time 필드 거부

### 동시성과 멱등성

- 같은 사용자의 동일 키 20개 동시 요청: 성공 효과 1회
- 응답 유실 뒤 같은 키 재요청: 기존 결과 또는 명시 duplicate, 자산 추가 변화 없음
- 다른 키로 잔액에 가까운 두 동시 매수와 전량에 가까운 두 동시 매도: 가능한 것만 성공, 음수 없음
- 여러 사용자 동일 종목 20/50 requests per second, 80% hotspot: transaction abort/retry와 10 demand shards 분포 측정
- buy/sell, market halt, club halt, Function retry를 barrier로 같은 시점에 발생시켜 cutoff 계약 검증
- 모든 시험 후 `initialCash + saleProceeds - purchaseCosts = cash`, holding/ledger/request/demand 간 reconciliation을 수행한다.

의도된 `insufficient-*`, `duplicate-request`, `market-closed`는 시스템 오류율에서 분리하되 계약 오류 코드·UI를 각각 확인한다.

4단계 자동화 기준은 순수 계산·요청 allowlist·Auth 도메인 단위 테스트, 클라이언트 요청 잠금 테스트, Firestore Emulator 원자성·동시성 통합 테스트로 나눈다. Emulator suite는 동일 키 20회, 응답 유실 재호출, 다른 키의 잔액/보유량 경계, 20명 동일 종목, 동시 매수·매도, 정지 transaction과 거래 잠금 순서, stale 가격·비활성 종목·미완성 window를 포함한다. 20/50 requests/s와 80% hotspot의 지속 부하·p95/p99 측정은 12단계 staging gate로 남긴다.

## 8. 가격 엔진 테스트

- golden vectors: 중립, rating-only, demand-only, admin-only, 같은 방향 최대, 상쇄, zero volume, 최저가 근처, rounding 정확히 절반.
- property: 동일 multiset 입력의 순서 변경 결과 동일, 재실행 동일, milli-star/ppm/bp 계산의 지정 반올림, 가격·fundamental 정수/100~1,000,000, rating target ±50/demand fundamental 이동 ±120/admin target ±60bp, 현재가 tick 이동 ±200bp. 이산 경계 fixture는 125원에서 200bp tick delta가 2원, 120bp demand delta가 1원이며 실제 변동률이 각 상한을 넘지 않음을 확인한다.
- 100원 최저가와 원 단위 반올림에서 음의 rating/admin target 시작·종료가 비대칭 이익을 만들지 않고, 상한 밖 target은 여러 tick에 걸쳐 결정적으로 수렴하며 숨은 음수 carry를 쌓지 않는지 검증한다.
- 별점 count 0은 저장상 3.0/표시상 '평가 없음'/엔진 prior 3.0·20건으로 중립이다. 1건 극단값과 20/100건 변화의 단조성·상한을 검사한다.
- 개발 기본 freshness는 lastRatingAt 이후 10분까지 정상, 10~30분 선형 감쇠, 30분에 최근 기여 0인지를 검증하되 운영 승인 변경 시 fixture를 함께 바꾼다.
- 동일 tick/window 중복 scheduler delivery, fencing lease 경쟁·만료, 닫히지 않은 window, 존재하는 샤드의 잘못된 값, candidate 계산 중단, 20-club 원자 publish 충돌을 fault injection한다. 생성되지 않은 샤드는 0으로 취급되는지 확인한다. publish 전·실패 중에는 모든 club `lastPriceWindowId`가 이전 회차이고, 재시도 뒤 전부 같은 새 회차인지 확인한다. 종목당 가격 이력은 항상 최근 60개 이하이며 클라이언트 쓰기를 거부해야 한다.
- 60초 목표와 120초 최대 age를 staging에서 측정하고 초과 시 stale alert/UI가 작동하는지 본다.
- 거래의 freshness 검사는 오직 `clubs.priceCalculatedAt`을 사용한다. description/rating/tradingStatus 변경으로 일반 `updatedAt`만 새로워져도 오래된 가격 거래가 계속 거부되는 회귀 테스트를 둔다.
- 종목 순서·인기·이름과 무관하게 같은 config가 적용되고 전체 trade scan이 발생하지 않는지 operation trace로 확인한다.

## 9. ETF·랭킹 테스트

ETF는 각 구성 가격의 동일 가중 평균과 정수 반올림을 독립 oracle로 비교한다. 구성 1개인 스포츠 ETF는 원종목 가격과 같고 '분산 효과 없음' 문구가 접근성 트리에 존재해야 한다. ETF buy/sell route, 버튼, Function이 없음을 정적 검사한다.

랭킹 fixture는 동점·10위 경계·disabled user·0 holding·가격 급변을 포함한다. 동일 총자산은 `1 + 더 높은 자산 사용자 수`의 같은 rank를 받고 payload는 최대 10명이다. 경계 동점 포함 대상은 내부 opaque `publicId`로 반복 실행 시 안정적이어야 하지만 이 값은 payload에 없어야 한다. 내 rank endpoint는 다른 UID를 요청할 수 없고 본인만 읽는다. 화면 100회 새로고침이 사용자 전체 scan을 유발하지 않는지 trace한다.

## 10. UI·접근성·실시간 비용 테스트

- 360×640, 390×844, 430×932, 가로 모드와 200% text zoom에서 overflow·가려진 거래 버튼이 없다.
- 모든 핵심 touch target은 약 44px 이상이고 키보드 focus 순서·visible focus·label·heading·live region이 적절하다.
- 상승/하락은 색뿐 아니라 부호·아이콘·문구로 구분하고 dark mode 대비를 자동/수동 검사한다.
- 모든 화면은 loading, empty, error, retry, offline, stale 상태 fixture를 갖고 double submit을 막는다.
- route 이동 100회 뒤 활성 listener 수가 baseline으로 돌아오며 hidden tab/로그아웃에서 private listener가 해제된다.
- 홈·시장·상세·ETF·자산·랭킹별 initial reads와 분당 reads를 계측한다. 20 clubs·TOP10·최근 news 등 명시 limit보다 넓은 query는 실패시킨다.
- XSS payload를 nickname/news/description/search에 넣고 text rendering과 CSP를 검증한다.

## 11. 관리자·별점·폐장 테스트

관리자는 일반 계정, 가짜 UI flag, 잘못된 role, 오래된 claimVersion, 회수·disabled authorization을 모두 거부하고, 서로 다른 두 사용자의 승인 없이는 초기화/finalize/repair가 실행되지 않는지 확인한다. 모든 성공/실패 고위험 작업에 actor·reason·before/after·correlation·server time이 남는지 본다. 이벤트별/합산 상한, 시작<종료, 공식 club만 허용, 동시 이벤트 결정론을 시험한다. 첫 실제 거래 뒤 market reset은 거부한다.

별점 adapter는 signed fixture, wrong secret, replay, out-of-order, duplicate, unknown club, range error, 429/timeout/5xx, 대조 불일치를 시험한다. U-019가 앱 내 제출이면 학교 인증·학생당 중복·멱등성·rate limit을, 외부 이동/조회 전용이면 잘못된 로컬 쓰기 경로가 없음을 확인한다. 공급자 장애 때 last-known/stale 또는 중립 규칙을 따르고 가격 상한을 넘지 않는다.

폐장은 거래 시작 barrier와 cutoff를 공유해 cutoff 이전 승인 거래만 반영되는지 확인한다. market `status=closed`와 closure workflow `running` 전환 뒤 각 단계에서 process kill 후 재호출하고 final price→ETF→전체 asset→competition rank→checksum→workflow finalized가 정확히 한 번 완결되는지 확인한다. finalized snapshot update/delete는 Rules와 Function 모두 차단한다.

## 12. 부하·복구·비용 시험

실제 예상치가 확정되기 전 임시 profile은 다음과 같다. 확정 후 예상 peak의 1.5배로 재실행한다.

| 시나리오 | 부하 |
| --- | --- |
| 로그인 ramp | 500 세션/5분, 실제 Google은 staging 허용 범위 내 축소 smoke |
| 조회·listener | 동시 500, 화면 비율 홈 30%/시장 25%/상세 25%/자산 10%/랭킹 10%, 30분 |
| 정상 거래 | 20 requests/s, 10분, buy/sell 혼합 |
| burst | 50 requests/s, 2분, 거래 80%가 동일 club |
| abusive retry | 동일 키 20회/사용자, 다중 사용자 동시 |
| 폐장 | peak 거래 중 cutoff와 final full recompute |

임시 성능 gate는 warm callable p95 ≤2초, p99 ≤5초, 예상 밖 오류 <1%, transaction contention retry <1%, 무결성 오류 0, 가격·랭킹 age ≤120초다. cold start는 별도 분포로 기록한다. 목표를 못 맞추면 먼저 query/index/function/shard를 개선하고 min instances나 샤드 증가는 비용 추정과 승인을 거친다.

복구 시험은 Functions 중단, scheduler 중복/지연, Firestore quota/error 주입, rating outage, App Check 오차단, 잘못된 Hosting release, 관리자 계정 회수를 포함한다. 시장 halt 목표 5분, read-only 안내 목표 15분, 안전한 거래 재개 목표 30분은 임시 운영 목표이며 현장 인력 승인 후 고정한다. 커밋된 거래 RPO는 0을 목표로 하되 pre-open export는 실시간 복구본이 아님을 명시한다.

비용은 가격표를 하드코딩하지 않고 시나리오별 Firestore read/write/delete, Function invocation/GB-s, egress, Scheduler, Hosting을 계측해 당시 공식 계산기로 산정한다. Emulator operation count와 staging billing export를 비교하고 승인 예산 50/80/100% 경보를 시험한다.

## 13. 보안 검토 체크리스트

- dependency·license·secret scan, source map/환경 번들 검사
- Firebase IAM 최소 권한, 사용하지 않는 서비스·키 제거, 관리자 claim 발급·회수 로그
- Auth redirect/authorized domain, exact domain match, session logout/revocation
- App Check staging monitor 후 Functions/Firestore enforcement와 emergency monitor 전환
- Rules query constraints, Admin SDK validator parity, rate/payload limits
- CSP, XSS, open redirect, error/log PII redaction, audit immutability
- 백업 버킷 접근·보존, test data 삭제, 운영 export 다운로드 금지

## 14. 최종 Go/No-Go

다음 중 하나라도 참이면 No-Go다: 자산/가격 불변식 위반, 차단 보안 결함, 공식 20/6 불일치, placeholder 운영값, 폐장·rollback 미리허설, 120초 stale 상한 위반, 예산 미승인, 담당자 부재, actual domain/App Check staging 실패. 모든 결과와 알려진 비차단 위험을 승인자가 확인한 경우에만 배포 후보가 된다.
