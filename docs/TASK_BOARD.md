# 7~12단계 작업 보드

각 항목은 1~2일 안에 끝내는 GitHub Issue 후보이다. 한 Issue는 한 작업 브랜치·한 Codex 대화·한 PR로 진행한다. `관련`은 선행 또는 통합 연관 작업이며, `병렬`은 선행 조건이 충족됐을 때의 판단이다. 공용 파일 변경은 `docs/WORK_OWNERSHIP.md`에 따라 팀장 승인이 필요하다.

## 7단계 — ETF (8개)

### ETF-01 — ETF 데이터 계약 검토

- **담당 역할 / 목표:** ETF / 현재 6개 구성, 동일 가중·rounding·stale·오류·회차 입력/출력 계약을 실제 schema와 대조한다.
- **선행 / 관련 / 병렬:** 0~6단계 완료 / ETF-02~08 / 첫 스프린트에서 독립 진행 가능.
- **수정 허용 범위:** ETF 전용 분석 문서. **수정 금지:** 코드, migration, 공식 구성, 가격 엔진.
- **완료 조건 / 테스트 명령:** 구현 Issue가 사용할 필드·불변식·미결정 목록과 실제 차이 검토 완료 / `npm run seed:validate`.
- **권장 Git:** `docs/etf-contract-audit` / `docs: audit ETF data contract` / `docs: define ETF calculation contract`.

### ETF-02 — ETF 계산 Database Function

- **담당 역할 / 목표:** ETF / 검증된 공식 구성으로 6개 동일 가중 정수 가격 후보를 계산하는 서버 함수를 새 migration으로 추가한다.
- **선행 / 관련 / 병렬:** ETF-01 / ETF-03, ETF-04 / ETF-05 UI 계약과 병렬 가능.
- **수정 허용 범위:** 새 ETF migration, ETF pgTAP. **수정 금지:** 기존 migration, 거래 RPC, client 계산, ETF 거래.
- **완료 조건 / 테스트 명령:** 6개 결과, half-up 규칙, invalid/missing/duplicate 구성 fail-closed / `npm run db:reset && npm run db:lint && npm run test:db`.
- **권장 Git:** `feature/etf-calculation` / `feat: add equal-weight ETF calculation` / `feat: calculate six equal-weight ETFs`.

### ETF-03 — 가격 회차와 ETF 회차 일치

- **담당 역할 / 목표:** ETF / 20 club 가격과 6 ETF 및 공개 price pointer가 한 publish version으로만 보이게 한다.
- **선행 / 관련 / 병렬:** ETF-02 / ETF-04, RANK-01 / 독립 불가.
- **수정 허용 범위:** 새 publish migration과 pgTAP, 승인된 가격 계약 문서. **수정 금지:** 기존 가격 migration, 임의 종목별 계수.
- **완료 조건 / 테스트 명령:** 중복·부분 실패·락 경쟁에도 mixed version 없음, 누락 component면 이전 정상값 유지 / `npm run db:reset && npm run test:db`.
- **권장 Git:** `feature/etf-price-version` / `feat: publish ETFs with price version` / `feat: keep club and ETF price versions consistent`.

### ETF-04 — ETF 계산 회귀 테스트

- **담당 역할 / 목표:** ETF / 구성·동일 가중·반올림·스포츠 단일종목·동시 실행 공격 테스트를 보강한다.
- **선행 / 관련 / 병렬:** ETF-02, ETF-03 / QA-03 / Repository 작업과 병렬 가능.
- **수정 허용 범위:** ETF unit/pgTAP fixtures와 테스트 문서. **수정 금지:** 테스트 통과를 위한 함수/RLS 약화.
- **완료 조건 / 테스트 명령:** 정상·경계·실패·중복 실행 경로가 자동화됨 / `npm run seed:validate && npm run test:db`.
- **권장 Git:** `test/etf-calculation` / `test: cover ETF calculation invariants` / `test: add ETF calculation regression coverage`.

### ETF-05 — ETF Repository

- **담당 역할 / 목표:** ETF / 최대 6개 조회, DTO mapping, loading/error/stale 모델과 구독 해제 인터페이스를 만든다.
- **선행 / 관련 / 병렬:** ETF-01 / ETF-06~08 / ETF-02와 병렬 가능.
- **수정 허용 범위:** 새 ETF service/repository와 unit test. **수정 금지:** 브라우저 ETF 쓰기, 전체 거래 조회, router.
- **완료 조건 / 테스트 명령:** limit 6, 잘못된 payload 오류, unsubscribe 가능, client 계산 없음 / `npm run lint && npm test`.
- **권장 Git:** `feature/etf-repository` / `feat: add bounded ETF repository` / `feat: add ETF read repository`.

### ETF-06 — ETF 목록 UI

- **담당 역할 / 목표:** ETF / 6개 가격·등락·stale·loading/error/empty와 스포츠 비분산 안내를 360px 화면에 표시한다.
- **선행 / 관련 / 병렬:** ETF-05 / ETF-07, ETF-08 / 상세 UI와 병렬 가능.
- **수정 허용 범위:** 새 ETF list view/component/CSS/test, 승인된 router 변경. **수정 금지:** ETF 거래, 가짜 공식 데이터.
- **완료 조건 / 테스트 명령:** 키보드·44px·긴 이름·큰 정수·색 외 등락 표지 확인 / `npm run lint && npm test && npm run build`.
- **권장 Git:** `feature/etf-list-ui` / `feat: add mobile ETF list` / `feat: show six ETFs on mobile`.

### ETF-07 — ETF 상세 UI

- **담당 역할 / 목표:** ETF / 공식 ETF 설명, 가격, 등락, 갱신시각, 동일 가중 구성 동아리를 조회 전용으로 표시한다.
- **선행 / 관련 / 병렬:** ETF-05 / ETF-06, ETF-08 / ETF-06과 병렬 가능.
- **수정 허용 범위:** 새 ETF detail view/component/CSS/test, 승인된 route. **수정 금지:** buy/sell 버튼, 구성 수정 UI.
- **완료 조건 / 테스트 명령:** 6개 route, invalid ID, 구성 누락/stale, 스포츠 안내와 접근성 확인 / `npm run lint && npm test && npm run build`.
- **권장 Git:** `feature/etf-detail-ui` / `feat: add ETF detail view` / `feat: show ETF components and status`.

### ETF-08 — ETF Realtime와 구독 정리

- **담당 역할 / 목표:** ETF / 현재 ETF 화면에서만 bounded Realtime을 열고 이탈·로그아웃 때 제거하며 홈 preview를 실제 데이터에 연결한다.
- **선행 / 관련 / 병렬:** ETF-03, ETF-05~07 / QA-05, QA-06 / UI 통합 후 진행.
- **수정 허용 범위:** ETF Repository/view lifecycle test와 승인된 홈 preview·router. **수정 금지:** 검색 입력별 채널, private table 구독.
- **완료 조건 / 테스트 명령:** 중복 channel 0, route leave `removeChannel`, 6개 상한, offline retry / `npm run lint && npm test && npm run build`.
- **권장 Git:** `feature/etf-realtime` / `feat: manage ETF realtime lifecycle` / `feat: connect bounded ETF realtime views`.

## 8단계 — 랭킹 (9개)

### RANK-01 — 총자산 평가 계약

- **담당 역할 / 목표:** 랭킹 / 현금+보유 평가액의 가격 version, 정수 overflow, disabled 계정, 갱신 SLO 계약을 분석한다.
- **선행 / 관련 / 병렬:** 0~6단계, ETF-01 / RANK-02~09, ETF-03 / 첫 스프린트에서 독립 진행 가능.
- **수정 허용 범위:** 랭킹 분석 문서. **수정 금지:** 코드/migration, 기존 계정·가격 계산 변경.
- **완료 조건 / 테스트 명령:** 공개·private 필드와 전체 평가 job 입력/출력·미결정 기록 / `npm test`.
- **권장 Git:** `docs/ranking-contract-audit` / `docs: audit ranking data contract` / `docs: define total asset ranking contract`.

### RANK-02 — private leaderboard entry

- **담당 역할 / 목표:** 랭킹 / UID 기반 평가 결과를 브라우저에서 숨기는 private entry와 서버 작성 경계를 새 migration으로 확정한다.
- **선행 / 관련 / 병렬:** RANK-01 / RANK-03~05, QA-03 / RANK-06 Repository와 계약 후 병렬 가능.
- **수정 허용 범위:** 새 랭킹 migration·pgTAP. **수정 금지:** 기존 migration, 공개 UID/email/실명, browser DML.
- **완료 조건 / 테스트 명령:** 직접 SELECT/DML 차단, 정수 자산, disabled 제외, server-only upsert / `npm run db:reset && npm run db:lint && npm run test:db`.
- **권장 Git:** `feature/private-leaderboard` / `feat: add private leaderboard entries` / `feat: add server-owned leaderboard entries`.

### RANK-03 — TOP 10 공개 스냅샷

- **담당 역할 / 목표:** 랭킹 / 최대 10명의 nickname·rank·asset·updatedAt만 담는 원자 public snapshot을 만든다.
- **선행 / 관련 / 병렬:** RANK-02 / RANK-04, RANK-08 / competition rank와 함께 진행 가능.
- **수정 허용 범위:** 새 랭킹 publish migration·pgTAP. **수정 금지:** UID/email/실명/public 내부 키, 10명 초과 목록.
- **완료 조건 / 테스트 명령:** payload allowlist, 최대 10, 화면 요청 시 전체 scan 없음, RLS read 경계 / `npm run db:reset && npm run test:db`.
- **권장 Git:** `feature/top-ten-snapshot` / `feat: publish sanitized top ten` / `feat: add private-safe top ten snapshot`.

### RANK-04 — competition rank

- **담당 역할 / 목표:** 랭킹 / 동일 자산 동일 rank와 다음 rank 건너뛰기, 경계 동점의 안정적 내부 정렬을 구현한다.
- **선행 / 관련 / 병렬:** RANK-02 / RANK-03, RANK-05 / TOP 10 publish와 병렬 가능.
- **수정 허용 범위:** 새/미병합 랭킹 function migration과 pgTAP. **수정 금지:** 공개 안정화 ID, 랜덤 순위, client rank 계산.
- **완료 조건 / 테스트 명령:** tie, 10위 경계, 재실행 안정성, overflow/0명 테스트 / `npm run test:db`.
- **권장 Git:** `feature/competition-rank` / `feat: calculate competition ranks` / `feat: add deterministic competition ranking`.

### RANK-05 — 내 순위 RPC

- **담당 역할 / 목표:** 랭킹 / `auth.uid()`의 rank·총자산·갱신시각만 반환하는 SECURITY DEFINER RPC를 추가한다.
- **선행 / 관련 / 병렬:** RANK-02, RANK-04 / RANK-06, RANK-08 / public snapshot 이후 병렬 가능.
- **수정 허용 범위:** 새 RPC migration·pgTAP·계약 문서. **수정 금지:** user_id 인자 신뢰, 다른 사용자 조회, 과도한 EXECUTE grant.
- **완료 조건 / 테스트 명령:** unauthenticated/외부/disabled/타인 거부, `search_path=''`, 최소 반환 / `npm run db:lint && npm run test:db`.
- **권장 Git:** `feature/my-rank-rpc` / `feat: add authenticated own-rank RPC` / `feat: expose only the current user's rank`.

### RANK-06 — 랭킹 Repository

- **담당 역할 / 목표:** 랭킹 / TOP 10 bounded 조회·구독과 내 순위 RPC를 UI 모델로 제공한다.
- **선행 / 관련 / 병렬:** RANK-01 계약 / RANK-03, RANK-05, RANK-07 / DB 구현과 mock 계약으로 병렬 가능.
- **수정 허용 범위:** 새 ranking service/repository와 unit tests. **수정 금지:** 전체 accounts/holdings 조회, client 점수 계산·쓰기.
- **완료 조건 / 테스트 명령:** limit/단일 snapshot, auth expiry, unsubscribe, safe error mapping / `npm run lint && npm test`.
- **권장 Git:** `feature/ranking-repository` / `feat: add bounded ranking repository` / `feat: connect ranking snapshot and own rank`.

### RANK-07 — 랭킹 UI

- **담당 역할 / 목표:** 랭킹 / TOP 10, 내 rank/asset, tie, loading/error/empty/stale를 개인정보 없이 모바일 표시한다.
- **선행 / 관련 / 병렬:** RANK-06 / RANK-08, RANK-09 / privacy test와 병렬 가능.
- **수정 허용 범위:** 새 ranking view/component/CSS/test와 승인된 router/nav. **수정 금지:** 이메일·실명·UID, 무제한 목록.
- **완료 조건 / 테스트 명령:** 360px, 긴 nickname/큰 숫자, 키보드, aria, 색 이외 상태 표시 / `npm run lint && npm test && npm run build`.
- **권장 Git:** `feature/ranking-ui` / `feat: add private-safe ranking UI` / `feat: show top ten and own rank`.

### RANK-08 — 개인정보 노출 테스트

- **담당 역할 / 목표:** 랭킹 / public snapshot, API, Realtime, UI에서 UID/email/실명/internal publicId 노출을 자동 검증한다.
- **선행 / 관련 / 병렬:** RANK-03, RANK-05 / QA-03 / RANK-07과 병렬 가능.
- **수정 허용 범위:** 랭킹 pgTAP/unit/privacy fixtures. **수정 금지:** 검사를 위한 권한 완화, 실제 개인정보 fixture.
- **완료 조건 / 테스트 명령:** 허용 필드 allowlist와 타인/private 접근 negative test 통과 / `npm test && npm run test:db`.
- **권장 Git:** `test/ranking-privacy` / `test: prevent ranking identity exposure` / `test: verify leaderboard privacy boundaries`.

### RANK-09 — 랭킹 stale 상태 처리

- **담당 역할 / 목표:** 랭킹 / 목표 60초·최대 120초 기준으로 last updated, stale, retry와 마지막 정상값 정책을 구현한다.
- **선행 / 관련 / 병렬:** RANK-03, RANK-06 / RANK-07 / 기본 UI 뒤 진행.
- **수정 허용 범위:** ranking model/view tests와 관련 문서. **수정 금지:** client 시각으로 권위 rank 갱신, stale 숨김.
- **완료 조건 / 테스트 명령:** 경계 시각, offline, job 중단/복구가 명확히 표시됨 / `npm run lint && npm test && npm run build`.
- **권장 Git:** `feature/ranking-stale-state` / `feat: show ranking freshness state` / `feat: handle stale ranking snapshots`.

## 9단계 — 관리자·시장 운영 (9개)

### ADMIN-01 — 관리자 역할 구조

- **담당 역할 / 목표:** 관리자·시장 운영 / 사용자 수정 불가 role 저장소, bootstrap·회수·2인 승인 경계를 설계한다.
- **선행 / 관련 / 병렬:** 0~6단계 / ADMIN-02~09, QA-03 / 첫 스프린트에서 독립 진행 가능.
- **수정 허용 범위:** 관리자 권한 설계 문서. **수정 금지:** 실제 claim/운영 계정, code/migration, service-role client 노출.
- **완료 조건 / 테스트 명령:** 위협 모델·역할 lifecycle·미결정 운영자 목록 작성 / `npm test`.
- **권장 Git:** `docs/admin-authorization-design` / `docs: define administrator authorization` / `docs: design market administrator roles`.

### ADMIN-02 — 관리자 권한 검사 함수

- **담당 역할 / 목표:** 관리자·시장 운영 / auth UID, Google/domain/account/role/재인증을 서버에서 확인하는 최소 helper를 새 migration으로 추가한다.
- **선행 / 관련 / 병렬:** ADMIN-01 / ADMIN-03~07 / 역할 계약 뒤 RPC들과 병렬 가능.
- **수정 허용 범위:** 새 admin migration·pgTAP. **수정 금지:** raw user metadata 신뢰, browser role DML, 기존 migration.
- **완료 조건 / 테스트 명령:** 일반·위조·회수·disabled 관리자 거부, `search_path=''`, 최소 grants / `npm run db:reset && npm run db:lint && npm run test:db`.
- **권장 Git:** `feature/admin-authorization` / `feat: add server-side admin authorization` / `feat: enforce administrator authorization`.

### ADMIN-03 — 시장 개장·정지·재개 RPC

- **담당 역할 / 목표:** 관리자·시장 운영 / reason·correlation·상태 전이 검증과 audit를 포함한 시장 제어 RPC를 만든다.
- **선행 / 관련 / 병렬:** ADMIN-02 / ADMIN-07, QA-04 / ADMIN-04와 병렬 가능.
- **수정 허용 범위:** 새 market-control migration·pgTAP·운영 계약. **수정 금지:** 무감사 변경, 클라이언트 직접 market_state DML, 자동 운영 개장.
- **완료 조건 / 테스트 명령:** invalid transition, 동시 거래/halt, 재시도와 actor audit 원자성 / `npm run db:lint && npm run test:db`.
- **권장 Git:** `feature/admin-market-control` / `feat: add audited market control RPCs` / `feat: secure market open halt and resume`.

### ADMIN-04 — 종목 정지·재개 RPC

- **담당 역할 / 목표:** 관리자·시장 운영 / 공식 club 하나의 trading status를 사유·감사와 함께 안전하게 바꾼다.
- **선행 / 관련 / 병렬:** ADMIN-02 / ADMIN-07, QA-03 / ADMIN-03과 병렬 가능.
- **수정 허용 범위:** 새 club-control migration·pgTAP. **수정 금지:** 가격/거래량 직접 수정, 비공식 club, client DML.
- **완료 조건 / 테스트 명령:** invalid ID/state, 동시 주문, 재개 권한, audit 원자성 / `npm run test:db`.
- **권장 Git:** `feature/admin-club-control` / `feat: add audited club trading controls` / `feat: secure club halt and resume`.

### ADMIN-05 — 뉴스 작성 RPC

- **담당 역할 / 목표:** 관리자·시장 운영 / scope·club·title/body·게시/만료·breaking을 검증하고 공개 기간만 노출한다.
- **선행 / 관련 / 병렬:** ADMIN-02 / ADMIN-07, ADMIN-08 / 이벤트 RPC와 병렬 가능.
- **수정 허용 범위:** 새 news RPC migration·pgTAP·admin service contract. **수정 금지:** 일반 사용자 write, HTML/script 저장, 무제한 payload.
- **완료 조건 / 테스트 명령:** XSS/oversize/invalid 시간·club 거부, 감사와 게시 RLS 일치 / `npm run db:lint && npm run test:db`.
- **권장 Git:** `feature/admin-news` / `feat: add audited news publishing RPC` / `feat: secure administrator news publishing`.

### ADMIN-06 — 호재·악재 이벤트 RPC

- **담당 역할 / 목표:** 관리자·시장 운영 / 종목·방향·bp·시작/종료·합산 상한을 검증하는 이벤트 명령을 추가한다.
- **선행 / 관련 / 병렬:** ADMIN-02, 가격 계약 확인 / ADMIN-07, QA-03 / ADMIN-05와 병렬 가능.
- **수정 허용 범위:** 새 event RPC migration·pgTAP·가격 입력 계약. **수정 금지:** 종목별 비공식 우대, 상한 우회, 가격 직접 write.
- **완료 조건 / 테스트 명령:** 만료·중첩·±상한·invalid input·동시 command와 audit 테스트 / `npm run test:db`.
- **권장 Git:** `feature/admin-market-events` / `feat: add bounded market event RPCs` / `feat: secure good and bad news events`.

### ADMIN-07 — 감사 로그 불변식

- **담당 역할 / 목표:** 관리자·시장 운영 / actor/action/target/before/after/reason/correlation을 append-only로 원자 기록한다.
- **선행 / 관련 / 병렬:** ADMIN-02 / ADMIN-03~06, ADMIN-09 / 각 RPC와 병렬 설계 가능.
- **수정 허용 범위:** 새 audit helper migration·pgTAP·운영 문서. **수정 금지:** browser read/write, update/delete, secret/PII 원문 저장.
- **완료 조건 / 테스트 명령:** 성공 command마다 정확히 한 log, 실패 전체 rollback, 변조·삭제 차단 / `npm run db:lint && npm run test:db`.
- **권장 Git:** `feature/admin-audit-log` / `feat: enforce append-only admin audit logs` / `feat: add atomic administrator auditing`.

### ADMIN-08 — 관리자 UI

- **담당 역할 / 목표:** 관리자·시장 운영 / 서버 인가 뒤 시장·종목·뉴스·이벤트 명령을 재확인과 안전 오류로 제공한다.
- **선행 / 관련 / 병렬:** ADMIN-03~07 / ADMIN-09, QA-05~06 / RPC 완료 뒤 진행.
- **수정 허용 범위:** admin service/view/component/CSS/test와 승인된 route. **수정 금지:** UI 숨김만으로 인가, service-role key, 권위 테이블 직접 write.
- **완료 조건 / 테스트 명령:** 일반 사용자 접근 거부, confirm/reason, pending lock, expiry, 360px·키보드 / `npm run lint && npm test && npm run build`.
- **권장 Git:** `feature/admin-ui` / `feat: add secure market operations UI` / `feat: connect audited administrator controls`.

### ADMIN-09 — 일반 사용자 공격 테스트

- **담당 역할 / 목표:** 관리자·시장 운영 / 일반·외부·disabled 사용자의 role 위조와 모든 관리자 RPC/DML 공격을 회귀 테스트한다.
- **선행 / 관련 / 병렬:** ADMIN-02~07 / QA-03 / ADMIN-08과 병렬 가능.
- **수정 허용 범위:** admin pgTAP/security fixtures. **수정 금지:** 권한·검증·테스트 기대값 약화.
- **완료 조건 / 테스트 명령:** 위조 metadata, direct DML/EXECUTE, audit 변조, oversize/invalid 요청 모두 거부 / `npm run test:db`.
- **권장 Git:** `test/admin-attacks` / `test: cover administrator authorization attacks` / `test: verify admin security boundaries`.

## 10~12단계 — 테스트·운영·통합 (12개)

### QA-01 — GitHub Actions 기본 CI

- **담당 역할 / 목표:** 테스트·CI·QA / Node 20에서 install, lint, unit, seed validation, build를 자동화한다.
- **선행 / 관련 / 병렬:** 협업 기반 PR / QA-02 / 독립 진행 가능.
- **수정 허용 범위:** `.github/workflows/ci.yml`, CI 문서. **수정 금지:** 제품 코드, 가짜 성공, hosted secret 요구.
- **완료 조건 / 테스트 명령:** PR/push에서 frontend job이 실제 package scripts로 실행됨 / `npm ci && npm run lint && npm test && npm run seed:validate && npm run build`.
- **권장 Git:** `chore/github-ci` / `ci: add frontend validation workflow` / `ci: run frontend checks on pull requests`.

### QA-02 — Supabase DB CI

- **담당 역할 / 목표:** 테스트·CI·QA / GitHub-hosted Docker에서 local stack, reset, lint, pgTAP, always-stop을 재현한다.
- **선행 / 관련 / 병렬:** QA-01 / QA-03~04 / frontend CI와 병렬 가능.
- **수정 허용 범위:** workflow database job·CI 문서. **수정 금지:** remote Supabase link, production secret, OAuth E2E.
- **완료 조건 / 테스트 명령:** dummy local OAuth env로 local DB job 통과, 실패해도 stack 정리 / `npm run supabase:start && npm run db:reset && npm run db:lint && npm run test:db && npm run supabase:stop`.
- **권장 Git:** `chore/supabase-db-ci` / `ci: add isolated Supabase database tests` / `ci: run local Supabase pgTAP checks`.

### QA-03 — RLS 회귀 테스트

- **담당 역할 / 목표:** 테스트·CI·QA / public/private schema, grants, ownership, authoritative DML과 SECURITY DEFINER 노출을 공격한다.
- **선행 / 관련 / 병렬:** 현재 DB, 각 새 migration / ETF-04, RANK-08, ADMIN-09 / 기능별 테스트와 병렬 가능.
- **수정 허용 범위:** `supabase/tests/`와 security report. **수정 금지:** RLS/grant 약화, 실제 계정·운영 DB.
- **완료 조건 / 테스트 명령:** anon/타인/외부/직접 write/private execution matrix 자동화 / `npm run db:reset && npm run test:db`.
- **권장 Git:** `test/rls-regression` / `test: expand RLS regression coverage` / `test: verify authoritative data boundaries`.

### QA-04 — 동시 매수·매도 테스트

- **담당 역할 / 목표:** 테스트·CI·QA / idempotency, 전액 경계, buy/sell, halt 경쟁에서 자산·원장 무결성을 검증한다.
- **선행 / 관련 / 병렬:** 현재 거래 RPC / ADMIN-03 / 독립 진행 가능.
- **수정 허용 범위:** DB concurrency tests·fixture·report. **수정 금지:** 거래 RPC 변경, timeout 완화로 실패 숨김.
- **완료 조건 / 테스트 명령:** 중복 효과 0, 음수 0, 성공/실패 원자성, 재현 가능한 동시 실행 / `npm run db:reset && npm run test:db`.
- **권장 Git:** `test/database-concurrency` / `test: expand concurrent trade coverage` / `test: verify concurrent buy and sell integrity`.

### QA-05 — 모바일 360px QA

- **담당 역할 / 목표:** 테스트·CI·QA / 360/390/430px에서 홈·시장·상세·거래·자산과 후속 화면의 overflow·touch·상태 UI를 확인한다.
- **선행 / 관련 / 병렬:** 대상 UI 준비 / ETF-06~08, RANK-07, ADMIN-08 / 접근성 QA와 병렬 가능.
- **수정 허용 범위:** QA evidence/report, 승인된 작은 UI fix는 별도 fix Issue. **수정 금지:** 테스트 중 기능 확장.
- **완료 조건 / 테스트 명령:** 기기/브라우저별 pass/fail·스크린샷·재현 Issue / `npm run dev`, `npm run build`.
- **권장 Git:** `test/mobile-360-qa` / `test: document 360px mobile QA` / `test: verify mobile layouts at supported widths`.

### QA-06 — 접근성 QA

- **담당 역할 / 목표:** 테스트·CI·QA / 키보드, focus, dialog, aria live/label, 44px, 색 외 상태, screen reader를 점검한다.
- **선행 / 관련 / 병렬:** 대상 UI 준비 / QA-05, 각 UI Issue / 모바일 QA와 병렬 가능.
- **수정 허용 범위:** 접근성 report/test, 수정은 별도 fix Issue. **수정 금지:** 접근성 검사를 제거하거나 시각만으로 통과 판정.
- **완료 조건 / 테스트 명령:** 핵심 여정 checklist와 severity별 Issue / `npm run lint && npm test && npm run build`.
- **권장 Git:** `test/accessibility-qa` / `test: document accessibility audit` / `test: audit keyboard and screen reader flows`.

### QA-07 — Firebase 기존 데이터 확인

- **담당 역할 / 목표:** 테스트·CI·QA / 저장소·배포 설정·운영 담당자 질문을 통해 이전 Firebase 데이터/의존성 존재 여부와 보존 결정을 기록한다.
- **선행 / 관련 / 병렬:** 팀장 승인과 이전 시스템 접근 담당자 / QA-11 / 독립 진행 가능.
- **수정 허용 범위:** read-only checklist/report. **수정 금지:** Firebase 프로젝트 삭제, secret 출력, 원격 데이터 변경.
- **완료 조건 / 테스트 명령:** 확인 대상·담당자·증거·결정 미정 항목이 기록됨 / `git grep -n -i firebase -- . ':!node_modules'`.
- **권장 Git:** `docs/firebase-data-audit` / `docs: record Firebase data audit procedure` / `docs: add read-only Firebase migration audit`.

### QA-08 — 외부 별점 연동 계약 조사

- **담당 역할 / 목표:** 테스트·CI·QA(관리자 지원) / provider API, 인증·서명·중복·ID mapping·freshness·failure 정책을 조사한다.
- **선행 / 관련 / 병렬:** 실제 provider 담당자와 문서 / 10단계 후속 / 폐장 설계와 병렬 가능.
- **수정 허용 범위:** 조사/contract 문서와 비밀 없는 fixture 계획. **수정 금지:** 추측 구현, 실제 secret, provider/운영 연결.
- **완료 조건 / 테스트 명령:** 확정/미확정 분리, contract test 계획, 중립 fallback, 데이터 최소화 합의 / `npm run seed:validate`.
- **권장 Git:** `docs/rating-provider-contract` / `docs: investigate rating provider contract` / `docs: define prerequisites for rating integration`.

### QA-09 — 폐장 특수 설계 검토

- **담당 역할 / 목표:** 테스트·CI·QA(관리자 지원) / cutoff→drain→final price/ETF/ranking→immutable snapshot 상태 머신과 failure injection 계획을 검토한다.
- **선행 / 관련 / 병렬:** ETF·랭킹 계약, 운영 시각 결정 / 11단계 후속, ADMIN-03 / QA-08과 병렬 가능.
- **수정 허용 범위:** closure design/review 문서. **수정 금지:** 폐장 RPC 구현, 운영 시장 상태 변경.
- **완료 조건 / 테스트 명령:** 상태·lease/idempotency·재시도·2인 승인·rollback 불가 경계와 미정값 기록 / `npm test`.
- **권장 Git:** `docs/closure-design-review` / `docs: review festival closure state machine` / `docs: define closure implementation gates`.

### QA-10 — 부하 테스트 스크립트 기반

- **담당 역할 / 목표:** 테스트·CI·QA / 비식별 local/staging fixture, auth ramp, 인기 종목 hotspot, Realtime fan-out, 지표 수집 틀을 만든다.
- **선행 / 관련 / 병렬:** 승인된 staging·SLO·도구 선택 / QA-03~04 / checklist 작업과 병렬 가능.
- **수정 허용 범위:** 별도 `scripts/load/`, fixture·문서, 승인된 dev dependency. **수정 금지:** production load, 실제 학생, 비밀 하드코딩, 결과 조작.
- **완료 조건 / 테스트 명령:** dry/local smoke와 500명 임시 시나리오·중단 기준·무결성 대조가 문서화됨 / `<승인된 부하 도구 명령은 도구 선택 Issue에서 확정>`.
- **권장 Git:** `test/load-test-foundation` / `test: add load test foundation` / `test: scaffold isolated load scenarios`.

### QA-11 — 배포 체크리스트

- **담당 역할 / 목표:** 테스트·CI·QA / local→staging→production 승인, secrets, migration, OAuth, smoke, monitoring, go/no-go 절차를 실행형 목록으로 만든다.
- **선행 / 관련 / 병렬:** 호스팅·운영 담당·SLO 결정 / QA-07, QA-12 / 롤백 checklist와 병렬 가능.
- **수정 허용 범위:** deployment/release checklist 문서. **수정 금지:** 실제 deploy, remote migration/seed, 운영 secret.
- **완료 조건 / 테스트 명령:** 각 단계 담당자·증거·승인·중단 기준과 미정 placeholder가 표시됨 / `npm run lint && npm test && npm run seed:validate && npm run build`.
- **권장 Git:** `docs/deployment-checklist` / `docs: add deployment readiness checklist` / `docs: define staged deployment gates`.

### QA-12 — 운영 롤백 체크리스트

- **담당 역할 / 목표:** 테스트·CI·QA / UI, DB forward fix, RLS, Cron, market halt, reconciliation, 연락·복구 확인 절차를 만든다.
- **선행 / 관련 / 병렬:** QA-11, 운영 책임자 / QA-09 / QA-11과 초안 병렬 가능.
- **수정 허용 범위:** rollback/runbook 문서. **수정 금지:** 실제 rollback·운영 변경, destructive down migration 안내.
- **완료 조건 / 테스트 명령:** 장애 유형별 trigger·담당자·명령 승인 경계·재개 조건·연습 기록란 완성 / `npm test && npm run test:db`(local rehearsal 가능 시).
- **권장 Git:** `docs/operations-rollback` / `docs: add operations rollback checklist` / `docs: define market rollback and recovery checks`.

## 핵심 의존 관계

```text
ETF-01 → ETF-02 → ETF-03 → ETF-04
      └→ ETF-05 → ETF-06/ETF-07 → ETF-08

RANK-01 → RANK-02 → RANK-03/RANK-04 → RANK-05
       └→ RANK-06 ────────────────→ RANK-07 → RANK-09
                         RANK-03/05 → RANK-08

ADMIN-01 → ADMIN-02 → ADMIN-03/04/05/06
                  └→ ADMIN-07 → ADMIN-08/09

QA-01 → QA-02
각 기능 migration → QA-03/04
각 UI → QA-05/06
ETF·랭킹·운영 계약 → QA-09 → 11단계 구현
QA-03~10 → QA-11/12 → 12단계 release gate
```
