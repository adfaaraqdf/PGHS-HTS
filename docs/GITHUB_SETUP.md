# GitHub 저장소 설정 안내

이 문서는 팀장이 GitHub 웹에서 직접 설정할 절차다. 현재 작업에서는 원격 설정을 변경하지 않는다. 메뉴 이름은 GitHub UI 업데이트나 저장소 요금제에 따라 조금 다를 수 있다.

## 1. 친구 4명 초대

1. 저장소의 `Settings`를 연다.
2. `Collaborators` 또는 `Collaborators and teams`를 연다.
3. `Add people`을 눌러 친구의 정확한 GitHub 아이디를 검색한다.
4. 4명 모두 초대하고 각자 수락했는지 확인한다.
5. 가능한 최소 권한인 일반 write 권한을 사용하고 관리자 권한은 팀장에게만 둔다.

## 2. develop 브랜치 생성

팀장 로컬 저장소에서 정확히 다음을 실행한다.

```bash
git checkout main
git pull origin main
git checkout -b develop
git push -u origin develop
```

GitHub `Settings` → `Branches`에서 기본 브랜치를 `develop`으로 바꾸면 새 PR의 base 실수를 줄일 수 있다. 배포 기준은 계속 `main`이다.

## 3. main·develop 보호

1. `Settings` → `Rules` → `Rulesets` → `New ruleset` 또는 `Add branch ruleset`을 연다.
2. target branch에 먼저 `main`, 다음 ruleset에 `develop`을 지정한다.
3. 두 브랜치 모두 다음을 활성화한다.
   - Pull request를 통한 변경 필수
   - 승인 리뷰 최소 1명
   - 새 commit 뒤 stale approval 무효화 권장
   - merge 전 conversation 해결 필수
   - status checks 통과 필수
   - force push 차단
   - branch deletion 차단
4. Actions가 한 번 실행된 뒤 필수 check로 `frontend`, `database`를 선택한다. database가 환경상 안정화되기 전에는 이유와 책임자를 기록한 임시 정책을 사용하고 테스트를 가짜 성공 처리하지 않는다.
5. 관리자 bypass는 최소화하고 긴급 사용 시 사유를 남긴다.

`main`은 `develop`에서 만든 release PR만 받는다. `develop`은 `feature/*`, `fix/*`, `test/*`, `chore/*` PR의 기본 대상이다.

## 4. Merge와 브랜치 삭제

1. `Settings` → `General` → `Pull Requests`에서 `Allow squash merging`을 켠다.
2. 필요하지 않은 merge 방식은 꺼 팀 규칙을 단순화한다.
3. `Automatically delete head branches`를 켜 병합된 작업 브랜치를 자동 삭제한다.
4. 보호 대상 `main`, `develop`, 진행 중 `release/*`는 삭제하지 않는다.

## 5. Issue 사용법

1. 저장소 `Issues` → `New issue`에서 Feature, Bug, QA 템플릿을 고른다.
2. `docs/TASK_BOARD.md`의 작업 하나만 옮겨 적는다.
3. 담당자, 선행 Issue, 허용·금지 범위, 완료 조건과 테스트를 확정한다.
4. 공용 파일 수정이 있으면 팀장이 댓글로 승인한다.
5. 진행 중 발견한 새 범위는 원 Issue에 억지로 넣지 않고 새 Issue로 분리한다.

## 6. Pull Request 사용법

1. 작업 브랜치를 push한 뒤 `Pull requests` → `New pull request`를 연다.
2. base `develop`, compare 작업 브랜치를 확인한다.
3. PR 템플릿을 채우고 `Closes #Issue번호`를 적는다.
4. 담당 영역과 공용 파일에 맞는 리뷰어를 지정한다.
5. 최소 1명 승인과 모든 필수 CI 통과 후 `Squash and merge`한다.
6. `develop`을 `main`에 반영할 때는 별도 release PR, 전체 테스트, 배포·롤백 검토를 사용한다.

## 7. 첫 작업 배정

1. `docs/TEAM_ASSIGNMENTS.md`에 합의한 담당자를 입력한다.
2. `docs/FIRST_SPRINT.md`의 역할별 첫 작업을 Issue로 만든다.
3. 팀장·ETF·랭킹·관리자·QA 역할에 각각 한 Issue만 먼저 배정한다.
4. 실제 기능 구현 전 각 역할의 계약 분석 또는 현재 테스트 PR을 리뷰한다.

## 8. 설정 후 확인

- 일반 팀원이 `main`과 `develop`에 직접 push할 수 없는가?
- 승인 없는 PR과 실패한 CI가 merge되지 않는가?
- force push와 보호 브랜치 삭제가 막혔는가?
- 새 PR의 기본 base가 `develop`인가?
- secret이나 운영 Supabase 자격 증명을 GitHub 변수에 불필요하게 넣지 않았는가?
