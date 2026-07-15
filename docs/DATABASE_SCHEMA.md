# PostgreSQL 데이터베이스 스키마

## 1. 기준

Supabase PostgreSQL이 자산과 시장 상태의 단일 원장이다. 모든 운영 변경은 `supabase/migrations/`에 기록한다. 브라우저 역할은 명시적으로 허용된 `SELECT`와 세 개의 사용자 RPC만 사용할 수 있고 권위 테이블을 직접 수정할 수 없다.

금액·가격·수량은 `bigint`, 비율은 표시용 `numeric`을 사용한다. 시간은 서버 `timestamptz`로 저장하고 표시는 `Asia/Seoul`을 따른다.

## 2. 공개 스키마

| 테이블 | 키 | 역할 | 브라우저 접근 |
|---|---|---|---|
| `accounts` | `id = auth.users.id` | 현금·총자산·계정 상태 | 본인 SELECT만 |
| `public_profiles` | `user_id` | 닉네임 투영 원본 | 직접 접근 금지 |
| `clubs` | `id` | 공식 20종목과 공개 가격 | 활성 사용자 SELECT |
| `etfs` | `id` | 공식 6개 조회 지수 | 활성 사용자 SELECT |
| `holdings` | `(user_id, club_id)` | 수량·평균 매수가 | 본인 SELECT만 |
| `trade_history` | `id` | 본인 거래 내역 투영 | 본인 SELECT만 |
| `ratings` | `club_id` | 서버 정규화 별점 | 활성 사용자 SELECT |
| `news` | `id` | 게시 뉴스 | 게시 기간 내 SELECT |
| `admin_events` | `id` | 활성 시장 이벤트 | 활성 기간 내 SELECT |
| `market_config` | `id='current'` | 공통 가격 계수와 제한 | 활성 사용자 SELECT |
| `market_state` | `id='current'` | 개장·정지·수요 창 | 활성 사용자 SELECT |
| `price_history` | `(club_id, window_id)` | 종목당 최근 60회 | 활성 사용자 SELECT |
| `public_leaderboard` | `id='current'` | 제한된 TOP 10 JSON | 활성 사용자 SELECT |

`accounts`, `holdings`, `trade_history`는 `auth.uid()`를 기준으로 격리한다. `clubs.id`가 기존 개념 모델의 `stock_id`, `holdings.user_id/club_id`가 `holding.user_id/stock_id`, `news.club_id`가 `news.stock_id`에 대응한다.

## 3. 비공개 스키마

`private` 스키마는 Data API에 노출하지 않으며 `anon`과 `authenticated`에 USAGE를 주지 않는다.

| 테이블 | 역할 |
|---|---|
| `app_config` | 학교 도메인·초기 자금·시간대·금지어 |
| `trades` | 불변 전역 거래 원장 |
| `trade_requests` | UID 범위 idempotency 결과 |
| `market_demand` | 종목·창·고정 샤드 수요 |
| `price_runs` | 가격 회차 입력·결과 |
| `audit_logs` | 추가 전용 감사 로그 |
| `leaderboard_entries` | 내부 UID 기반 순위 원장 |

## 4. 사용자 초기화

`public.initialize_user(p_nickname)`은 `SECURITY DEFINER` RPC다. `auth.uid()`로 `auth.users`를 다시 읽고 다음을 확인한다.

- Google provider
- `email_confirmed_at` 존재
- `private.app_config.allowed_school_domain = pangyo.hs.kr`
- 기존 계정 상태
- 신규 닉네임 길이·문자·금지어

UID advisory transaction lock 뒤 계정이 없을 때만 현금 1,000,000원을 지급한다. 재호출은 로그인 시각만 갱신한다.

## 5. 거래 트랜잭션

`buy_stock`과 `sell_stock`은 `{p_club_id, p_quantity, p_idempotency_key}`만 받는다. 내부 `private.execute_trade`가 한 PostgreSQL 트랜잭션에서 다음을 수행한다.

1. 인증·Google·학교 도메인·계정 상태 확인
2. 계정 행 잠금으로 같은 사용자 거래 직렬화
3. UID+키 digest 조회 및 동일 payload 결과 재사용
4. 시장 상태와 종목 행 잠금, 서버 가격·최신성 검증
5. 잔액·보유량·평균가 계산
6. 계정·holding·개인 내역·전역 원장·요청 결과·수요 샤드 원자 반영

전량 매도는 holding 행을 삭제한다. 클라이언트 UID·가격·총액·현금·시각은 입력으로 받지 않는다.

## 6. 가격 회차

`private.run_price_tick()`은 advisory transaction lock으로 단일 실행된다. 활성 창의 고정 샤드를 합산하고 공통 설정, Bayesian 보정 별점, 활성 이벤트를 적용해 ±200bp와 100~1,000,000원 범위로 제한한다. 20개 종목·가격 이력·시장 창 포인터가 한 트랜잭션에서 갱신된다. 브라우저는 이 함수를 실행할 권한이 없다.

Hosted Supabase에서는 Cron이 매분 이 함수를 실행하도록 운영 시 설정한다. 스케줄 생성은 원격 프로젝트·시간대 확인 후 별도 승인 절차로 적용한다.

## 7. RLS와 grants

- 모든 `public` 테이블은 RLS를 활성화한다.
- `anon`에는 앱 데이터 권한을 주지 않는다.
- `authenticated`에는 필요한 테이블의 `SELECT`만 부여한다.
- 일반 테이블 `INSERT/UPDATE/DELETE`는 모두 회수한다.
- 사용자 RPC 세 개만 `authenticated EXECUTE`를 허용한다.
- 비공개 함수와 테이블은 브라우저 역할에서 전면 회수한다.

RLS는 `private.is_active_user(auth.uid())`와 소유자 조건을 함께 사용한다. 관리자 claim을 브라우저 직접 쓰기 권한으로 사용하지 않는다.

## 8. 인덱스와 Realtime

- `clubs(is_active, current_price desc)`
- `clubs(is_active, price_change_rate desc)`
- `clubs(is_active, total_volume desc)`
- `news(is_published, published_at desc)`
- `news(club_id, is_published, published_at desc)`
- `trade_history(user_id, executed_at desc, id desc)`
- `price_history(club_id, calculated_at desc)`

Realtime publication은 `accounts`, `holdings`, `clubs`, `ratings`, `news`, `market_state`만 포함한다. 클라이언트는 화면 진입 시 제한 SELECT 후 해당 테이블 변화를 구독하고 화면 이탈 시 채널을 제거한다.

## 9. 시드 불변식

`supabase/seed.sql`은 20 clubs, 6 ETFs, 20 ratings, 공통 설정과 시장 상태만 `ON CONFLICT DO NOTHING`으로 만든다. 모든 종목은 10,000원·100,000주·0 거래량으로 동일하다. 로고·이미지·부스·운영 시간은 정보가 제공될 때까지 `null`이다.
