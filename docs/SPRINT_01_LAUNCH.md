# Sprint 01 실행 패킷

이 문서는 이미 `develop`에 병합된 5인 협업 구조를 기준으로 첫 스프린트를 시작하기 위한 실행 자료다. 이번 스프린트의 첫 작업은 계약·권한·회귀 감사이며 ETF 계산, 랭킹 계산, 관리자 RPC/UI 등 7단계 이후 기능은 구현하지 않는다.

## 1. 현재 기준

검증 시각은 2026-08-08 KST이며, `git fetch origin` 이후의 결과다.

| 항목 | 검증 결과 |
|---|---|
| 현재 작업 브랜치 | `chore/launch-first-sprint` |
| 현재 HEAD | `2571aeaa983bac4b4f5e8a3b42513a559bc6f02c` (`chore: add five-person collaboration workflow (#1)`) |
| `origin/main` | `6da02b304d49961281457638ad4146762b0365af` (`refactor: Firebase 시스템을 Supabase로 전환`) |
| `origin/develop` | `2571aeaa983bac4b4f5e8a3b42513a559bc6f02c` |
| main/develop 관계 | `develop`이 `main`보다 1커밋 앞서고, 반대 방향 커밋은 0개다. |
| GitHub Actions | `develop`의 CI run `30826163178`이 2026-08-04 KST에 `frontend`, `database`를 포함해 성공 완료했다. |
| 열린 GitHub PR/Issue | GitHub 조회 기준 모두 0개다. 따라서 첫 Issue 4개는 아직 생성되지 않았다. |
| 원격 잔존 브랜치 | `origin/chore/setup-team-collaboration`은 squash 병합 커밋과 patch-equivalent다. `origin/agent/pghs-foundation-auth-firestore`는 현재 계보와 merge base가 없는 과거 작업이다. 둘 다 열린 PR은 아니며 팀장이 소유자 확인 후 정리 여부를 결정한다. |

GitHub Actions 실행: <https://github.com/adfaaraqdf/PGHS-HTS/actions/runs/30826163178>

로컬 작업 트리에는 이 작업 전에 존재한 `.DS_Store` 수정과 `.idea/`, `FootballGame/`, `SCHOOLWATCH_NEIS_SETUP.md`, `app/`, `collab-platform-server/`, `project_mom/` 미추적 항목이 있다. 이 패킷 작업에서는 어느 것도 수정하거나 stage하지 않는다. 각 팀원도 작업 시작 때 동일하게 `git status`를 확인하고 본인 Issue 파일만 stage해야 한다.

## 2. 기존 협업 구조 검증

다음 기반이 모두 `develop`에 존재한다.

- `CONTRIBUTING.md`
- `docs/COLLABORATION_PLAN.md`
- `docs/WORK_OWNERSHIP.md`
- `docs/TASK_BOARD.md`
- `docs/TEAM_ASSIGNMENTS.md`
- `docs/FIRST_SPRINT.md`
- `docs/GITHUB_SETUP.md`
- `docs/codex-prompts/`의 팀장, ETF, 랭킹, 관리자, QA, PR 리뷰 프롬프트
- `.github/ISSUE_TEMPLATE/`의 feature, bug, QA 템플릿
- `.github/pull_request_template.md`
- `.github/workflows/ci.yml`

CI의 frontend job은 `package.json`에 실제로 존재하는 `npm ci`, `npm run lint`, `npm test`, `npm run seed:validate`, `npm run build`를 실행한다. database job도 실제 스크립트인 `npm run supabase:start`, `npm run db:reset`, `npm run db:lint`, `npm run test:db`, `npm run supabase:stop`을 사용하며 종료 단계는 `if: always()`다.

설계 문서와 실제 구현을 대조한 결과는 다음과 같다. 이번 작업에서는 차이를 수정하지 않고 첫 감사 Issue의 입력으로 사용한다.

1. `docs/COLLABORATION_PLAN.md`의 감사 기준과 `docs/GITHUB_SETUP.md`의 develop 생성 절차는 병합 전 상태를 설명한다. 현재는 `develop`과 CI가 이미 존재하므로 재생성하지 않는다.
2. `docs/DATA_CONTRACTS.md`, `docs/DATABASE_SCHEMA.md`, `docs/SECURITY_MODEL.md`는 브라우저 역할에 `private` schema `USAGE`가 없다고 설명하지만 실제 migration은 RLS helper 실행을 위해 `authenticated`에 `USAGE`와 `private.is_active_user(uuid)`의 `EXECUTE`를 부여한다. private table 권한과 나머지 private function 실행 권한은 회수되어 있다. QA가 우회 가능성을 pgTAP으로 검증한 뒤 문서 정합성 변경을 별도 Issue로 결정한다.
3. 실제 `public.etfs`는 공식 6개와 구성 배열, 기본 가격 필드를 갖지만 `docs/ETF_STRUCTURE.md`가 제안한 `valuationVersion`, `stale`, 계산 시각, 거래 불가·동일 가중 metadata 등은 아직 없다. `private.run_price_tick()`도 20개 club과 시장 window만 갱신하고 ETF는 계산하거나 publish하지 않는다.
4. `private.leaderboard_entries`와 `public.public_leaderboard` 자리 구조는 있으나 총자산 평가 job, competition rank, 공개 allowlist 강제, 본인 순위 RPC는 없다. 공개 JSON payload의 개인정보 불변식도 구현 전 계약 확정이 필요하다.
5. `market_state`, `admin_events`, `news`, `private.audit_logs`는 존재하고 브라우저 직접 쓰기는 차단되어 있으나 관리자 role 저장소와 관리자 RPC가 없다. 현재 감사 로그에는 일반적인 `change_summary`가 있을 뿐 제안된 before/after/reason 및 관리자 command 원자성 계약은 확정되지 않았다.
6. 0~6단계 클라이언트는 `src/views/stage-six-view.js` 중심으로 구현되어 있다. 조회는 clubs 20, holdings 20, news 5로 제한되고 route 이탈 시 구독을 제거한다. 이번 스프린트에서 파일 재구성이나 재구현을 하지 않는다.
7. 공식 카탈로그 검증은 문서 정본과 `supabase/seed.sql`의 ID 집합을 비교하며 현재 20 clubs, 6 ETFs, 20개 ETF 편입을 통과한다. 별칭은 별도 종목이 아니다.

## 3. 역할별 시작 카드

모델과 reasoning effort는 프롬프트가 자동 선택하지 않는다. 각 작업자가 새 Codex 대화를 만들 때 UI 또는 CLI에서 직접 선택한다.

### 팀장·통합 담당

- 추천 Codex: GPT-5.6 Sol
- 추천 reasoning effort: High. 어려운 PR 최종 리뷰는 XHigh.
- 첫 작업: 이 실행 패킷 검토, 친구 4명 역할 확정, 아래 Issue 4개 생성·배정, branch protection과 기본 PR base를 GitHub에서 확인한다.
- 선행 조건: `develop` 최신 상태, 팀원 GitHub ID, 팀원 초대 수락 여부.
- 수정 허용 범위: 승인된 협업·통합 문서, Issue/PR metadata, 필요한 GitHub 설정.
- 수정 금지 범위: 담당자 기능 선행 구현, 운영 Supabase/secret, 제품 코드, 기존 migration, 사용자 기존 변경.
- 완료 조건: 4개 Issue에 담당자·리뷰어가 배정되고 `main`/`develop` 보호 및 필수 CI 상태가 사람에게 확인되며 링크가 팀에 공유된다.
- 필수 테스트: 통합 PR마다 `npm run lint`, `npm test`, `npm run seed:validate`, `npm run build`; Docker 가능 시 local DB 전체 명령.
- 권장 브랜치명: `chore/launch-first-sprint`
- 권장 commit: `docs: prepare first sprint launch packet`
- 권장 PR 제목: `docs: prepare first sprint launch packet`

### ETF 담당

- 추천 Codex: GPT-5.6 Sol
- 추천 reasoning effort: High.
- 첫 작업: ETF-01 성격의 계약 감사. `public.etfs`, 공식 6개 구성, `private.run_price_tick()`, 가격 window 연결점을 대조한다.
- 선행 조건: 0~6단계와 공식 20 clubs/6 ETFs 고정, 팀장의 감사 Issue 배정.
- 수정 허용 범위: 새 ETF 전용 감사 문서만.
- 수정 금지 범위: 코드, migration, 기존 가격/거래 함수, 공식 구성, ETF 거래·UI·계산 구현, 공용 계약 무승인 수정.
- 완료 조건: 실제 필드와 목표 필드, 동일 가중 integer half-up, 입력 누락·중복 fail-closed, club/ETF 회차 일치 조건, stale 정책, 구현 전 결정 사항이 기록된다.
- 필수 테스트: `npm run seed:validate`.
- 권장 브랜치명: `docs/etf-contract-audit`
- 권장 commit: `docs: audit ETF data contract`
- 권장 PR 제목: `docs: define ETF calculation contract`

### 랭킹 담당

- 추천 Codex: GPT-5.6 Sol
- 추천 reasoning effort: High.
- 첫 작업: RANK-01 성격의 계약 감사. `accounts`, `holdings`, `clubs`, private/public leaderboard 자리 구조와 개인정보 위협을 분석한다.
- 선행 조건: 0~6단계와 현재 가격 version 계약, 팀장의 감사 Issue 배정. ETF 회차 계약은 미결정 의존성으로 기록한다.
- 수정 허용 범위: 새 랭킹 전용 감사 문서만.
- 수정 금지 범위: 코드, migration, 기존 자산·가격 계산, 전체 사용자 browser 조회, UID/email/실명/internal ID 공개.
- 완료 조건: 현금+보유 평가 계약, integer overflow 경계, disabled 계정, 평가 version/SLO, competition rank와 동점 순서, private/public allowlist, 본인 순위 RPC와 위협 모델이 기록된다.
- 필수 테스트: `npm test`.
- 권장 브랜치명: `docs/ranking-contract-audit`
- 권장 commit: `docs: audit ranking data contract`
- 권장 PR 제목: `docs: define total asset ranking contract`

### 관리자·시장 운영 담당

- 추천 Codex: GPT-5.6 Sol
- 추천 reasoning effort: XHigh. Max는 복잡한 권한 우회·폐장/거래 무결성의 원인 불명 문제에만 사용한다.
- 첫 작업: ADMIN-01 성격의 권한·시장 운영 감사. `market_state`, `admin_events`, `news`, RLS/grants, audit 구조를 분석하고 역할 저장·재인가·RPC 계약을 제안한다.
- 선행 조건: 실제 관리자·승인자 후보와 운영 정책은 미정으로 표시하고, 팀장의 감사 Issue를 배정받는다.
- 수정 허용 범위: 새 관리자 권한·시장 운영 설계 문서만.
- 수정 금지 범위: 코드, migration, 실제 claim/계정, service-role client 사용, 관리자 RPC/UI 구현, 운영 연결·변경, 직접 현금/가격 수정.
- 완료 조건: 역할 lifecycle, 일반 사용자·위조·회수 위협, 개장/정지/재개 상태 전이, 종목 halt, news/event validation, append-only audit 필드와 원자성, 고위험 확인 절차, 미결정 운영자가 기록된다.
- 필수 테스트: `npm test`.
- 권장 브랜치명: `docs/admin-authorization-design`
- 권장 commit: `docs: define administrator authorization`
- 권장 PR 제목: `docs: design market administrator roles`

### 테스트·CI·QA 담당

- 추천 Codex: GPT-5.6 Terra
- 추천 reasoning effort: High. 보안·거래 무결성 결함 분석만 GPT-5.6 Sol / High 이상으로 재검토한다.
- 첫 작업: 현재 0~6단계 회귀와 GitHub Actions 결과를 재현하고, Docker가 가능하면 local DB 전체 검증을 실행해 결과 보고서를 만든다.
- 선행 조건: Node 20+, 의존성 설치, Docker Desktop과 Supabase CLI. production 대상이 아닌지 확인한다.
- 수정 허용 범위: 새 QA 재현 보고서와 승인된 테스트 전용 파일. 첫 실패 재현 단계에서는 제품 코드와 테스트를 수정하지 않는다.
- 수정 금지 범위: 테스트 삭제·skip·기대값 약화, RLS/grant 완화, 기존 migration, 운영 DB·실제 학생 데이터, 실패를 가짜 성공 처리.
- 완료 조건: 각 명령의 환경·정확한 결과·실패 로그 요약·재현·영향·미실행 이유와 CI run 링크가 기록되고 발견 결함은 별도 Issue 후보로 분리된다.
- 필수 테스트: `npm run lint`, `npm test`, `npm run seed:validate`, `npm run build`; Docker 가능 시 `npm run supabase:start`, `npm run db:reset`, `npm run db:lint`, `npm run test:db`, `npm run supabase:stop`.
- 권장 브랜치명: `test/stage-0-6-regression`
- 권장 commit: `test: document stage 0-6 regression baseline`
- 권장 PR 제목: `test: verify current stage 0-6 baseline`

## 4. 친구 선택용 표

팀장·통합 담당은 확정된 것으로 처리한다. 팀장 이름과 GitHub ID는 팀장이 `docs/TEAM_ASSIGNMENTS.md`에 직접 입력하고, 아래 네 명은 선택 결과 확정 후 옮긴다. 이름이나 ID를 추측하지 않는다.

| 이름 | GitHub ID | 1순위 역할 | 2순위 역할 | 최종 역할 |
|---|---|---|---|---|
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |

## 5. GitHub에 생성할 첫 Issue 4개

아래 본문은 각 Issue에 그대로 붙여 넣을 수 있다. Issue를 만든 뒤 담당자, 리뷰어, 번호를 확정하고 한 Issue당 브랜치·Codex 대화·PR을 각각 하나만 사용한다.

### Issue 1 — ETF 데이터 계약과 가격 회차 감사

````markdown
## 목표

현재 공식 ETF 6개 계약과 실제 `public.etfs`, `private.run_price_tick()`을 대조하고, 구현 전에 필요한 동일 가중 정수 계산·오류·stale·가격 회차 일치 결정을 문서화한다. ETF 계산 함수나 UI는 구현하지 않는다.

## 담당 역할

ETF 담당

## 선행 조건

- `develop`의 0~6단계와 공식 20 clubs/6 ETFs 유지
- `AGENTS.md`, 협업 문서, `docs/DATA_CONTRACTS.md`, `docs/DATABASE_SCHEMA.md`, `docs/ETF_STRUCTURE.md` 검토
- 실제 schema, seed, `private.run_price_tick()` 확인

## 수정 허용 범위

- 새 ETF 전용 계약 감사 문서 1개

## 수정 금지 범위

- 애플리케이션 코드와 migration
- 기존 거래·가격 migration 또는 함수 수정
- 공식 club/ETF 구성 변경과 alias 종목 추가
- ETF 계산·Repository·UI·Realtime·거래 선행 구현
- 공용 계약의 승인 없는 변경

## 완료 조건

- 실제 `public.etfs` 필드와 목표 projection 필드 차이 기록
- 동일 가중 integer half-up 입력/출력과 rounding 예시 기록
- 20개 component의 누락·중복·invalid 입력 fail-closed 정책 기록
- club 가격 window와 ETF `valuationVersion`의 일치 조건 및 원자 publish 연결점 기록
- stale/마지막 정상값/스포츠 단일종목 표시 정책 기록
- 확정 사항과 구현 전 팀장 결정 사항 분리

## 테스트

```bash
npm run seed:validate
```

## 예상 위험

- 기존 가격 tick을 직접 고쳐 회차 정합성을 깨뜨릴 위험
- 일부 component만으로 ETF를 계산할 위험
- 문서의 목표 필드를 이미 구현된 것으로 오인할 위험

## 권장 브랜치

`docs/etf-contract-audit`
````

### Issue 2 — 총자산·랭킹·개인정보 계약 감사

````markdown
## 목표

현금+보유 평가액, 가격 version, competition rank, private entry, sanitized TOP 10, 본인 순위 RPC 계약을 현재 schema와 대조하고 개인정보 노출 위협을 문서화한다. 랭킹 job, RPC, UI는 구현하지 않는다.

## 담당 역할

랭킹 담당

## 선행 조건

- `develop`의 0~6단계 유지
- `accounts`, `holdings`, `clubs`, `private.leaderboard_entries`, `public.public_leaderboard` 확인
- 가격 회차 및 ETF 감사와의 의존성 기록

## 수정 허용 범위

- 새 랭킹 전용 계약 감사 문서 1개

## 수정 금지 범위

- 코드와 migration
- 기존 계정·거래·가격 계산 변경
- 브라우저의 전체 accounts/holdings 조회
- UID, 이메일, 실명, 내부 식별자 공개
- 랭킹 계산·Repository·UI 선행 구현

## 완료 조건

- 평가 입력/출력, 시점/version, bounded integer·overflow, disabled 계정 정책 기록
- competition rank와 10위 경계 동점·내부 안정 정렬 계약 기록
- private/public 필드 allowlist와 전체 사용자 scan 금지 계약 기록
- `auth.uid()` 기반 본인 순위 RPC의 최소 payload와 거부 경로 기록
- 목표 60초/최대 120초 stale 정책과 개인정보 위협 모델 기록
- 미결정 사항과 ETF/가격 선행 의존성 분리

## 테스트

```bash
npm test
```

## 예상 위험

- public JSON에 UID/email/실명/internal ID가 섞일 위험
- 화면 요청마다 전체 사용자·holding을 scan할 위험
- club/ETF 평가 version이 섞인 총자산을 publish할 위험

## 권장 브랜치

`docs/ranking-contract-audit`
````

### Issue 3 — 관리자 권한과 시장 운영 구조 감사

````markdown
## 목표

현재 `market_state`, `admin_events`, `news`, `private.audit_logs`, RLS/grants를 감사하고 관리자 role 저장·재인가, 개장/정지/재개, 종목 halt, 뉴스·이벤트, 원자 감사 로그 계약을 제안한다. RPC와 관리자 UI는 구현하지 않는다.

## 담당 역할

관리자·시장 운영 담당

## 선행 조건

- `develop`의 0~6단계와 현재 거래/가격 상태 검사 이해
- `docs/SECURITY_MODEL.md`, `docs/DATABASE_SCHEMA.md`, 운영 관련 문서 검토
- 실제 관리자·2인 승인자·운영 시각은 미정으로 표시

## 수정 허용 범위

- 새 관리자 권한·시장 운영 감사 문서 1개

## 수정 금지 범위

- 코드와 migration
- 실제 claim, 관리자 계정, bootstrap secret 생성
- service-role key의 브라우저·저장소 사용
- 시장/종목/news/event/audit 직접 DML 또는 운영 변경
- 관리자 RPC/UI, 별점 연동, 폐장 기능 선행 구현

## 완료 조건

- 현재 RLS/grants와 일반 사용자·외부·disabled·위조 role 공격면 기록
- 사용자 수정 불가 role 저장소와 bootstrap/회수/재인가 lifecycle 제안
- 시장 open/halted/closed 및 종목 상태 전이와 invalid transition 제안
- 개장·정지·재개 RPC의 입력, `auth.uid()` 재검증, 동시 거래 경계 제안
- news/event의 길이·시간·종목·bp 상한과 XSS 정책 제안
- actor/action/target/before/after/reason/correlation을 포함한 append-only 원자 audit 요구 기록
- 고위험 확인/2인 승인과 미결정 운영자 목록 기록

## 테스트

```bash
npm test
```

## 예상 위험

- 클라이언트 metadata 또는 UI 숨김을 권한 경계로 오인할 위험
- halt와 동시 거래 사이의 원자성 누락
- 성공 command와 audit log가 서로 다른 transaction에 기록될 위험
- secret 또는 개인정보가 감사 로그에 저장될 위험

## 권장 브랜치

`docs/admin-authorization-design`
````

### Issue 4 — 0~6단계 회귀와 CI 기준 감사

````markdown
## 목표

현재 0~6단계의 frontend·공식 시드·production build를 재현하고 Docker가 가능하면 격리된 Supabase local DB의 migration, lint, pgTAP까지 실행한다. 실패를 먼저 재현 보고하며 제품이나 테스트를 즉시 수정하지 않는다.

## 담당 역할

테스트·CI·QA 담당

## 선행 조건

- Node.js 20 이상과 `npm ci`
- DB 검증 시 Docker Desktop 실행과 local Supabase만 사용
- 대상 branch/commit과 환경 버전 기록

## 수정 허용 범위

- 새 QA 회귀 보고서 1개
- 별도 승인된 테스트 전용 파일은 후속 Issue에서만 변경

## 수정 금지 범위

- 제품 코드와 기존 migration
- 테스트 삭제·skip·기대값 약화
- RLS/grants/검증 완화
- production 또는 실제 학생 데이터 대상 실행
- OAuth secret이나 service-role key 출력·커밋
- 실패를 가짜 성공으로 처리

## 완료 조건

- 각 명령의 환경, exit status, 핵심 출력, 소요와 재현 절차 기록
- 실패 시 영향, 최초 실패 지점, 관련 없는 후속 오류를 분리
- GitHub Actions run과 로컬 결과 대조
- 미실행 DB/모바일/접근성 검증의 이유와 후속 Issue 후보 기록
- 테스트나 제품 권한을 약화한 변경 없음

## 테스트

```bash
npm run lint
npm test
npm run seed:validate
npm run build
```

Docker/Supabase 실행 가능 시:

```bash
npm run supabase:start
npm run db:reset
npm run db:lint
npm run test:db
npm run supabase:stop
```

## 예상 위험

- Docker 미실행을 DB 통과로 잘못 보고할 위험
- local이 아닌 remote Supabase를 대상으로 실행할 위험
- 기존 dirty/untracked 파일을 QA PR에 포함할 위험
- 최초 실패 전에 테스트나 제품을 고쳐 재현 근거를 잃을 위험

## 권장 브랜치

`test/stage-0-6-regression`
````

## 6. 역할별 Codex 실행 순서

각 팀원은 Issue가 배정된 뒤 다음 순서를 지킨다.

1. `git status`로 기존 사용자 변경을 확인한다.
2. `git checkout develop && git pull origin develop`로 기준을 최신화한다.
3. Issue 전용 브랜치를 만든다.
4. 새 Codex 대화를 만들고 역할에 맞는 `docs/codex-prompts/*.md`를 채워 사용한다.
5. 지정 Issue 하나와 허용 파일만 작업한다.
6. 필수 테스트를 실행하고 미실행 항목을 분리한다.
7. 사람이 `git diff`로 관련 없는 변경과 secret을 확인한다.
8. 사용자의 정확한 승인 후 commit과 push를 수행한다.
9. base가 `develop`인 PR 하나를 만들고 Issue를 연결한다.
10. 최소 1명 리뷰와 필수 CI 통과 후 승인된 방식으로 병합한다.

역할 프롬프트:

- 팀장: `docs/codex-prompts/TEAM_LEAD.md`
- ETF: `docs/codex-prompts/ETF.md`
- 랭킹: `docs/codex-prompts/RANKING.md`
- 관리자·시장 운영: `docs/codex-prompts/ADMIN_OPERATIONS.md`
- 테스트·CI·QA: `docs/codex-prompts/QA_CI.md`
- PR 리뷰: `docs/codex-prompts/PR_REVIEW.md`

## 7. 병렬 시작과 의존성

역할 배정과 Issue 생성이 끝나면 ETF 감사, 랭킹 감사, 관리자 감사, 0~6단계 QA는 서로 다른 문서·브랜치에서 병렬 시작할 수 있다. 첫 스프린트에서는 서로의 기능을 선행 구현하지 않는다.

다음 구현 작업은 감사 결과와 팀장 승인이 필요하다.

- ETF 계산은 ETF 계약, rounding, migration 번호 승인 뒤 시작한다.
- ETF 회차 publish는 ETF 계산과 가격 publish 계약 승인 뒤 시작한다.
- 랭킹 구현은 가격/ETF valuation version, 공개 payload, competition rank 계약 승인 뒤 시작한다.
- 관리자 RPC는 role 저장소, 운영자, 상태 전이, 감사 필드와 재인가 계약 승인 뒤 시작한다.
- DB·RLS·SECURITY DEFINER 변경은 해당 담당자 구현과 팀장·QA 검토가 함께 필요하다.

## 8. 사람의 GitHub 확인 항목

- 친구 4명을 정확한 GitHub ID로 초대하고 초대 수락을 확인한다.
- 팀장 포함 5명의 역할, 첫 Issue, 리뷰어를 배정하고 `docs/TEAM_ASSIGNMENTS.md`에 반영한다.
- 위 Issue 4개를 만들고 담당자·리뷰어·선행 관계를 설정한다.
- `main`과 `develop`의 PR 필수, 승인 1명 이상, conversation 해결, force-push·삭제 차단을 확인한다.
- Actions check `frontend`, `database`가 실제 필수 check인지 확인한다.
- 새 PR의 기본 base가 `develop`인지 확인한다.
- squash 병합 후 남은 원격 브랜치 2개의 소유자와 삭제 여부를 확인한다.

## 9. 아직 결정되지 않은 사항

- 친구 4명의 이름, GitHub ID, 1·2순위 및 최종 역할
- 각 Issue 번호, 담당자와 리뷰어
- GitHub collaborator 초대·branch ruleset·기본 브랜치의 실제 설정 상태
- ETF projection의 최종 필드명, rounding 예시, 실패·stale 정책, publish transaction 확장 방식
- 랭킹 평가 version, 동점 내부 정렬, 공개 nickname 정책, 갱신 SLO 확정값
- 관리자 role 저장소, bootstrap/회수 담당자, 실제 관리자·2인 승인자, 재인증 기준
- 운영 개장·정지·재개 일정, event 상한과 뉴스 정책
- 로컬 DB 재검증을 위한 Docker 실행 가능 환경

## 10. 이번 패킷 검증 결과

실행 완료:

- `git fetch origin`
- `npm run lint`: 성공
- `npm test`: 성공, 16/16
- `npm run seed:validate`: 성공, 공식 20 clubs/6 ETFs/20개 편입 확인
- `npm run build`: 성공
- GitHub Actions `develop` CI 조회: 성공 완료 run 확인

실행하지 못함:

- `npm run supabase:start`, `npm run db:reset`, `npm run db:lint`, `npm run test:db`, `npm run supabase:stop`: Docker daemon이 실행 중이 아니어서 이번 패킷에서는 실행하지 못했다.
- 수동 360px 모바일·키보드·screen reader QA: 이번 문서 준비 범위에서 실행하지 않았다. QA Issue에서 수행한다.
- production 연결, 원격 migration/seed, 배포: 금지 범위이므로 실행하지 않았다.

## 11. 보안·롤백

이 패킷은 제품 데이터 흐름, schema, RLS, grants, RPC, Realtime, 공식 카탈로그를 변경하지 않는다. 브라우저 권위 쓰기나 secret 설정도 추가하지 않는다.

롤백은 이 문서 파일만 삭제하거나 해당 문서 commit을 되돌리는 것이다. 기존 협업 문서와 0~6단계 제품, DB, GitHub 원격 설정에는 롤백할 변경이 없다.
