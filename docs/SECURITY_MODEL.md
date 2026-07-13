# 보안 모델

## 1. 보안 목표

1. 일반 사용자는 자신이나 타인의 현금, 보유량, 평균 매수가, 거래 기록, 가격, 거래량, 별점 집계, ETF, 랭킹을 조작할 수 없다.
2. 성공한 거래는 완전하게 한 번만 반영되고, 실패한 거래는 자산 일부를 남기지 않는다.
3. 학교 Google 계정만 앱 데이터에 접근하며 관리자 권한 위조를 차단한다.
4. 공개 화면에서 이메일, UID, 실명과 비공개 자산을 노출하지 않는다.
5. App Check, 입력 한도, 비용 경계로 자동화 남용과 비용 폭증을 완화한다.
6. 운영자 행위와 복구를 추적 가능한 감사 원장으로 남긴다.

보안 통제는 Firebase Authentication, callable 함수 검증, Firestore Security Rules, App Check, 서버 전용 데이터 분리, 모니터링을 겹쳐 적용한다. 어느 하나를 다른 통제의 대체물로 보지 않는다.

## 2. 위협 모델

| 위협 | 예시 | 핵심 통제 |
|---|---|---|
| 클라이언트 변조 | 가격·UID·현금·관리자 값을 요청에 추가 | 요청 필드 allowlist, 서버 재계산, 미허용 필드 거부 |
| 직접 Firestore 호출 | 자신의 cash 증가, 가짜 holding/trade 생성 | 자산·원장 전 경로 client write deny |
| 중복 요청/응답 유실 | 버튼 연타, 네트워크 재전송, 함수 재시도 | UID 범위 idempotency, 원자적 transaction, 저장 결과 재생 |
| 동시성 경합 | 잔액에 가까운 동시 매수, 전량 동시 매도 | transaction 재검증, 음수 불변 조건, 샤드 집계 |
| 계정·권한 오용 | 외부 도메인, 미검증 이메일, 위조 admin claim | 토큰 검증, 학교 도메인, email_verified, 서버 상태 검사 |
| 데이터 열람 | 다른 학생 자산/UID/실명 수집 | 소유자 단건 규칙, 내부 랭킹 비공개, bounded 공개 projection |
| 자동화·봇 | callable 폭주, 대량 리스너, 비용 공격 | App Check enforcement, 사용자별 rate limit, query 제한, 경보 |
| 운영자 실수/침해 | 시장 초기화, 이벤트 과대 영향, 로그 삭제 | 서버 명령 allowlist, 재인증, 영향 상한, append-only audit, 백업 |
| 파생 작업 중복/실패 | 가격 두 번 적용, 일부 ETF만 새 회차 | 결정적 run ID, lease, 상태 전이, last-good 유지 |
| 외부 별점 오염 | 잘못된 타입·오래된 응답·재전송 | 서버 어댑터, schema 검증, freshness 감쇠, 중립 fallback |

서비스 거부를 완전히 막는 것은 목표가 아니다. 수백 명 규모에서 피해 범위를 제한하고 거래를 안전하게 정지·복구하는 것이 목표다.

## 3. 인증과 학교 계정 검증

- Firebase Google Authentication만 사용한다.
- 로그인 UI의 도메인 검사는 편의 기능이다. 모든 callable 함수는 검증된 ID token의 `uid`, `email`, `email_verified`를 다시 확인한다.
- 이메일은 정확히 `local@ALLOWED_SCHOOL_DOMAIN` 형태인지 정규화 후 비교한다. 문자열 suffix만 비교하거나 학교 도메인을 여러 소스 파일에 복제하지 않는다.
- `ALLOWED_SCHOOL_DOMAIN`이 실제 값으로 설정되지 않은 환경은 운영 배포를 차단한다. Emulator에서만 명시적 테스트 도메인을 허용한다.
- 토큰이 유효해도 `users/{uid}.accountStatus`가 `active`가 아니면 데이터 명령을 거부한다.
- 사용자 초기화는 UID 문서 create-if-absent transaction으로 처리한다. 클라이언트가 초기 현금, 실명, 이메일, UID를 본문으로 지정할 수 없다.
- 초기화 함수가 환경의 `ALLOWED_SCHOOL_DOMAIN`과 토큰을 검증한 뒤 `schoolVerified=true` custom claim을 발급하고 ID token refresh를 요구한다. Firestore Rules는 런타임 환경값을 읽으려 하지 않고 이 claim을 검사한다. 모든 callable은 claim만 믿지 않고 현재 token의 verified email/domain을 다시 검사한다.
- 이메일은 권한 검증에 토큰에서 사용하되 `users` 문서에 복제하지 않는다. 도메인 변경·계정 회수 시 claim 회수와 refresh token 무효화를 운영 절차에 포함한다.
- 한 학생의 복수 학교 계정은 Google UID만으로 식별할 수 없다. 완전 차단에는 학생 명부 또는 별도 학생 ID 연계가 필요하다.

## 4. 관리자 권한

- 관리자 UI 노출 여부는 보안 통제가 아니다.
- 관리자 함수는 boolean `admin=true` 하나가 아니라 명령별 role custom claim과 `adminAuthorizations/{uid}`의 `active`, `roles`, `claimVersion`, 허용 학교 도메인, 검증 이메일, 활성 사용자 상태를 모두 확인한다. live authorization 문서가 불일치하면 오래된 token도 즉시 거부한다.
- claim 발급·회수는 운영 자격 증명을 가진 별도 관리 절차로만 수행하고 클라이언트 쓰기로 만들지 않는다. 실제 관리자 계정이 정해지기 전에는 운영 claim을 발급하지 않는다.
- 시장 정지·재개, 종목 정지, 뉴스·이벤트, 폐장·초기화는 개별 allowlist 명령으로 분리한다. 일반적인 “임의 문서 업데이트” 관리자 API를 만들지 않는다.
- 위험 명령은 최근 재인증, 명시적 대상·사유, idempotency key, 예상 현재 상태를 요구한다. 초기화·finalize·자산 repair는 `adminApprovals/{approvalId}`에서 요청자와 다른 승인자의 2인 승인을 원자적으로 소비해야 하며, 초기화는 추가 확인 문자열, 단일 실행 lease, 사전 백업 확인도 요구한다.
- 모든 관리자 성공·거부 시도를 bounded 감사 로그로 남긴다. Auth 토큰·비밀·전체 개인정보는 로그에 넣지 않는다.

## 5. App Check

- Hosting의 웹 앱은 Firebase App Check를 활성화하고 지원되는 웹 attestation 제공자를 사용한다.
- 개발은 Debug provider와 Emulator에만 한정한다. debug token은 저장소, 클라이언트 로그, 운영 빌드에 포함하지 않는다.
- 관찰 모드에서 정상 요청 지표를 확인한 뒤 Firestore와 callable Functions에 enforcement를 켠다. 축제 직전에 최초 활성화하지 않는다.
- 학생·관리자 callable 함수는 유효한 Auth와 App Check를 둘 다 요구한다. 예약 작업은 Firebase 사용자 Auth 대신 전용 런타임 서비스 계정·IAM과 scheduler/OIDC 출처를 사용하고, 외부 별점 webhook은 공급자 서명·timestamp·replay 방지·rate limit을 사용한다. 운영자용 비상 절차는 일반 사용자 endpoint의 App Check를 우회하지 않는다.
- App Check는 신원 확인, 학교 도메인 검증, rate limiting을 대체하지 않으며 진짜 브라우저를 자동화한 남용까지 완전히 막지 못한다.

## 6. callable 명령 보안 계약

### 공통 검증 순서

1. App Check 유효성
2. Auth 존재와 토큰 유효성
3. `email_verified=true`와 정확한 허용 도메인
4. 허용 필드 외 입력 거부, 타입·길이·정수 범위 검증
5. 사용자 계정 상태
6. 명령별 rate limit과 idempotency 확인
7. 시장/종목/권한 상태를 서버 원장에서 읽기
8. transaction 안에서 권위 값 재확인·계산·커밋
9. 안전한 오류 코드와 correlation ID만 반환

### 매수·매도 입력

허용 필드는 `clubId`, `quantity`, `idempotencyKey`뿐이다. 함수 종류가 side를 결정한다. `quantity`는 설정된 주문 상한 이하의 양의 정수이고 `clubId`는 공식 20개 중 하나여야 한다. 키는 길이·문자·엔트로피 기준을 만족해야 한다.

가격, 총액, 수수료, UID, 보유량, 현금, 관리자 여부, 체결 시각을 보내면 무시하지 않고 요청 자체를 거부한다. 조용히 무시하면 변조를 발견하기 어렵다.

### idempotency와 원자성

- 서버는 UID와 키로 결정적 `requestId`를 만들고 side·clubId·quantity의 정규화 fingerprint를 저장한다.
- 기존 요청이 같은 fingerprint로 성공했다면 저장 결과를 반환한다. 다른 fingerprint면 `duplicate-request`다.
- request 성공 결과, 사용자 현금, holding, 개인 이력, 전역 거래, demand shard는 하나의 transaction에 있다.
- business rejection을 저장한다면 자산 변경 없이 terminal `rejected`로만 저장한다. 일시적 내부 오류는 성공으로 기록하지 않아 재시도할 수 있게 한다.
- idempotency 문서는 운영 중 삭제하지 않는다. 보존 기간 만료 뒤에도 거래 원장보다 먼저 감사 가능성을 잃지 않게 한다.

### 오류 정보

외부 응답은 `unauthenticated`, `permission-denied`, `account-disabled`, `market-closed`, `trading-halted`, `club-not-found`, `invalid-quantity`, `insufficient-funds`, `insufficient-holdings`, `duplicate-request`, `price-stale`, `resource-exhausted`, `internal` 같은 안정 코드만 사용한다. 문서 경로, stack trace, 이메일, 잔액 상세, 관리자 목록은 노출하지 않는다.

## 7. Firestore Rules 접근 행렬

Rules의 학교 사용자 조건은 Auth 존재, `request.auth.token.schoolVerified == true`, 필요 시 `users/{uid}.accountStatus == active`를 결합한다. 실제 도메인은 초기화/callable 서버 환경 한 곳에서 검사하며 Rules에 하드코딩하지 않는다. 운영 도메인 누락 시 초기화가 fail-closed하므로 claim이 발급되지 않는다.

| 경로 | 비인증 | 일반 학교 사용자 | 관리자 클라이언트 | 서버 Admin SDK |
|---|---|---|---|---|
| `users/{uid}` | deny | 본인 허용 필드 읽기만 | 직접 쓰기 deny | 명령별 읽기/쓰기 |
| `users/{uid}/holdings/*` | deny | 본인 읽기만 | 직접 쓰기 deny | 거래 함수 |
| `users/{uid}/tradeHistory/*` | deny | 본인 제한 쿼리 읽기만 | 직접 쓰기 deny | 거래 함수 create-only |
| `publicProfiles/*` | deny | 직접 목록 deny | 직접 쓰기 deny | 투영 작업 |
| `clubs`, `etfs`, `ratings` | deny | 읽기 | 직접 쓰기 deny | seed/가격/별점 작업 |
| `news`, `adminEvents` | deny | 공개·유효 문서 제한 읽기 | 직접 쓰기 deny | 관리자 함수 |
| `trades`, `tradeRequests` | deny | deny | deny | 거래 함수 |
| `auditLogs` | deny | deny | deny | 서버 create-only |
| `leaderboardEntries/{uid}` | deny | 직접 읽기 deny; `getMyRank` callable | 직접 쓰기 deny | 랭킹 작업 |
| `publicLeaderboard/current` | deny | 단건 읽기 | 직접 쓰기 deny | 랭킹 작업 |
| `market/config`, `market/state` | deny | 읽기 | 직접 쓰기 deny | seed/관리자/스케줄 작업 |
| demand windows/shards, `priceRuns` | deny | deny | deny | 거래·가격 작업 |
| `rateLimits`, `serviceLeases`, `priceVersions` | deny | deny | deny | 명령·예약 작업 |
| `adminAuthorizations`, `adminApprovals` | deny | deny | deny | 권한 관리/관리자 함수 |
| `closureRuns`, `finalMarketSnapshots` | deny | callable 또는 승인된 최종 projection만 | 직접 쓰기 deny | 폐장 작업 |

관리자 claim이 있어도 브라우저의 Firestore 직접 쓰기는 허용하지 않는다. Admin SDK는 Rules를 우회하므로 이 행렬의 서버 권한은 함수 코드의 allowlist와 IAM으로 강제한다.

## 8. Rules 필드·쿼리 제약

- 읽기 허용과 별개로 create/update/delete는 기본 deny다.
- 클라이언트 쓰기가 필요한 최소 프로필 입력이 생기더라도 별도 callable을 우선하고, 직접 쓰기를 허용할 경우 변경 가능 필드·키 집합·문자 길이·타입·서버 시각을 엄격히 제한한다.
- 사용자 문서에서 cash, estimatedTotalAsset, accountStatus, UID, 생성 시각은 클라이언트 변경 불가다.
- `limit` 없는 뉴스/거래 이력/시장 정렬 쿼리는 UI에서 만들지 않는다. Rules 테스트로 실제 쿼리 형태가 허용 범위와 일치하는지 검증한다.
- UID 경로를 사용하는 내부 랭킹과 공개 프로필은 collection list를 거부한다. 공개 랭킹은 한 bounded 문서만 읽는다.
- 허용되지 않은 추가 필드, 잘못된 타입, NaN/Infinity, 음수, 소수 가격·수량을 거부한다.

## 9. 개인정보와 공개 데이터

- 비공개: UID, 이메일, `displayName`(실명), 현금, holdings, 거래 이력, 계정 상태, 관리자 UID.
- 공개 가능: 검증된 nickname, 서버 산출 총자산, rank, 갱신 시각. 내부 무작위 `publicId`도 공개 payload에는 넣지 않는다.
- 공개 TOP 10에는 최대 10명만 포함하며 UID, 이메일, 실명, 관리자 UID와 내부 tie key를 싣지 않는다. 학생이 읽는 뉴스·이벤트·시장 상태의 actor 정보는 감사 로그로 분리한다.
- 닉네임은 길이, 허용 문자, 공백 정규화, 금지어·사칭 위험을 서버에서 검사한다. 닉네임이 고유하다고 가정하지 않는다.
- 클라이언트·서버 로그에는 ID token, App Check token, 전체 이메일, 요청 원문 비밀을 남기지 않는다.
- 개인정보 보존·삭제 정책과 이의 제기 기간은 학교 운영 주체가 축제 전에 확정해야 한다.

## 10. 남용·비용 통제

- 사용자별·명령별 fixed window rate limit을 `rateLimits/{uid}/windows/{command_window}`에 두고 서버 transaction만 갱신한다. 정확한 수치는 부하 테스트 후 서버 설정으로 확정하며 TTL은 집행 창보다 길게 둔다.
- 거래 수량, 요청 본문 크기, 닉네임 길이, 뉴스 길이, 이벤트 대상 수에 hard limit을 둔다.
- 거래는 10개 demand shard 중 결정적 한 곳만 쓰며 전역 hot counter를 매번 갱신하지 않는다.
- 리스트 쿼리는 cursor와 `limit`을 사용한다. 전체 사용자/거래/audit 구독은 Rules와 앱 구조 양쪽에서 금지한다.
- App Check 실패, 사용자별 과도 호출, transaction retry, Firestore read/write 급증, 함수 오류율에 예산 경보를 둔다.
- rate limit 저장소 자체가 단일 hot document가 되지 않도록 사용자·시간 창으로 분산하며, 장애 시 자산 명령은 fail-closed 한다.

## 11. 비밀·IAM·환경 분리

- Admin 서비스 계정 키를 저장소에 두지 않는다. 배포 런타임의 최소 권한 서비스 계정과 Secret Manager를 사용한다.
- 별점 공급자 자격 증명, 관리자 bootstrap 정보, 외부 webhook secret은 서버 비밀이다. Firebase Web 설정은 공개 구성으로 취급하되 허용 도메인과 App Check로 오용을 제한한다.
- 개발·스테이징·운영 프로젝트를 분리하고 운영 데이터로 Emulator 테스트하지 않는다.
- 운영 IAM은 배포자, 운영자, 감사 읽기 역할을 가능한 범위에서 분리한다. 광범위 Owner 권한을 일상 운영에 사용하지 않는다.
- Git push와 운영 배포는 사용자 명시 지시 없이 하지 않는다.

## 12. 감사와 장애 대응

- 감사 대상: 관리자 로그인/권한 변경, 시장·종목 상태 전이, 뉴스·이벤트 생성/변경, seed/마이그레이션, 가격 설정 변경, 재처리, 자산 교정, 초기화.
- 감사 로그는 서버 create-only이고 애플리케이션 경로로 수정·삭제하지 않는다. 로그 쓰기 실패 시 위험 관리자 명령도 실패시킨다.
- 의심 거래는 `requestId`, `tradeId`, `priceWindowId`, `configVersion`으로 연결한다.
- 침해 의심 시 순서: 시장 정지 → 관리자 claim 회수/토큰 무효화 → 영향 run·거래 식별 → 백업·원장 보존 → 검증된 복구 → 감사 기록 → 명시적 재개.
- 가격 또는 자산 정합성 경보가 발생하면 자동 교정하지 않는다. 마지막 정상 스냅샷과 불변 거래 원장으로 차이를 산출하고 승인된 서버 복구 명령만 사용한다.

## 13. 필수 보안 테스트

- 비인증 및 외부 도메인 계정의 모든 앱 데이터 접근 거부
- `email_verified=false`, 만료 토큰, disabled/suspended 계정 거부
- 다른 UID의 사용자·holding·이력·내 순위 읽기 거부
- 현금·보유량·평균 매수가·거래·가격·거래량·별점·ETF·랭킹 직접 쓰기 거부
- 가짜 관리자 claim 필드, 관리자 UI 호출, Firestore 직접 admin 문서 쓰기 거부
- 허용되지 않은 필드, 잘못된 타입, 음수·소수·과대 수량 거부
- 같은 idempotency key의 순차·동시 재호출과 다른 payload 충돌
- 잔액 한계 동시 매수, 보유량 한계 동시 매도, 시장 정지와 거래 commit 경합
- App Check 없음/잘못됨/Debug token 운영 사용 거부
- 감사 로그 update/delete와 공개 랭킹 UID 포함 거부
- `limit` 없는 목록과 다른 사용자 collection query 거부
- 가격 stale 상태에서 신규 거래 거부

Rules 테스트는 Emulator에서 allow와 deny를 모두 증명한다. 테스트를 삭제하거나 기대값을 약화해 통과시키지 않는다.

## 14. 알려진 한계와 운영 전 확인

- 학생 명부가 없으면 한 학생의 복수 학교 계정을 완전히 차단할 수 없다.
- App Check는 정상 앱 환경을 자동화하는 공격자를 완전히 막지 못한다.
- Admin SDK 경로는 Rules 보호를 받지 않으므로 함수 버그·IAM 과권한이 가장 큰 잔여 위험이다.
- 실제 학교 도메인, 관리자 계정, 축제 일정, Firebase 리전·요금제, 개인정보 보존 기간, 별점 API가 미정이다.
- rate limit 수치와 10샤드의 적정성은 수백 명 동시 부하 테스트로 확정해야 한다.

## 15. 공식 참고 자료

- [Firebase Security Rules 시작하기](https://firebase.google.com/docs/firestore/security/get-started)
- [Rules 쿼리 보안](https://firebase.google.com/docs/firestore/security/rules-query)
- [Firebase App Check](https://firebase.google.com/docs/app-check)
- [custom claims로 접근 제어](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Cloud Firestore 트랜잭션](https://firebase.google.com/docs/firestore/manage-data/transactions)
