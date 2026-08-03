# 작업 소유권과 통합 경계

## 공통 원칙

소유권은 다른 팀원의 읽기·리뷰를 막는 권한이 아니라 충돌과 보안 누락을 줄이는 기본 경계다. 아래 공용 파일은 **팀장 승인 없이 임의 수정하지 않는다**.

- `package.json`, lockfile, `AGENTS.md`, `README.md`
- `src/main.js`, `src/router/*`, `src/config/*`
- `supabase/config.toml`, 기존 `supabase/migrations/*`
- `docs/DATA_CONTRACTS.md`, `docs/DATABASE_SCHEMA.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY_MODEL.md`, `docs/DECISIONS.md`
- `.github/workflows/*`, Issue/PR 템플릿과 협업 정책 문서

DB 변경은 기존 migration을 고치지 않고 새 migration을 추가한다. 번호·순서와 공통 계약 변경은 팀장이 조정한다. 공용 파일 승인은 관련 Issue 또는 PR 댓글로 남긴다.

## 역할 1. 팀장·통합 담당

- **담당 기능:** Issue 분해·배정, `main`/`develop`, 공통 계약, PR review/merge, 통합 테스트, release·rollback, 진행 상태와 충돌 조정.
- **기본 수정 허용:** `docs/`의 협업·통합·배포 문서, `.github/` 템플릿과 승인된 workflow, release metadata.
- **임의 수정 금지:** 담당자와 합의하지 않은 ETF·랭킹·관리자 기능 모듈, 운영 DB/secret, 사용자 미추적 형제 프로젝트.
- **협의할 공용 파일:** 위 공통 목록 전체. 팀장은 최종 승인자지만 관련 기능 담당자의 검토를 받아야 한다.
- **선행 작업:** 팀 배정, `develop` 생성·보호, Issue/PR/CI 규칙 설정.
- **제공해야 하는 API/Repository:** 버전이 명시된 공통 데이터 계약, 통합 순서, migration 번호, release checklist와 rollback 결정.
- **완료 조건:** 각 PR이 Issue 범위·소유권·보안·테스트 gate를 충족하고 `develop` 전체 회귀가 통과한다.
- **테스트:** `npm run lint`, `npm test`, `npm run seed:validate`, `npm run build`, 가능한 local DB 전체 테스트.
- **연결 지점:** 모든 역할의 공용 계약 PR을 조정하고 QA 결과 없이는 release 승인하지 않는다.

## 역할 2. ETF 담당

- **담당 기능:** 7단계 ETF 계약·계산·6개 구성 검증·가격 회차 일치·조회 Repository·목록/상세 UI·Realtime lifecycle·ETF 테스트.
- **기본 수정 허용:** 새 `src/services/` ETF Repository, 새 ETF view/component/CSS, ETF 전용 테스트, 승인된 새 ETF migration, `docs/ETF_STRUCTURE.md`와 ETF 구현 문서.
- **임의 수정 금지:** 거래 RPC, accounts/holdings, 랭킹·관리자·별점·폐장 기능, 기존 migration, 공식 20 clubs/6 ETFs 구성 변경, ETF 거래.
- **협의할 공용 파일:** router/navigation, 가격 publish transaction, 공통 formatter, 데이터 계약, `package.json`, Supabase config/workflow.
- **선행 작업:** ETF 입력/출력·rounding·회차/stale 계약 승인, migration 번호 배정.
- **제공해야 하는 API/Repository:** 동일 가중 ETF 계산 결과, 6개 snapshot, bounded `EtfRepository` 구독/해제 인터페이스, 로딩·오류·stale 모델.
- **완료 조건:** 공식 6개가 정확히 계산되고 20 components가 한 번씩 포함되며 club/ETF 회차가 섞이지 않고 거래 경로가 없다.
- **테스트:** unit 계산/rounding, pgTAP 구성·권한·회차 원자성, listener 해제, UI 360px·접근성, 전체 표준 명령.
- **연결 지점:** 가격 엔진 publish 계약은 팀장, 홈 preview/router는 UI 통합, Realtime/RLS는 QA와 공동 검토.

## 역할 3. 랭킹 담당

- **담당 기능:** 8단계 총자산 평가, private entries, sanitized TOP 10, competition rank, 내 순위 RPC, Repository/UI, stale와 개인정보 테스트.
- **기본 수정 허용:** 새 랭킹 migration, 랭킹 service/view/component/test, 랭킹 전용 문서.
- **임의 수정 금지:** 거래·가격 알고리즘, ETF·관리자 기능, 기존 migration, 전체 사용자/holding의 브라우저 조회, 공개 UID/email/실명.
- **협의할 공용 파일:** accounts/holdings/clubs 계약, router/navigation, price completion 신호, 데이터 계약, workflow.
- **선행 작업:** 평가 시점·competition rank·동점 순서·public payload·갱신 SLO 승인.
- **제공해야 하는 API/Repository:** sanitized TOP 10 snapshot 조회, 인증된 본인 순위 RPC, `RankingRepository` 구독/해제와 stale 모델.
- **완료 조건:** 화면 요청이 전체 사용자를 스캔하지 않고 TOP 10/내 순위가 일치하며 공개 payload에 직접·내부 식별자가 없다.
- **테스트:** pgTAP tie/경계/권한/동시 job, payload privacy, unit stale 모델, UI 360px·접근성, 전체 표준 명령.
- **연결 지점:** 가격 완료 신호는 ETF/가격 계약, nickname projection은 팀장, privacy/부하는 QA와 검토.

## 역할 4. 관리자·시장 운영 담당

- **담당 기능:** 9단계 role·재인가·시장/종목 제어·뉴스·이벤트·감사·UI, 10단계 외부 별점 계약 준비, 11단계 폐장 설계 준비.
- **기본 수정 허용:** 승인된 새 admin migration, admin service/view/component/test, `docs/FESTIVAL_OPERATIONS.md` 및 관리자·별점·폐장 전용 설계 문서.
- **임의 수정 금지:** 클라이언트 service-role 사용, 무감사 권위 쓰기, 기존 migration, 직접 현금/가격 편집, 실제 provider/production 연결, 첫 거래 후 무단 초기화.
- **협의할 공용 파일:** auth/role·market state·events/news contracts, router/config, price input, Supabase config, deployment docs/workflow.
- **선행 작업:** 실제 관리자·2인 승인자·이벤트 상한·운영 일정·provider 계약 결정.
- **제공해야 하는 API/Repository:** 최소 권한 admin RPC, 공개 sanitized news/event/market projection, append-only audit, UI 확인·오류 계약.
- **완료 조건:** 모든 관리자 변경이 서버 재인가와 원자 감사 로그를 거치며 halt가 새 거래를 차단하고 일반 사용자의 우회가 실패한다.
- **테스트:** pgTAP 일반/위조/회수 role, 입력·동시 halt·audit 불변, XSS/oversize, UI 접근성, 전체 표준 명령.
- **연결 지점:** 거래·가격 상태 변경은 팀장 통합, 공개 조회는 ETF/랭킹 UI, 공격 테스트와 운영 리허설은 QA.

## 역할 5. 테스트·CI·QA 담당

- **담당 기능:** frontend/DB CI, pgTAP/RLS/동시성 회귀, 모바일·접근성, secret·보안, Firebase 잔존 확인, 부하 기반, 배포·롤백 checklist와 12단계 준비.
- **기본 수정 허용:** `test/`, `supabase/tests/`, QA·검증 문서, 승인된 `.github/workflows/*`, 별도 test/load scripts.
- **임의 수정 금지:** 테스트 통과를 위한 제품 권한 완화, 기존 migration 수정, 공식 데이터 변경, 운영 대상 테스트, 제품 기능의 무단 리팩터링.
- **협의할 공용 파일:** `package.json`, workflow, Supabase config, data/security/test/deployment contracts, fixture가 사용하는 migration/seed.
- **선행 작업:** 재현 가능한 Node 20·Docker·Supabase CLI 환경과 각 기능 계약.
- **제공해야 하는 API/Repository:** CI 결과, 재현 가능한 failure report, 공격/동시성 fixture, QA evidence, go/no-go와 rollback checklist.
- **완료 조건:** 테스트가 실제 실패를 드러내며 필수 gate가 재현되고 미실행 검증·blocker가 명확하다.
- **테스트:** 저장소의 모든 표준 명령, local-only DB test, 360px/키보드/screen reader, stage별 보안·부하 시험.
- **연결 지점:** 모든 역할의 PR test plan을 검토하고 팀장에게 통합·release 근거를 제공한다.

## 교차 승인 표

| 변경 | 구현 담당 | 필수 검토 |
|---|---|---|
| 가격 publish에 ETF 추가 | ETF | 팀장, QA |
| 총자산/가격 완료 계약 | 랭킹 | 팀장, ETF, QA |
| 시장 halt·event 입력 | 관리자 | 팀장, QA |
| RLS/grants/SECURITY DEFINER | 해당 기능 | 팀장, QA |
| router/navigation | 해당 UI | 팀장, 영향받는 UI 담당 |
| CI 필수 check | QA | 팀장 |
| 공통 계약 변경 | 제안 역할 | 팀장 + 영향받는 역할 |
