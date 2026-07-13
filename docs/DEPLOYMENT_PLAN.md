# 배포 계획

## 1. 범위와 승인 경계

이 문서는 배포 준비·순서·검증·롤백 기준이다. 0단계에서는 어떤 Firebase 리소스도 만들거나 배포하지 않는다. Git push와 staging/production 배포는 사용자의 명시적 지시와 해당 환경 책임자의 승인이 있어야 한다. 자동 테스트와 seed는 production을 기본 대상으로 삼지 않는다.

## 2. 환경 분리

| 환경 | 목적 | 데이터 | 배포 권한 |
| --- | --- | --- | --- |
| local | 빠른 개발 | Firebase Emulator, 고정 fixture | 개발자 |
| development | 통합 확인 | 가짜 학교 계정·비식별 데이터 | 개발 배포자 |
| staging | 실제 Auth/App Check/index/scheduler·부하·리허설 | 전용 시험 계정, 운영과 동일한 정본 seed | 제한된 release 담당자 |
| production | 축제 실서비스 | 실제 허용 학교 계정 | production release 담당자, 2인 확인 |

각 환경은 별도 Firebase/GCP 프로젝트를 권장한다. `.firebaserc` alias와 CI environment protection으로 대상을 고정하고, 명령 전에 project ID·account·region을 출력한다. Firestore 위치는 변경이 어렵기 때문에 생성 전에 확정하며 Functions는 가능한 한 같은 권역에 둔다.

## 3. 운영 전 필수 입력

다음이 하나라도 placeholder면 production No-Go다.

- 개발·staging·production project ID, 결제 계정, Firestore 위치, Functions region
- `ALLOWED_SCHOOL_DOMAIN=pangyo.hs.kr`, 실제 Auth authorized domain, Hosting domain
- 관리자 이메일·역할·claim 발급/회수 담당자, 비상 연락망
- `FESTIVAL_TIMEZONE`, 축제 날짜, 개장·폐장 시각
- App Check 공급자·site key·enforcement 계획
- 별점 API 계약·endpoint·인증 secret·ID mapping 또는 연동 비활성 운영 승인
- 예상 동시 사용자·거래량, 승인 비용 예산, 50/80/100% 경보 수신자
- 개인정보·거래·감사·백업 보존 기간, 폐장·시상 규칙
- 로고/이미지/부스 정보는 선택 입력이며 없으면 `null`로 유지한다.

## 4. 설정과 비밀 관리

| 종류 | 예 | 저장 위치 |
| --- | --- | --- |
| 공개 client config | Firebase Web apiKey/projectId/authDomain, App Check public site key | 환경별 빌드 변수; secret으로 오해하지 않되 환경 혼선 검사 |
| 서버 일반 설정 | school domain, timezone, market config version, feature flags | Functions validated params/환경 설정 |
| 서버 secret | rating provider token/webhook secret | Secret Manager; 저장소·client bundle·로그 금지 |
| 권한 | admin custom claims, deploy IAM | 승인 도구·IAM; `.env` 목록 금지 |

`.env.example`에는 이름과 placeholder만 둔다. CI log에서 secret을 mask하고 service-account JSON을 다운로드·커밋하지 않는다. Workload Identity 또는 플랫폼이 제공하는 단기 자격증명을 우선한다.

## 5. IAM과 변경 통제

- build, staging deploy, production deploy, admin-claim, incident response 역할을 분리하고 공유 계정을 금지한다.
- production deploy·market reset·force seed·자산 repair·finalize는 최소 2인이 대상과 변경 내용을 확인한다.
- release artifact는 source revision, lockfile hash, build hash, Rules/index/config version, seed catalog hash를 기록한다.
- production 변경 창에는 기능 동결을 적용하고 긴급 수정도 동일 테스트·승인·rollback artifact를 요구한다.

## 6. 사전 검증

1. clean checkout에서 lockfile 기반 install, lint, unit, Rules/Emulator/integration/E2E, production build를 실행한다.
2. 20 clubs/6 ETFs/구성 합계 20/공통 초기값/alias를 검증한다.
3. secret·dependency·license·번들 environment scan을 통과한다.
4. staging에서 실제 Auth redirect, 허용/거부 도메인, App Check monitor, indexes ready, scheduler 60초/최대 120초, 거래·halt·폐장 smoke를 확인한다.
5. `TEST_PLAN.md` 부하·reconciliation·비용·복구 gate와 `FESTIVAL_OPERATIONS.md` tabletop/리허설을 통과한다.
6. 알려진 위험, 예상 operation count·비용, 담당자·rollback release를 Go/No-Go 회의에서 승인한다.

## 7. 최초 배포 순서

환경별로 같은 절차를 development → staging → production 순으로 승격하며 production 단계마다 명시 확인한다.

1. 대상 project/계정/region/billing/API를 read-only preflight하고 잘못된 대상이면 중단한다.
2. Secret Manager와 validated server params를 설정하되 값을 출력하지 않는다. market은 `status=closed`, `openedAt=null`로 두어 거래를 막는다.
3. additive Firestore indexes를 배포하고 모두 `READY`가 될 때까지 기다린다.
4. deny-by-default Rules를 배포하고 deployed Rules smoke를 실행한다.
5. Cloud Functions를 배포한다. scheduler는 중복 전달에 멱등이고 개장 전 `status=closed`에서는 위험한 시장 쓰기를 하지 않아야 한다.
6. 공식 seed `--dry-run` 결과가 create 20 clubs/6 ETFs/market config·state와 일치하는지 검토한다. production은 별도 확인 뒤 non-force 실행하고 재실행이 전부 skip인지 확인한다.
7. Hosting preview/channel에 build artifact를 배포해 모바일·Auth·callable·read smoke를 수행한다.
8. App Check를 monitor 상태로 관찰하고 합법 traffic이 정상임을 확인한 뒤 개장 전에 enforcement를 승인한다.
9. 같은 artifact를 production Hosting에 승격한다. cache/version 혼선을 검사하고 smoke 계정으로 로그인→조회→관리자 halt 상태를 확인한다.
10. 시장은 자동으로 열지 않는다. 현장 개장 runbook과 2인 확인으로만 `open`으로 전환한다.

기존 release가 있는 호환 배포는 `index → 하위 호환 Rules/Functions → seed/config migration → Hosting → 구 Rules 제거`의 expand/contract 방식을 쓴다.

## 8. 배포 직후 Smoke

- release/version/config/catalog hash가 승인본과 같다.
- 허용 계정 로그인과 외부 도메인 거부, 최초 자금 1회가 맞다.
- clubs 20, ETFs 6, TOP/news bounded query가 성공하고 PII가 없다.
- market `status=closed`에서 거래는 `market-closed`, 격리된 open test window의 승인 fixture 거래는 원장과 일치해야 한다. production 실제 개장 직전에는 파괴 smoke를 하지 않는다.
- `clubs.priceCalculatedAt`, `etfs.sourcePriceAsOf`, 공개 랭킹 `updatedAt` age와 scheduler/function error, Rules deny, App Check rejection, read/write rate, 예산 지표가 대시보드에 보인다.
- 관리자 halt/resume, 감사 로그, emergency claim 회수가 리허설대로 동작한다.

## 9. 관측·경보

임시 임계값이며 실제 부하 시험 후 확정한다.

| 지표 | 경고 | 즉시 대응 |
| --- | --- | --- |
| 거래 예상 밖 error rate | 5분간 ≥1% | ≥2% 또는 무결성 이상이면 전체 halt |
| warm 거래 latency | p95 >2초 5분 | p99 >5초 지속 시 hotspot/instance 확인, 필요 시 halt |
| transaction contention | retry/abort ≥1% | 증가 지속·실패 발생 시 해당 club 또는 전체 halt |
| price/ranking age | >90초 경고 | >120초 stale; 가격은 거래 halt 검토, 랭킹은 stale 표시 |
| Function/Scheduler 실패 | 연속 1회 경고 | 2회 또는 중복 부작용 시 scheduler disable/halt |
| App Check reject | baseline 급증 | 합법 사용 차단 확인 시 승인 후 monitor로 임시 전환 |
| Firestore/Functions 사용량 | 예상 곡선 1.5배 | quota·비용 위험 시 listener 축소/읽기 전용 전환 |
| 예산 | 승인액 50/80% | 100% 도달 예상 시 incident commander 결정 |

예산 경보는 비용 상한 차단 장치가 아니다. 자동 billing disable은 데이터 손상·갑작스런 중단 위험 때문에 사용하지 않고 시장 halt와 읽기 축소를 우선한다.

## 10. 백업과 복구 목표

- production seed/migration/개장 전과 고위험 수리 전 Firestore managed export를 별도 제한 버킷에 만든다. export 성공·복원 권한·보존 정책을 확인한다.
- export는 실시간 거래의 RPO 0 보장 수단이 아니다. 커밋된 거래의 복구 정본은 transaction으로 맞춘 user/holding/request/trade/history와 감사 로그다.
- 임시 목표: 시장 halt 5분, read-only 안내 15분, 안전한 거래 재개 30분. 커밋 완료 거래 RPO 0, 비동기 가격/랭킹 RPO는 마지막 정상 tick(최대 120초)을 목표로 한다.
- 정기 복원 리허설은 production이 아닌 격리 프로젝트에서 catalog count, 원장 reconciliation, Rules 재적용까지 검증한다.

## 11. 컴포넌트별 롤백

장애 시 가장 먼저 market을 전체 halt하고 증거를 보존한다.

| 컴포넌트 | 롤백 |
| --- | --- |
| Hosting | 직전 검증 Hosting release로 즉시 전환하고 cache/version을 확인한다. |
| Functions | scheduler/문제 endpoint를 disable 또는 feature flag로 차단한 뒤 직전 artifact를 배포한다. 데이터 계약 하위 호환을 확인한다. |
| Rules | 직전 검증 Rules를 재배포한다. 임시 `allow` 확대는 금지한다. |
| App Check | 정당 사용자가 광범위하게 차단될 때 incident 승인으로 enforce→monitor; 원인 수정 뒤 재enforce한다. |
| indexes | 신규 index는 보통 남겨도 안전하다. 삭제보다 이전 query 사용을 우선한다. |
| market config/event | 새 변경을 중지하고 감사 로그의 이전 검증값으로 승인 복원한다. 거래 발생 후 가격을 임의 되감지 않는다. |
| seed/data | force seed로 덮지 않는다. export·원장·변경 manifest를 이용한 dry-run repair와 2인 승인을 사용한다. |
| closure | market을 `closed` 또는 `halted`로 유지하고 workflow `finalized` 전에는 단계별 멱등 재개한다. finalized 후에는 rollback 대신 immutable correction record를 쓴다. |

롤백 후 전체 reconciliation, 가격/랭킹 age, 보안 smoke, 학생 공지를 확인하기 전 시장을 재개하지 않는다.

## 12. 비용 통제

- 현재 화면의 bounded listener만 유지하고 숨은 화면·logout에서 해제한다.
- 전체 trade/user scan을 요청 경로에서 금지하고 집계·TOP10·ETF·랭킹 snapshot을 사용한다.
- 거래 history는 limit+cursor, news/events는 시간·상태+limit로 조회한다.
- 가격은 60초당 20종목×10샤드의 상한이 계산 가능하도록 하고 실제 빈 shard 최적화는 계약을 깨지 않는 범위에서 검토한다.
- staging operation count를 예상 사용자·행사 시간으로 확장해 당시 공식 Firebase/GCP 계산기로 산정한다. 가격을 문서에 하드코딩하지 않는다.
- min instances는 기본 0, 부하 시험에서 필요하고 예산 승인이 있을 때만 행사 시간에 제한 적용하며 폐장 후 0으로 돌린다.
- log sampling·retention을 정하되 audit/security error는 유실하지 않고 PII는 기록하지 않는다.

## 13. 최종 Go/No-Go 체크리스트

- [ ] 운영 placeholder 0개, 승인된 market config·폐장 규칙
- [ ] 20/6/canonical hash와 seed dry-run·backup 성공
- [ ] 전체 테스트·부하·보안·비용 gate 통과, 차단 결함 0
- [ ] 실제 도메인 Auth와 App Check staging 검증
- [ ] 관리자 2명 이상, 역할·claim 회수·비상 연락 확인
- [ ] 대시보드·경보·예산 수신 확인
- [ ] market halt, rollback, rating outage, closure 리허설 성공
- [ ] 직전 release artifact·Rules·Functions·export 확인
- [ ] 사용자에게서 production 배포의 명시적 승인 수신
