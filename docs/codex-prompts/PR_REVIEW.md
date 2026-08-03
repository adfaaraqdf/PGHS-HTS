# Codex 프롬프트 — Pull Request 리뷰

아래 프롬프트는 코드를 수정하지 않는 리뷰 전용이다. 각 지적은 재현 가능한 근거와 가장 작은 관련 줄을 포함한다.

```text
저장소: adfaaraqdf/PGHS-HTS
리뷰 대상 PR: <#번호 또는 URL>
관련 Issue: <#번호>
담당 역할: <역할>
예상 브랜치: <브랜치명>
허용 범위: <Issue의 허용 범위>
금지 범위: <Issue의 금지 범위>
완료 조건: <Issue의 완료 조건>

먼저 git status와 현재 브랜치를 확인하고 main에서 수정하지 마라. AGENTS.md, CONTRIBUTING.md, docs/COLLABORATION_PLAN.md, docs/WORK_OWNERSHIP.md, docs/TASK_BOARD.md의 해당 작업을 읽은 뒤 base와 PR diff를 검토하라. 리뷰 중 코드 변경, commit, push, merge는 하지 마라.

공식 동아리 20개와 ETF 6개가 유지되는지, 기존 0~6단계가 삭제·재구현되지 않는지, 기존 migration이 임의 수정되지 않았는지 확인하라. 새 DB 변경은 migration, RLS, grants, SECURITY DEFINER search_path와 최소 EXECUTE 권한을 함께 검토하라. service-role key나 secret, 클라이언트 권위 데이터 직접 쓰기, 비정수 돈·가격·수량을 찾으라. Realtime이 bounded이고 이탈·로그아웃 때 정리되는지 확인하라. 테스트가 삭제·skip·약화되지 않았는지 확인하라.

다음 항목을 반드시 검토하라.
- Issue 범위 위반과 다른 담당 영역 침범
- 데이터 계약 불일치와 공용 파일 무승인 변경
- 비밀키와 민감 로그
- RLS 우회와 과도한 grants/EXECUTE
- 현금·보유·거래·가격·집계·랭킹·시장 권위 데이터 직접 쓰기
- 거래 idempotency·원자성·동시성·음수 방지
- UID·이메일·실명·내부 식별자 등 개인정보 노출
- Realtime 구독 누수와 무제한 query
- 테스트·경계·실패 경로 누락
- 관련 없는 리팩터링과 기존 기능 회귀

발견 사항을 중요도순으로만 보고하라.
- BLOCKER: 보안·자산 무결성·운영 데이터 파괴, merge 즉시 차단
- HIGH: 핵심 기능 실패·권한 우회·큰 회귀, merge 전 필수 수정
- MEDIUM: 특정 경계/오류/성능/접근성 결함, 원칙적으로 merge 전 수정 또는 승인된 후속 Issue
- LOW: 작은 유지보수·문서·표시 개선

각 항목 형식: `[등급] 제목` → 파일과 줄 → 근거/재현 → 영향 → 최소 수정 방향. 사실상 문제가 아닌 스타일 선호는 지적하지 마라. 발견 사항 뒤에는 질문·가정, 테스트 공백, 전체 판단을 짧게 적어라. 문제가 없으면 "발견 사항 없음"이라고 쓰되 남은 테스트 위험은 별도로 보고하라.
```
