# 시스템 아키텍처

## 1. 범위

학교 축제 당일 수백 명이 사용하는 실시간 모의 주식 서비스다. 클라이언트는 Vite 기반 Vanilla JavaScript, 인증·데이터·실시간·서버 권위 계산은 Supabase Auth·PostgreSQL·Realtime·Database RPCs를 사용한다. 공식 자산은 동아리 20개와 조회 전용 ETF 6개다.

Supabase는 정적 웹 호스팅을 제공하지 않으므로 빌드 결과는 승인된 별도 정적 호스팅에 배포한다. 호스팅 선택은 데이터 권위나 인증 경계를 바꾸지 않는다.

## 2. 핵심 결정

1. 브라우저는 로그인, 제한 조회, 표시와 RPC 요청만 담당한다.
2. `accounts`, `holdings`, 거래 원장, 가격, 수요, 랭킹과 시장 상태의 권위 쓰기는 PostgreSQL 함수만 수행한다.
3. 사용자 초기화와 거래는 `SECURITY DEFINER` RPC이며 `auth.uid()`와 `auth.users`를 다시 검증한다.
4. 거래는 계정·시장·종목 행을 잠그고 모든 자산 변경과 idempotency 결과를 한 트랜잭션에서 확정한다.
5. 거래는 종목 가격 행을 거래량마다 갱신하지 않고 종목·시간 창·10개 샤드의 `private.market_demand`에 누적한다.
6. 가격 작업은 advisory transaction lock을 획득하고 매분 닫힌 수요 창을 1회 처리한다.
7. RLS와 grants를 함께 사용한다. 브라우저 역할에는 권위 테이블 쓰기 권한이 없다.
8. Realtime은 현재 화면의 제한된 테이블만 구독하고 라우트 이탈 시 채널을 제거한다.
9. 운영 변경은 SQL migration으로만 추적하며 Dashboard-only 스키마 변경을 금지한다.

## 3. 구성

| 계층 | 구성 | 책임 |
|---|---|---|
| 모바일 웹 | Vite, Vanilla JS, `@supabase/supabase-js` | Google 로그인, bounded 조회, Realtime, RPC, 오류 UI |
| 인증 | Supabase Auth + Google OAuth | 세션, UID, 확인된 이메일, provider |
| 접근 제어 | PostgreSQL grants + RLS | 역할·행 단위 읽기 격리, 직접 쓰기 차단 |
| 명령 | PostgreSQL RPC | 초기화, 매수, 매도, 향후 관리자 명령 |
| 원장 | PostgreSQL public/private schemas | 자산, 거래, 시장, 수요, 가격, 감사 |
| 비동기 | Supabase Cron + private functions | 가격·ETF·랭킹 회차, 만료·정합성 작업 |
| 운영 | Supabase Dashboard/CLI + 외부 정적 호스팅 | migration, 백업, 모니터링, 배포, 롤백 |

브라우저에는 Supabase URL과 publishable key만 둔다. service-role key, 데이터베이스 비밀번호, Google OAuth secret, 관리자·별점 공급자 secret은 서버 설정이나 Vault에만 둔다.

## 4. 인증과 초기화

1. 클라이언트가 Supabase Google OAuth를 PKCE 흐름으로 시작한다. `hd=pangyo.hs.kr`는 계정 선택 UX용이다.
2. 클라이언트는 확인 이메일과 도메인을 조기 검사하지만 보안 통제로 간주하지 않는다.
3. `initialize_user`가 `auth.uid()`로 `auth.users`를 읽고 Google provider, `email_confirmed_at`, `private.app_config.allowed_school_domain`을 확인한다.
4. UID advisory lock 뒤 기존 계정을 잠근다. 신규 계정만 닉네임 검증과 현금 1,000,000원 지급을 수행한다.
5. 재로그인은 기존 자산을 유지하고 `last_login_at`만 갱신한다.

Google UID당 계정 하나만 보장한다. 한 학생이 여러 학교 Google 계정을 소유한 상황은 학생 명부 없이 완전히 차단할 수 없다.

## 5. 거래 흐름

클라이언트는 `clubId`, 양의 정수 `quantity`, 무작위 `idempotencyKey`만 `buy_stock` 또는 `sell_stock`에 전달한다.

`private.execute_trade`는 다음을 한 트랜잭션에서 수행한다.

1. 현재 인증 사용자와 학교 도메인 재검증
2. `accounts` 본인 행 `FOR UPDATE`
3. UID+idempotency digest 조회, 동일 payload 성공 결과 재사용
4. `market_state`와 `clubs` 행 잠금 및 개장·가격 최신성 확인
5. holding 잠금과 현금·수량·정수 평균가 검증
6. 계정, holding, 개인 내역, 전역 원장, 요청 결과와 수요 샤드 원자 반영

행 잠금 순서가 같은 사용자 동시 거래를 직렬화한다. 시장 정지 transaction이 먼저 확정되면 이후 주문은 `market-closed`다. 클라이언트 가격·UID·총액·현금·보유량·시각은 신뢰하지 않는다.

## 6. 가격 흐름

매분 Supabase Cron이 `private.run_price_tick()`을 호출한다. 함수는 transaction advisory lock을 사용하고 활성 수요 창을 읽는다.

- 종목당 10개 `private.market_demand` 샤드 합산
- 공통 `market_config` 계수
- 표본 수로 수축한 별점
- 현재 활성 관리자 이벤트
- 최소 100원, 최대 1,000,000원, tick당 ±200bp 제한

20개 종목, 최근 가격 이력과 시장 창 포인터가 한 트랜잭션에서 갱신된다. 거래가 없고 다른 신호도 없으면 가격은 진동하지 않는다. 브라우저는 가격 함수를 실행하거나 입력을 수정할 수 없다.

## 7. 실시간 읽기

| 화면 | 초기 SELECT와 Realtime | 상한 |
|---|---|---|
| 홈 | `clubs`, `market_state`, `news` | 20, 1, 5 |
| 시장 | 활성 `clubs` | 20 |
| 종목 상세 | club 1, rating 1, 뉴스 5, 본인 holdings 20 | 고정 |
| 내 자산 | 본인 account 1, holdings 20, clubs 20 | 고정 |
| ETF | `etfs` | 6 |
| 랭킹 | `public_leaderboard/current` | 1 |

검색은 시장 화면에서 이미 받은 20개 종목을 로컬 필터링한다. 전체 거래·전체 사용자·감사 로그·수요·가격 run은 구독하지 않는다. `removeChannel`을 라우트 변경과 로그아웃 때 호출한다.

## 8. 장애와 복구

- RPC 오류율, transaction lock 대기, Realtime 연결, DB CPU/IO, connection 수, 가격 지연, Cron 실패를 경보한다.
- 자산 불변식 또는 가격 회차 이상 시 시장을 `halted`로 전환한다.
- PITR/백업과 불변 거래 원장을 모두 유지한다. 콘솔 직접 수정 대신 승인된 교정 migration/RPC를 쓴다.
- UI 배포 실패는 이전 정적 release로 롤백한다. DB migration은 사전 검증된 forward fix를 원칙으로 하며 운영 자산을 임의 하향 migration하지 않는다.

## 9. 환경

- local, staging, production Supabase 프로젝트를 분리한다.
- local은 Supabase CLI와 Docker를 사용하고 `supabase db reset`으로 migration+seed를 재현한다.
- staging에서 Google OAuth redirect URL, RLS, Realtime, Cron, 부하와 백업 복원을 확인한다.
- production migration, seed, Cron 활성화와 웹 배포는 각각 명시적 승인이 필요하다.

## 10. 공식 참고

- [Google 로그인](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [API 보안과 grants](https://supabase.com/docs/guides/api/securing-your-api)
- [Realtime 구독](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [로컬 migration](https://supabase.com/docs/guides/local-development/overview)
- [Cron](https://supabase.com/docs/guides/cron)
