# PGHS HTS 협업 가이드

이 저장소는 `main`을 배포 가능한 안정 브랜치, `develop`을 기능 통합 브랜치로 사용한다. 작업 하나는 GitHub Issue 하나, 작업 브랜치 하나, Codex 대화 하나, Pull Request 하나로 끝낸다. `main`과 `develop`에 직접 push하지 않는다.

## 1. 처음 한 번 설치

Node.js 20 이상, Git, Docker Desktop을 설치한 뒤 저장소를 받는다.

```bash
git clone https://github.com/adfaaraqdf/PGHS-HTS.git
cd PGHS-HTS
npm ci
cp .env.example .env.local
```

`.env.local`에는 로컬 Supabase URL과 publishable key만 넣는다. service-role key, DB 비밀번호, Google OAuth secret, 관리자 자격 증명은 저장소나 브라우저 환경 변수에 넣지 않는다.

로컬 실행은 다음 순서다.

```bash
npm run supabase:start
npm run db:reset
npm run dev
```

## 2. 작업 시작

먼저 배정받은 Issue의 범위와 `AGENTS.md`, 이 문서, `docs/COLLABORATION_PLAN.md`, `docs/WORK_OWNERSHIP.md`, `docs/TASK_BOARD.md`를 읽는다. 작업 시작 전 `develop`을 최신 상태로 만든다.

```bash
git checkout develop
git pull origin develop
git status
```

Issue 하나를 위한 새 브랜치를 만든다. 역할별 장기 공동 브랜치는 만들지 않는다.

```bash
git checkout -b feature/etf-calculation
```

브랜치 접두사는 다음과 같다.

- `feature/*`: 기능
- `fix/*`: 버그 수정
- `test/*`: 테스트·QA
- `chore/*`: 문서·CI·협업 설정
- `release/*`: 배포 준비

## 3. 구현과 검증

Issue가 허용한 파일만 수정한다. 기존 migration은 고치지 않고 DB 변경은 새 migration을 추가한다. 공식 동아리 20개와 ETF 6개를 유지하며 권위 데이터는 브라우저에서 직접 쓰지 않는다.

가능한 검증을 모두 실행한다.

```bash
npm run lint
npm test
npm run seed:validate
npm run build
```

DB 변경이 있으면 Docker 기반 로컬 Supabase에서 추가 실행한다.

```bash
npm run supabase:start
npm run db:reset
npm run db:lint
npm run test:db
npm run supabase:stop
```

## 4. commit, push, Pull Request

관련 파일만 확인하고 stage한다. 비밀 파일과 관련 없는 파일을 포함하지 않는다.

```bash
git status
git diff
git add path/to/file1 path/to/file2
git diff --staged
git commit -m "feat: add equal-weight ETF calculation"
git push -u origin feature/etf-calculation
```

GitHub에서 `Pull requests` → `New pull request`를 선택한다. base는 `develop`, compare는 작업 브랜치로 지정하고 템플릿을 모두 채운다. Issue는 `Closes #번호`로 연결한다. 리뷰와 필수 CI가 통과한 뒤 승인된 방식으로 병합한다.

배포 후보는 `develop`에서 `main`으로 별도 PR을 만든다. 팀장 승인, 전체 회귀 테스트, 배포·롤백 확인 없이 병합하거나 운영 배포하지 않는다.

## 5. 충돌 처리

충돌이 나면 먼저 작업을 저장하고 최신 `develop`을 병합한다.

```bash
git status
git checkout develop
git pull origin develop
git checkout feature/etf-calculation
git merge develop
```

충돌 표시가 있는 파일을 열어 Issue 범위에 맞게 해결하고 검증한 뒤 commit한다. 데이터 계약, migration, `src/main.js`, router, config, workflow처럼 공용 파일의 충돌은 혼자 결정하지 말고 팀장과 해당 담당자에게 알린다. 해결이 불확실하면 `git reset --hard`나 강제 push를 사용하지 않는다.

## 6. 리뷰와 병합 원칙

- 리뷰어는 Issue 범위, 보안, 데이터 계약, 회귀, 테스트 결과를 확인한다.
- 작성자는 지적 사항을 같은 작업 브랜치에 추가 commit으로 반영한다.
- 최소 한 명의 승인을 받고 CI가 통과해야 한다.
- Squash and merge를 권장하며 병합 후 원격 작업 브랜치를 삭제한다.
- 운영 Supabase 연결, 원격 migration, seed, Cron, 웹 배포는 별도 명시적 승인이 있어야 한다.
