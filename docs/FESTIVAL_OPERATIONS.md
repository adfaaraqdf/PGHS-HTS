# 축제 현장 운영 Runbook

## 1. 목적과 운영 원칙

이 문서는 실제 날짜·담당자·연락처를 받기 전의 실행 기준이다. `FESTIVAL_DATE`, `MARKET_OPEN_AT`, `MARKET_CLOSE_AT`, `FESTIVAL_TIMEZONE`, 관리자·비상 연락은 placeholder이며 개장 전 반드시 채운다.

- 학생 자산 무결성이 화면 가용성보다 우선한다. 의심되면 먼저 시장을 halt한다.
- 클라이언트 화면이나 학생 제보만으로 자산을 직접 수정하지 않는다. 서버 원장·request·audit로 확인한다.
- 시장 reset, force seed, 자산 repair, 개장·폐장 finalization은 2인 확인과 감사 기록이 필요하다.
- 관리자 계정을 공유하지 않고 개인 계정·최소 권한·재인증을 사용한다.
- 장애 중에도 원인·조치·시각·승인자·영향 사용자/종목·검증 결과를 incident log에 남긴다.

## 2. 역할

| 역할 | 주요 책임 | 겸임 제한 |
| --- | --- | --- |
| Incident Commander(IC) | 심각도, halt/resume, 학생 공지, 종료 결정 | 고위험 수리 단독 승인 금지 |
| Firebase Operator | 대시보드, Functions/Firestore/Auth/App Check, rollback·export | 시장 이벤트 내용 단독 결정 금지 |
| Market Operator | 개폐장, 종목 halt, 뉴스·이벤트, finalization | 자신의 작업을 단독 최종 승인 금지 |
| Integrity Reviewer | 거래/잔액/보유/가격/랭킹 reconciliation, repair 검토 | repair 실행자와 분리 권장 |
| Student Support/Comms | 현장 문의, 상태 공지, 재현 정보 수집 | UID/token/전체 이메일 수집 금지 |
| Rating Liaison | 외부 별점 공급자 상태·대조 | 가격·자산 직접 수정 금지 |

각 역할의 실명, 학교 연락처, 대리자, 교대 시간을 운영 sheet에 적고 공개 문서에는 비밀·개인 연락처를 넣지 않는다. 최소 IC·Firebase Operator·Market Operator 3명이 개장부터 finalized 확인까지 현장에 있어야 한다.

## 3. 운영 상태와 제어

`market/state.status` enum은 `open`, `halted`, `closed`만 사용한다. 개장 전은 `status=closed`이면서 `openedAt=null`, 개장 중은 `open`, 장애 정지는 `halted`, cutoff 이후는 `closed`다. 종목 상태는 별도의 `tradingStatus=open|halted|closed`를 따른다.

폐장 계산 진행 상태는 market status에 새 enum을 추가하지 않고 서버 소유 `closureRuns/{closureId}`로 분리한다. 계약된 흐름은 `pending → running → ready → finalized`이며 11단계에서 구현한다. `finalized`는 checksum이 확인된 immutable 최종 결과를 뜻하며 market status 값이 아니다.

상태 변경은 서버 시각, actor, reason, 이전/새 상태, correlation ID를 감사 로그에 기록한다. 클라이언트 시계나 UI 버튼 상태는 거래 허용 근거가 아니다.

## 4. 준비 일정

### T-14~7일

- U-001~U-019 운영 필수 결정을 닫고 개인정보 안내·시상·별점 제출 경로를 학교가 승인한다.
- production project/region/billing/domain/Auth/App Check/IAM/예산 경보를 검증한다.
- 정본 clubs 22/ETFs 6, 실제 선택 콘텐츠, 별점 adapter를 staging에서 검증한다.
- 예상 peak 1.5배 부하, hotspot, 보안, 비용, 폐장·rollback·App Check 오차단 훈련을 마친다.
- 관리자 개인 계정과 역할을 발급하고 예비 관리자의 claim 회수·재발급을 시험한다.

### T-3~1일

- 기능 동결 후 승인 release ID, build/Rules/Functions/config/catalog hash를 기록한다.
- production을 `status=closed`, `openedAt=null`로 배포해 smoke, managed export·격리 복원 확인을 마친다.
- 실제 학교 계정 2개와 외부 계정 1개로 허용/거부, 최초 자금 1회, 로그아웃을 확인한다.
- 대시보드·경보·incident log·공지 채널·현장 네트워크/충전/예비 기기를 확인한다.
- rating outage, 전체 halt/resume, 잘못된 이벤트 취소, closure failure를 tabletop으로 재연한다.

### T-60분

- 전원 출석·역할·연락망·승인자 2인을 확인한다.
- 현재 project/release/config/timezone/open/close를 소리 내어 교차 확인한다.
- market `status=closed`, `openedAt=null`, 모든 club 활성/예정 상태, admin event 목록과 기간, scheduler·index·backup 상태를 확인한다.
- Functions error/latency, Firestore usage, price/ranking age, Auth, App Check baseline을 10분 관찰한다.
- 실제 거래가 없음을 확인한 뒤에만 필요 시 마지막 초기화를 수행한다. 첫 실제 거래 후 reset은 금지한다.

### T-15분

- 학생 로그인·홈/시장/상세/ETF/자산/랭킹을 실제 모바일 2종에서 확인한다.
- 허용 도메인·App Check·공지 문구·지원 QR/채널을 확인한다.
- 개장 승인자 2인이 `openAt`, market config, rating freshness, 가격/랭킹 last update를 서명한다.

## 5. 개장 절차

1. IC가 '개장 준비'를 선언하고 Firebase Operator가 오류율·quota·비용·scheduler 정상 상태를 보고한다.
2. Integrity Reviewer가 사용자 초기화 fixture와 가격·ETF·랭킹 초기 스냅샷을 확인한다.
3. Market Operator가 관리자 Function에 reason과 승인자 정보를 넣어 `open`을 요청한다.
4. 두 번째 승인자가 대상 project·서버 시각·이전 상태를 확인한다.
5. 1건의 승인된 현장 smoke 거래를 수행하고 request/trade/history/user/holding/demand reconciliation 후 학생 공지를 연다. 실제 시상 데이터에 영향을 주면 개장 전 격리 fixture로만 수행한다.
6. 개장 시각·release/config hash·담당자를 incident/operations log에 남긴다.

## 6. 정상 운영 감시

Firebase Operator는 대시보드를 상시 보고 15분마다 운영 log에 snapshot을 남긴다. IC에게 다음을 보고한다.

- Auth 성공/거부 추세, callable expected/unexpected error와 p50/p95/p99
- transaction contention/abort, 인기 club 요청 집중, demand shard 편향
- `clubs.priceCalculatedAt`, `etfs.sourcePriceAsOf`, ranking `updatedAt` age와 scheduler 성공
- Firestore read/write, Functions invocation/instance, Hosting/egress, quota·예산 추세
- App Check valid/invalid/unknown 비율
- rating last source time, ingest/reconcile 실패, active admin events
- market/club status, 공지, 미해결 학생 문의 수

현장 지원은 학생에게 닉네임, 발생 시각, 화면, 안전한 오류 코드, 요청 성공/실패 여부만 요청한다. 비밀번호, ID token, 전체 이메일 screenshot, 서비스 계정 키를 요구하지 않는다.

## 7. 심각도와 공통 대응

| 등급 | 예 | 목표 대응 |
| --- | --- | --- |
| P0 | 음수·중복 자산, unauthorized admin, private PII 노출, 원장 불일치, finalized 변조 | 즉시 전체 halt, IC 호출, 증거 보존; 거래 재개는 reconciliation·2인 승인 후 |
| P1 | 거래 예상 밖 오류 ≥2%, 가격 age >120초, quota 임박, 다수 로그인 차단, 폐장 실패 | 5분 내 전체/종목 halt 또는 기능 격리, 15분 내 상태 공지 |
| P2 | 랭킹 >120초, 별점 stale, 일부 뉴스/ETF/UI 오류, 단일 기기 문제 | stale/read-only 안내, 핵심 거래 영향 관찰, 다음 점검 때 수정 |
| P3 | 문구·정렬·경미한 시각 문제 | 기록 후 기능 동결 정책에 따라 행사 후 처리 |

공통 절차: `탐지 → 시각/영향 기록 → 분류 → halt/격리 → 증거 보존 → 원인 가설 → dry-run 복구 → 2인 검증 → 제한 재개 → 학생 공지 → 사후 분석`.

## 8. 장애별 Runbook

### 8.1 자산·거래 무결성 이상

1. 전체 market halt. 문제 Function과 scheduler를 임의 재시작하지 않는다.
2. UID 자체를 공개 log에 복사하지 말고 제한된 incident reference로 연결한다.
3. idempotency request, global trade, user history, user/holding before-after, demand shard, audit를 correlation ID로 대조한다.
4. 클라이언트 표시 문제인지 권위 데이터 문제인지 분리한다. 캐시 문제면 authoritative refresh로 재확인한다.
5. repair는 전용 도구의 dry-run diff, 백업, Integrity Reviewer+IC 승인 후 실행하고 repair audit를 append한다.
6. 전체 affected window reconciliation과 공격 재현 테스트가 통과해야 재개한다. 현금만 콘솔에서 고치지 않는다.

### 8.2 인기 종목 경합·거래 지연

1. club별 abort/latency와 10개 shard 분포, 단일 user hotspot을 확인한다.
2. 한 종목에만 실패가 집중되면 해당 club halt, 전역 user 문서/Function 병목이면 전체 halt한다.
3. 재시도 폭주를 막기 위해 UI cooldown·안내를 사용한다. shard 수를 행사 중 즉흥 변경하지 않는다.
4. backlog가 가라앉은 뒤 동일키 재호출 안전성과 reconciliation을 확인하고 제한적으로 resume한다.

### 8.3 가격 갱신 지연·오류

1. age >90초 경고, >120초면 stale 표시와 새 거래 전체 halt를 원칙으로 한다.
2. scheduler delivery, tick lease/window, rating/demand/event 입력, config version을 확인한다.
3. 중복 tick을 새 tick으로 강제하지 말고 같은 ID의 멱등 재실행을 사용한다.
4. 마지막 정상 가격을 임의 수정하지 않는다. 정상 tick과 ETF/랭킹 후속 갱신을 확인한 뒤 resume한다.

### 8.4 랭킹 지연

마지막 TOP10을 갱신시각·stale 문구와 함께 유지하고 거래는 자산 무결성이 정상이라면 계속할 수 있다. 시상 직전이면 finalized를 금지하고 전체 재계산·competition rank·checksum을 확인한다. 화면 요청으로 전체 사용자를 즉석 scan하지 않는다.

### 8.5 별점 공급자 장애

adapter를 disable하고 last source time을 표시한다. 10분부터 최근 기여를 감쇠하고 30분에는 최근 기여 0인 개발 기본 정책을 적용한다. 가짜 점수나 수동 가격 보정을 넣지 않는다. 복구 후 idempotent reconciliation으로 누락·중복을 대조한다.

### 8.6 로그인 장애·도메인 오설정

Auth provider 상태, authorized domain, exact allowed domain, token clock, App Check를 분리 진단한다. 기존 세션과 신규 로그인을 구분한다. allowed domain을 넓혀 개인 계정을 임시 허용하지 않는다. 학교가 확인한 설정만 2인 승인으로 수정한다.

### 8.7 App Check 오차단

valid 사용자 실패와 공격 traffic을 지표로 구분한다. 광범위한 합법 차단이면 IC+Firebase Operator 승인으로 해당 서비스 enforcement를 잠시 monitor로 바꾸고 market halt 또는 제한 운영한다. 원인 수정·staging smoke 뒤 다시 enforce한다.

### 8.8 quota·비용 급증

화면별 listener/read, 무제한 query, retry loop, scheduler 중복, 로그 폭증을 찾는다. 불필요 listener/뉴스를 끄고 read-only snapshot으로 축소한다. 예산 경보는 서비스 중단 장치가 아니므로 billing을 갑자기 끄지 않는다. 무결성 위험이면 전체 halt한다.

### 8.9 관리자 계정 의심

즉시 해당 claim·세션을 회수하고 market halt, 최근 adminEvents/news/market/config/audit를 검토한다. 감사 로그를 삭제하지 않고 잘못된 이벤트는 취소 기록으로 무효화한다. 새 개인 계정에 최소 역할을 발급한 뒤 2인 검증한다.

## 9. 시장·종목 정지와 재개 기준

전체 halt 조건: 자산/원장 의심, 서버 가격 stale >120초, 광범위 Auth/App Check/거래 오류, Firestore quota 위험, unauthorized admin, 폐장 상태 불명. 종목 halt 조건: 특정 club 데이터·경합·이벤트 오류가 격리 가능하고 사용자 자산 전역 불변식이 정상.

재개 전에 다음을 모두 확인한다.

- 원인이 설명되고 재현/수정 또는 안전한 완화가 있다.
- affected window 거래 reconciliation과 가격/랭킹 age가 정상이다.
- 테스트 거래 또는 비파괴 smoke가 성공한다.
- 대시보드가 최소 5분 안정적이고 IC·Firebase Operator·Integrity Reviewer가 승인한다.
- 중단·영향·재개 시각과 학생 안내가 기록됐다.

## 10. 폐장 절차

구체 시각은 placeholder가 아니라 승인된 server timestamp를 사용한다.

1. T-15분과 T-5분에 거래 cutoff와 결과 갱신 지연을 공지한다.
2. 승인자 2인이 project/timezone/cutoff/rating last source/active events를 확인한다.
3. Market Operator가 market `status=closed` 전환과 closure workflow `running` 시작을 하나의 서버 작업으로 요청한다. 이 cutoff 이후 시작된 새 거래는 서버에서 거부한다.
4. in-flight transaction이 성공/실패로 확정됐는지 request와 원장을 reconciliation한다.
5. rating input window를 seal하고 마지막 결정론적 가격 tick, 6 ETF 갱신을 실행한다.
6. 모든 사용자의 현금+보유×최종가격을 서버에서 전체 재계산하고 competition rank를 만든다.
7. TOP10 최대 10명, 본인 rank, config/catalog/release hash, cutoff, checksum을 final snapshot에 기록한다.
8. Integrity Reviewer가 market `status=closed`, counts·합계·동점·PII 부재·checksum을 확인하고 두 번째 승인으로 closure workflow를 `finalized`한다.
9. finalized 결과를 read-only로 공개한다. U-009가 달리 승인되지 않는 한 보유 주식을 강제 청산하지 않는다.
10. scheduler와 min instances의 행사 전용 설정을 정상 비용 모드로 돌리고 export·로그 보존을 확인한다.

중간 실패 시 market은 `closed` 또는 `halted`, closure workflow는 `running`에 두고 단계 ID로 재실행한다. 부분 결과를 시상하지 않는다. finalized 후 정정은 snapshot 덮어쓰기가 아니라 immutable correction record와 학교 승인으로 처리한다.

## 11. 공지 템플릿

- 거래 정지: `현재 거래를 잠시 중단하고 확인 중입니다. 자산 데이터는 서버 기록을 기준으로 보호되며, 재개 시각을 다시 안내하겠습니다.`
- 조회 지연: `가격/랭킹 갱신이 지연되고 있습니다. 화면의 갱신 시각을 확인해 주세요. 확정 전 결과는 시상에 사용하지 않습니다.`
- 재개: `검증이 완료되어 [SERVER_TIME]부터 거래를 재개합니다. 중단 구간의 요청은 거래 내역에서 성공 여부를 확인해 주세요.`
- 폐장: `거래가 종료되었습니다. 최종 가격과 전체 순위를 검증한 뒤 확정 결과를 공개합니다.`

기술 내부정보, UID, 이메일, 공격 세부사항은 공개 공지에 넣지 않는다.

## 12. 비용·보안·개인정보 폐장 후 작업

### T+1시간

- finalized/export/alert 상태와 unresolved incident를 확인하고 admin event·시장 쓰기를 잠근다.
- 행사 시간에만 올린 min instances를 0으로, App Check·Rules는 안전한 운영 상태로 유지한다.
- 실제 관리자 중 더 이상 필요 없는 claim과 임시 시험 계정을 회수한다.

### T+1일

- 거래·가격·랭킹·감사 reconciliation 보고서와 실제 operation count·비용 추정 오차를 작성한다.
- P0/P1은 원인, timeline, 영향, 탐지, 복구, 재발 방지를 포함한 blameless review를 한다.
- 학생 문의와 이의 제기를 승인된 마감·증거 기준으로 처리한다.

### 보존 기간 도래

- 학교가 승인한 정책에 따라 private profile, 시험 계정, 로그, export를 삭제하고 deletion evidence를 남긴다.
- 비식별 통계만 별도 승인 후 유지한다. 이름·이메일·UID가 포함된 자료를 개인 기기나 공유 문서로 반출하지 않는다.

## 13. 운영 기록 양식

각 작업은 `서버 시각 / 환경·project / release·config hash / actor / 승인자 / 상태·대상 / reason / correlation ID / 전후 값 / 검증 / rollback 조건 / 학생 공지`를 기록한다. secret·token·전체 private user 문서는 기록하지 않는다.
