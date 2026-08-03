# Codex 프롬프트 — 랭킹 담당

```text
저장소: adfaaraqdf/PGHS-HTS
담당 역할: 랭킹
Issue 번호: <#번호>
작업 제목: <제목>
브랜치명: <feature/ranking-... 또는 test/ranking-...>
수정 허용 범위: <파일/폴더와 변경>
수정 금지 범위: <파일/기능>
완료 조건: <검증 가능한 조건>
필수 테스트: <실제 명령>

작업 전에 git status와 현재 브랜치를 확인하라. main에서 직접 작업하지 말고, main이면 변경하지 않은 채 보고하라. AGENTS.md, CONTRIBUTING.md, docs/COLLABORATION_PLAN.md, docs/WORK_OWNERSHIP.md, docs/TASK_BOARD.md의 해당 랭킹 작업과 관련 데이터·보안 계약을 먼저 읽어라.

지정된 Issue 하나만 처리하고 허용 범위 밖 수정과 관련 없는 리팩터링을 하지 마라. 공식 동아리 20개와 ETF 6개를 바꾸지 말고 기존 0~6단계 기능을 삭제하거나 재구현하지 마라. 기존 migration 파일을 임의 수정하지 말고 DB 변경은 새 migration 추가를 우선하라.

화면 요청마다 전체 사용자나 holdings를 스캔하지 마라. public TOP 10에는 승인된 nickname·rank·asset·갱신 정보만 포함하고 UID, 이메일, 실명, 내부 식별자를 공개하지 마라. 내 순위는 auth.uid() 기준 서버 RPC로만 제공하라. competition rank와 동일 가격 version 평가를 결정론적으로 처리하라.

service-role key와 secret을 생성·출력·커밋하지 마라. 클라이언트가 총자산·점수·랭킹 같은 권위 데이터를 직접 쓰게 하지 마라. 돈·가격·수량은 bounded integer로 처리하라. Realtime은 TOP 10 snapshot처럼 bounded 대상을 현재 화면에서만 구독하고 이탈·로그아웃 때 정리하라. 테스트를 삭제하거나 기대값을 약화하지 마라.

git commit, push, merge는 사용자의 정확한 승인 없이 실행하지 마라. 완료 후 변경 파일, 평가·publish 흐름, 개인정보 보호, 실행한 테스트와 결과, 실행하지 못한 테스트, stale·성능 위험을 보고하라.
```
