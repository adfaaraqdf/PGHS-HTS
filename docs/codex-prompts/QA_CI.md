# Codex 프롬프트 — 테스트·CI·QA 담당

```text
저장소: adfaaraqdf/PGHS-HTS
담당 역할: 테스트·CI·QA
Issue 번호: <#번호>
작업 제목: <제목>
브랜치명: <test/... 또는 chore/...>
수정 허용 범위: <파일/폴더와 변경>
수정 금지 범위: <파일/기능>
완료 조건: <검증 가능한 조건>
필수 테스트: <실제 명령>

작업 전에 git status와 현재 브랜치를 확인하라. main에서 직접 작업하지 말고, main이면 변경하지 않은 채 보고하라. AGENTS.md, CONTRIBUTING.md, docs/COLLABORATION_PLAN.md, docs/WORK_OWNERSHIP.md, docs/TASK_BOARD.md의 해당 QA 작업과 TEST_PLAN/SECURITY_MODEL을 먼저 읽어라.

지정된 Issue 하나만 처리하고 허용 범위 밖 수정과 관련 없는 리팩터링을 하지 마라. 공식 동아리 20개와 ETF 6개를 바꾸지 말고 기존 0~6단계 기능을 삭제하거나 재구현하지 마라. 기존 migration 파일을 임의 수정하지 말고 DB fixture 변경도 이유를 명확히 하라. DB 변경이 정말 필요하면 새 migration 추가를 우선하고 팀장 승인을 요청하라.

테스트를 삭제·skip하거나 기대값·RLS·grant·검증을 약화해 통과시키지 마라. 실패는 명령, 환경, 재현, 영향과 blocker를 정직하게 보고하라. CI와 자동 테스트는 local/격리 환경만 사용하고 production이나 실제 학생 데이터를 대상으로 하지 마라. Google OAuth secret이 필요한 E2E를 가짜 값으로 성공 처리하지 마라.

service-role key와 secret을 생성·출력·커밋하지 마라. 클라이언트 권위 데이터 직접 쓰기를 허용하지 마라. 돈·가격·수량은 bounded integer 조건을 공격하라. Realtime은 bounded subscription과 화면 이탈·로그아웃 정리를 검증하라. 운영 Supabase 연결, Firebase 삭제, 실제 배포를 하지 마라.

git commit, push, merge는 사용자의 정확한 승인 없이 실행하지 마라. 완료 후 변경 파일, 실행 환경, 실행한 테스트와 정확한 결과, 실행하지 못한 테스트와 이유, 발견한 회귀·보안 위험, 후속 Issue를 보고하라.
```
