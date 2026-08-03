# 첫 스프린트: 협업 적응

첫 스프린트는 1일 이내 작업만 배정한다. 제품 기능을 서둘러 구현하기보다 Issue·브랜치·Codex·PR·리뷰 흐름을 한 번 끝까지 경험하는 것이 목표다.

## 팀장·통합 담당

- 협업 문서와 감사 차이를 검토한다.
- `develop` 브랜치를 만들고 GitHub 보호 ruleset을 설정한다.
- 아래 네 역할의 첫 Issue를 등록하고 담당자와 리뷰어를 정한다.
- 첫 PR에서 템플릿, 범위, 테스트 근거를 검토한다.
- 완료: 보호 설정 화면과 Issue 링크가 팀에 공유되고 첫 PR 리뷰 기록이 남는다.

## ETF 담당

- `docs/DATA_CONTRACTS.md`, `docs/ETF_STRUCTURE.md`, 현재 `etfs` 테이블·가격 tick을 분석한다.
- ETF 계산 입력/출력, 회차 일치 조건, 누락/중복 구성 오류를 문서 제안으로 작성한다.
- 실제 Database Function과 UI는 구현하지 않는다.
- 완료: 두 번째 구현 Issue가 바로 작성 가능한 계약 분석 PR 한 개.

## 랭킹 담당

- `accounts`, `holdings`, `clubs`, `private.leaderboard_entries`, `public_leaderboard` 구조를 분석한다.
- 총자산 평가 시점, competition rank, 공개/비공개 필드와 내 순위 RPC 계약을 제안한다.
- 실제 계산 job과 UI는 구현하지 않는다.
- 완료: 개인정보 위협 점검을 포함한 계약 분석 PR 한 개.

## 관리자·시장 운영 담당

- 시장 개장·정지·재개, 종목 halt, 뉴스·이벤트의 요구와 현재 RLS를 분석한다.
- 관리자 역할 저장 위치, 재인가, 감사 로그, 고위험 확인 절차를 설계한다.
- 실제 RPC와 관리자 UI는 구현하지 않는다.
- 완료: 일반 사용자 공격 경로를 포함한 권한 설계 PR 한 개.

## 테스트·CI·QA 담당

- 현재 0~6단계의 `lint`, unit, seed validation, build와 가능한 local DB 테스트를 실행한다.
- 실패 항목은 명령, 환경, 로그 요약, 재현 절차, 영향으로 기록한다.
- `.github/workflows/ci.yml`의 frontend job을 검토하고 첫 CI 실행 결과를 보고한다.
- 완료: 테스트를 약화하지 않은 회귀 보고와 frontend CI 결과 PR 한 개.

## 첫날 종료 점검

- 모든 작업이 서로 다른 Issue·브랜치·Codex 대화·PR을 사용했는가?
- 공용 파일 변경은 사전 승인됐는가?
- 실행하지 못한 테스트를 통과로 표시하지 않았는가?
- 다음 구현 Issue가 1~2일 크기와 명확한 완료 조건을 갖는가?
