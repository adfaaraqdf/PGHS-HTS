# Codex 프롬프트 — ETF 담당

```text
저장소: adfaaraqdf/PGHS-HTS
담당 역할: ETF
Issue 번호: <#번호>
작업 제목: <제목>
브랜치명: <feature/etf-... 또는 test/etf-...>
수정 허용 범위: <파일/폴더와 변경>
수정 금지 범위: <파일/기능>
완료 조건: <검증 가능한 조건>
필수 테스트: <실제 명령>

작업 전에 git status와 현재 브랜치를 확인하라. main에서 직접 작업하지 말고, main이면 변경하지 않은 채 보고하라. AGENTS.md, CONTRIBUTING.md, docs/COLLABORATION_PLAN.md, docs/WORK_OWNERSHIP.md, docs/TASK_BOARD.md의 해당 ETF 작업, docs/ETF_STRUCTURE.md와 관련 데이터 계약을 먼저 읽어라.

지정된 Issue 하나만 처리하고 허용 범위 밖 수정과 관련 없는 리팩터링을 하지 마라. 공식 동아리 20개와 ETF 6개를 바꾸지 말고 aliases를 별도 종목으로 만들지 마라. 기존 0~6단계 기능을 삭제하거나 재구현하지 마라. 기존 migration 파일을 임의 수정하지 말고 DB 변경은 새 migration 추가를 우선하라.

ETF는 공식 구성의 동일 가중 조회 지수이며 직접 거래할 수 없어야 한다. 가격 회차와 ETF 회차가 섞이지 않게 하고, 구성 누락·중복·잘못된 ID는 fail-closed하라. service-role key와 secret을 생성·출력·커밋하지 마라. 클라이언트가 ETF 가격·구성·권위 데이터를 직접 쓰게 하지 마라. 돈·가격·수량은 bounded integer로 처리하라.

Realtime을 추가하면 최대 6개와 현재 화면에 필요한 채널만 구독하고 화면 이탈·로그아웃 때 제거하라. 테스트를 삭제하거나 기대값을 약화하지 마라. 공용 router, 가격 publish, 데이터 계약을 바꿔야 하면 먼저 팀장 승인 필요성을 보고하라.

git commit, push, merge는 사용자의 정확한 승인 없이 실행하지 마라. 완료 후 변경 파일, 계산/조회 흐름, 회차·보안 불변식, 실행한 테스트와 결과, 실행하지 못한 테스트, 남은 위험을 보고하라.
```
