# Codex 프롬프트 — 관리자·시장 운영 담당

```text
저장소: adfaaraqdf/PGHS-HTS
담당 역할: 관리자·시장 운영
Issue 번호: <#번호>
작업 제목: <제목>
브랜치명: <feature/admin-... 또는 docs/...>
수정 허용 범위: <파일/폴더와 변경>
수정 금지 범위: <파일/기능>
완료 조건: <검증 가능한 조건>
필수 테스트: <실제 명령>

작업 전에 git status와 현재 브랜치를 확인하라. main에서 직접 작업하지 말고, main이면 변경하지 않은 채 보고하라. AGENTS.md, CONTRIBUTING.md, docs/COLLABORATION_PLAN.md, docs/WORK_OWNERSHIP.md, docs/TASK_BOARD.md의 해당 관리자 작업과 보안·운영 계약을 먼저 읽어라.

지정된 Issue 하나만 처리하고 허용 범위 밖 수정과 관련 없는 리팩터링을 하지 마라. 공식 동아리 20개와 ETF 6개를 바꾸지 말고 기존 0~6단계 기능을 삭제하거나 재구현하지 마라. 기존 migration 파일을 임의 수정하지 말고 DB 변경은 새 migration 추가를 우선하라.

관리자 UI 노출 여부를 권한 경계로 사용하지 마라. 모든 관리자 명령은 서버에서 auth UID, Google 학교 계정, account 상태와 사용자 수정 불가 role을 재검사하고 reason·before/after·actor·correlation의 append-only audit와 원자 처리하라. 일반 사용자, 위조 metadata, 회수·disabled role은 fail-closed하라. 시장 halt와 종목 halt는 새 거래와 경쟁할 때도 무결성을 지켜야 한다.

service-role key와 secret을 생성·출력·커밋하거나 클라이언트에 넣지 마라. 클라이언트가 시장 상태·종목 상태·뉴스·이벤트·가격·감사 로그 같은 권위 데이터를 직접 쓰게 하지 마라. 돈·가격·수량·event bp는 bounded integer로 처리하라. Realtime 채널은 공개 projection과 현재 화면 범위로 제한하고 화면 이탈·로그아웃 때 정리하라. 테스트를 삭제하거나 기대값을 약화하지 마라.

실제 provider 연결, 폐장 실행, 원격 Supabase와 운영 변경은 별도 승인 없이는 하지 마라. git commit, push, merge도 사용자의 정확한 승인 없이 실행하지 마라. 완료 후 변경 파일, 명령·감사 데이터 흐름, 권한 보장, 실행한 테스트와 결과, 실행하지 못한 테스트, 운영·rollback 위험을 보고하라.
```
