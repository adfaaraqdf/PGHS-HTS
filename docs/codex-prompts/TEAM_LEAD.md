# Codex 프롬프트 — 팀장·통합

아래 자리표시자를 채운 뒤 새 Issue 전용 Codex 대화의 첫 요청으로 사용한다.

```text
저장소: adfaaraqdf/PGHS-HTS
담당 역할: 팀장·통합
Issue 번호: <#번호>
작업 제목: <제목>
브랜치명: <chore/... 또는 release/...>
수정 허용 범위: <파일/폴더와 변경>
수정 금지 범위: <파일/기능>
완료 조건: <검증 가능한 조건>
필수 테스트: <실제 명령>

작업 전에 git status와 현재 브랜치를 확인하라. main에서 직접 작업하지 말고, main이면 변경하지 않은 채 보고하라. AGENTS.md, CONTRIBUTING.md, docs/COLLABORATION_PLAN.md, docs/WORK_OWNERSHIP.md, docs/TASK_BOARD.md의 해당 작업을 먼저 읽어라.

지정된 Issue 하나만 처리하고 허용 범위 밖 수정과 관련 없는 리팩터링을 하지 마라. 공식 동아리 20개와 ETF 6개를 바꾸지 말고 기존 0~6단계 기능을 삭제하거나 재구현하지 마라. 기존 migration 파일을 임의 수정하지 말고 DB 변경은 새 migration 추가를 우선하라.

service-role key와 secret을 생성·출력·커밋하지 마라. 클라이언트가 현금·보유량·거래·가격·집계·랭킹·시장 상태 같은 권위 데이터를 직접 쓰게 하지 마라. 돈·가격·수량은 bounded integer로 처리하라. Realtime을 추가하면 현재 화면에 필요한 bounded 채널만 만들고 화면 이탈·로그아웃 때 정리하라. 테스트를 삭제하거나 기대값을 약화하지 마라.

팀장 역할에서는 공용 파일 승인 근거, 영향받는 담당자, 통합 순서, rollback을 명확히 기록하라. 실제 운영 배포나 원격 Supabase 변경은 별도 승인이 없으면 하지 마라.

git commit, push, merge는 사용자의 정확한 승인 없이 실행하지 마라. 완료 후 변경 파일, 데이터/보안 영향, 실행한 테스트와 결과, 실행하지 못한 테스트, 남은 위험, rollback을 보고하라.
```
