# 5인 협업 계획

## 1. 감사 기준일의 현재 상태

- 저장소: `adfaaraqdf/PGHS-HTS`
- 기준 브랜치·커밋: `main`, `6da02b3` (`refactor: Firebase 시스템을 Supabase로 전환`)
- 구현 완료: 0~6단계, Google 로그인·초기화, 1,000,000원 최초 지급, PostgreSQL/RLS, 거래 RPC, 가격 tick/Cron, 홈·시장·종목 상세·거래 모달·내 자산 UI
- 미완료: 7단계 ETF, 8단계 랭킹, 9단계 관리자·시장 운영, 10단계 외부 별점, 11단계 폐장, 12단계 부하·보안·배포 준비
- 정본 데이터: 동아리 20개, 조회 전용 ETF 6개. 별칭은 별도 종목이 아니다.
- GitHub 협업 기반: 감사 시점에는 기본적으로 `main`만 있고 Issue, PR, Actions 설정과 `.github/` 파일이 없다.
- 작업 트리에는 저장소 범위 밖 형제 프로젝트와 사용자 파일이 보이므로 이 프로젝트 작업에서 수정·stage하지 않는다.

## 2. 문서와 구현 차이 감사

현재 상태 판정은 실제 migration과 클라이언트 코드를 우선했다.

1. `docs/IMPLEMENTATION_PLAN.md` 5단계는 가격 후보·version barrier·입력 해시까지 제안하지만, 실제 migration은 advisory transaction lock과 단일 transaction의 수요·별점·이벤트 기반 tick이다. 후속 가격 계약 작업 전에 별도 Issue로 설계와 구현의 정합성을 결정해야 한다.
2. `docs/DATABASE_SCHEMA.md`와 `docs/DATA_CONTRACTS.md`는 브라우저 역할에 `private` schema USAGE가 없다고 설명하지만, 실제 migration은 RLS helper 실행에 필요한 `USAGE`를 `authenticated`에 주고 private table/function 권한은 회수한다. 권한 자체를 즉시 바꾸지 말고 QA가 노출 가능성을 pgTAP으로 확인한 뒤 문서를 실제 최소 권한 모델과 맞춘다.
3. 6단계 화면은 계획상의 여러 view 파일 대신 `src/views/stage-six-view.js`에 통합되어 있다. 기능은 존재하므로 이번 협업 기반 작업에서 재구성하지 않는다.

## 3. 브랜치 역할

| 브랜치 | 용도 | 규칙 |
|---|---|---|
| `main` | 배포 가능한 안정 버전 | 직접 push 금지, `develop`의 release PR만 허용 |
| `develop` | 팀 기능 통합 | 모든 일반 PR의 기본 대상, 직접 push 금지 |
| `feature/*` | 일반 기능 | Issue 하나당 짧은 브랜치 |
| `fix/*` | 버그 수정 | 재현 테스트와 수정 범위 포함 |
| `test/*` | 테스트·QA | 제품 동작을 약화하지 않음 |
| `chore/*` | 문서·CI·협업 설정 | 기능 구현과 섞지 않음 |
| `release/*` | 최종 배포 준비 | 새 기능보다 검증·문서·버전 고정 |

현재 작업에서는 `develop`을 만들지 않는다. 팀장은 `docs/GITHUB_SETUP.md`의 명령과 웹 설정을 검토 후 직접 실행한다.

## 4. 다섯 역할

1. **팀장·통합 담당**: Issue·일정·공용 계약·브랜치·리뷰·병합·배포·롤백의 최종 조정자다. 모든 기능을 혼자 구현하지 않는다.
2. **ETF 담당**: 7단계 동일 가중 계산, 회차 정합성, 조회 Repository/UI/Realtime, 6개 구성 검증을 담당한다. ETF 거래는 만들지 않는다.
3. **랭킹 담당**: 8단계 총자산 평가, private entry, 개인정보가 제거된 TOP 10, competition rank, 내 순위와 stale UI를 담당한다.
4. **관리자·시장 운영 담당**: 9단계 권한/RPC/감사/UI와 10·11단계 계약·운영 준비를 담당한다. service-role key를 클라이언트에 두지 않는다.
5. **테스트·CI·QA 담당**: CI, pgTAP/RLS/동시성/모바일/접근성/부하·보안·배포 검증을 맡는다. 테스트를 삭제하거나 약화하지 않는다.

상세 소유권은 `docs/WORK_OWNERSHIP.md`, 실제 배정은 `docs/TEAM_ASSIGNMENTS.md`를 따른다.

## 5. 전체 협업 흐름

`Issue → 작업 브랜치 → 전용 Codex 대화 → 로컬 검증 → commit → push → develop 대상 PR → 리뷰·CI → squash merge`

- Issue에 목표, 선행 작업, 허용·금지 범위, 완료 조건, 테스트를 먼저 적는다.
- 해당 Issue만 다루는 브랜치와 Codex 대화를 만든다.
- Codex에는 역할별 `docs/codex-prompts/` 템플릿을 채워 전달한다.
- 공용 파일이 필요하면 구현 전에 팀장 승인을 Issue/PR에 기록한다.
- 작성자는 실행한 테스트와 실행하지 못한 테스트를 구분한다.
- 리뷰어는 `PR_REVIEW.md` 기준으로 회귀·보안·소유권을 검토한다.

## 6. 매일 작업 방식

1. 작업 시작 때 `develop`을 pull하고 `git status`로 사용자 변경을 확인한다.
2. 본인 Issue의 상태, 선행 PR, 오늘 끝낼 1일 범위를 확인한다.
3. 공용 파일 변경 가능성이 생기면 팀장과 관련 역할에 먼저 알린다.
4. 구현 중 작은 단위로 lint/test를 실행하고 근거를 Issue에 남긴다.
5. 하루 종료 전에 PR 또는 진행 댓글로 변경 파일, 테스트, blocker, 다음 행동을 공유한다.

## 7. 주간 통합 점검

- 팀장이 `develop`의 전체 lint, unit, seed validation, build, local DB test 결과를 확인한다.
- 20 clubs/6 ETFs, 정수 자산, RLS/grants, 거래 원자성, bounded Realtime 불변식을 검토한다.
- 미병합 PR의 충돌 예상 파일과 선행 관계를 정리한다.
- staging/운영 변경, secret, 외부 공급자와 일정 미결정을 다시 확인한다.
- 다음 주 Issue는 1~2일 크기로 나누고 담당자·리뷰어를 정한다.

## 8. 공용 파일과 충돌 방지

`package.json`, `AGENTS.md`, `README.md`, `src/main.js`, `src/router/*`, `src/config/*`, `supabase/config.toml`, 기존 migrations, 공통 데이터 계약, GitHub workflows는 공용 파일이다. 팀장 승인 없이 임의 수정하지 않는다.

- 동일 공용 파일을 건드리는 Issue는 동시에 시작하지 않는다.
- DB 변경은 기존 migration 수정 대신 새 migration을 추가하고 번호 충돌을 사전 조정한다.
- UI와 Repository는 먼저 계약을 합의하고 독립 파일로 개발한다.
- 관련 없는 포맷 변경·이름 변경·파일 이동을 섞지 않는다.
- 오래 유지되는 역할 브랜치나 강제 push를 사용하지 않는다.

## 9. Codex 사용 규칙

- Issue 하나마다 별도 대화를 사용하고 역할 프롬프트를 채운다.
- 시작 시 브랜치와 dirty 파일을 확인하고 `main`이면 구현을 시작하지 않는다.
- 허용 범위 밖 수정, 다음 단계 선행 구현, 관련 없는 리팩터링을 금지한다.
- 기존 0~6단계와 migration을 보존하고 secret·운영 연결·배포를 하지 않는다.
- Codex가 실행한 테스트와 실행하지 못한 테스트를 구분해 보고하게 한다.
- commit, push, merge는 사용자에게 그 정확한 행동을 승인받은 경우에만 실행한다.

## 10. 완료와 남은 작업

완료된 0~6단계는 재구현 대상이 아니다. 남은 7~12단계는 `docs/TASK_BOARD.md`의 작은 Issue로 진행하며, 첫 스프린트는 분석·계약·현재 회귀 검증과 frontend CI까지만 수행한다.
