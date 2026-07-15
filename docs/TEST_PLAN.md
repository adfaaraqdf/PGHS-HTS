# 테스트 계획

## 1. 원칙

production 데이터로 자동 테스트하지 않는다. local Supabase stack은 매 실행 migration과 seed로 초기화한다. 테스트를 삭제하거나 보안 기대값을 약화해 통과시키지 않는다.

## 2. 계층

| 계층 | 범위 |
|---|---|
| Node 단위 테스트 | 환경 검증, 검색·정렬, format, auth/trade service와 controller |
| catalog validation | 공식 clubs 20, ETFs 6, 별칭, seed ID |
| pgTAP | schema, grants, RLS, RPC, 거래 원자성, 가격 함수 |
| local 통합 | Supabase Auth/PostgREST/Realtime/transaction/Cron |
| 브라우저 | 360/390/430px, 키보드, screen reader, listener 해제 |
| staging | 실제 Google OAuth redirect, 부하, 비용, 백업·복구 |

## 3. 표준 명령

```sh
npm ci
npm run lint
npm test
npm run build
npm run seed:validate
npm run supabase:start
npm run db:reset
npm run db:lint
npm run test:db
```

Docker가 없거나 실행 중이 아니면 database/local 검증은 실패로 숨기지 않고 blocker로 보고한다.

## 4. 인증

- 허용된 Google `@pangyo.hs.kr` 최초 로그인
- 같은 UID 재로그인과 초기 현금 미중복
- 외부 도메인, 미확인 이메일, non-Google provider
- 닉네임 누락·길이·문자·금지어
- 동시 초기화와 중간 실패 재시도
- 세션 복원·만료·로그아웃
- 초기화 전 앱 데이터 RLS 거부

## 5. RLS와 grants

- anon 전체 앱 데이터 거부
- 본인 account/holding/history SELECT 허용
- 타 사용자 private SELECT 거부
- accounts/holdings/history/clubs/prices/ratings/market 직접 DML 거부
- public_profiles 원본과 private schema 접근 거부
- 사용자 RPC 세 개 외 함수 EXECUTE 거부
- 뉴스·이벤트 게시 기간 RLS
- Realtime도 같은 RLS 결과만 전달

RLS만으로 RPC 안전을 주장하지 않는다. 같은 공격 입력을 함수 validation과 transaction 테스트에 반복한다.

## 6. 공식 시드

- 정확히 20 clubs, 6 ETFs, 20 ratings
- 고유 ID와 전체 ETF 구성 합계 20
- 리켐·인벨릭스·네온은 alias이고 중복 행 없음
- 공식 카탈로그 외 종목 행 없음
- 모든 종목 초기 가격·발행량·시가총액·거래량 동일
- 재실행 `ON CONFLICT DO NOTHING`
- 운영 기존 자산 덮어쓰기 없음

## 7. 거래

- 매수·매도 정상 경계
- 0·음수·소수·과대 수량
- 존재하지 않음·비활성·거래 정지 종목
- 시장 closed/halted, stale price
- 현금 부족·보유 부족·전량 매도
- 가중 평균 half-up과 부분 매도 평균 유지
- 같은 key 순차·동시 호출, 응답 유실 재호출
- 같은 key 다른 payload 거부
- 서로 다른 key의 잔액/보유량 경계 동시 거래
- 시장 halt와 거래 row-lock 순서
- 모든 실패 transaction 무반영
- private 원장·history·request·demand와 account/holding 합치

## 8. 가격

- 매수/매도 우세, 동일 수요, 거래 없음
- rating 0/1/500개와 상승·하락
- 호재·악재·중첩·만료 이벤트
- 최소·최대 가격과 ±200bp
- 정수·finite 결과
- advisory lock 경쟁과 중복 실행
- 실패 전체 rollback
- 20개 종목 한 회차와 이력 최대 60행
- 전체 거래 원장 scan 없음

## 9. UI와 Realtime

- 홈·시장·상세·내 자산 로딩/오류/빈 상태
- display name·alias 한글 검색과 중복 카드 없음
- 시장 20개 제한, 뉴스 5개, holdings 20개
- 라우트 이탈·로그아웃 시 `removeChannel`
- 입력마다 새 Realtime 채널 생성 없음
- 거래 모달, 버튼 연타 잠금, 같은 idempotency key 재시도
- 44px touch, 키보드 focus, aria live/dialog/label
- 색상 외 상승·하락 텍스트·기호
- 큰 금액·긴 이름·null 이미지/부스/시간
- 느린 연결·오프라인·세션 만료

## 10. 성능·운영 gate

임시 목표:

- warm 거래 RPC p95 2초 이하, p99 5초 이하
- 예상 밖 오류 1% 미만, 무결성 오류 0
- 가격 age 120초 이하
- 500명 임시 동시 접속, 20 rps 지속·50 rps burst
- 80% 인기 종목 집중에서 lock timeout과 DB connection 여유
- Realtime fan-out과 egress가 승인 예산 이내

staging에서 market halt, Cron 중단/복구, 잘못된 migration, OAuth secret 회수, 정적 호스팅 rollback과 백업 복원을 리허설한다.
