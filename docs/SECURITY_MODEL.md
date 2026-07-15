# 보안 모델

## 1. 보호 대상과 경계

현금, 보유량, 평균 매수가, 거래 원장, idempotency 결과, 가격, 수요, 별점 집계, ETF, 랭킹, 시장 상태와 감사 로그는 서버 권위 데이터다. 브라우저, URL 파라미터, 로컬 저장소, 요청 payload는 신뢰하지 않는다.

보안은 Supabase Auth, PostgreSQL grants, RLS, `SECURITY DEFINER` 함수, 비공개 schema, rate limit, 감사·모니터링을 겹쳐 적용한다.

## 2. 인증

- Supabase Google OAuth만 활성화하고 email/password signup은 비활성화한다.
- 클라이언트 `hd=pangyo.hs.kr`는 UX 힌트일 뿐이다.
- 모든 사용자 RPC는 `auth.uid()`로 `auth.users`를 다시 읽는다.
- `raw_app_meta_data.provider='google'`, `email_confirmed_at`, 정확한 `@pangyo.hs.kr` 도메인을 확인한다.
- 허용 도메인은 `private.app_config` 한 곳에 둔다.
- 세션 만료와 계정 disabled는 fail-closed한다.

## 3. API 접근

두 계층 모두 통과해야 한다.

1. grants: `authenticated`가 객체·함수를 호출할 수 있는지 결정
2. RLS: 반환 가능한 행을 소유자·계정 상태로 제한

`anon`에는 앱 데이터 권한이 없다. `authenticated`는 공개/본인 테이블 SELECT와 `initialize_user`, `buy_stock`, `sell_stock` EXECUTE만 갖는다. 일반 테이블 DML은 회수한다.

## 4. RLS 행렬

| 대상 | anon | authenticated SELECT | 직접 쓰기 |
|---|---|---|---|
| accounts | 거부 | 활성 본인만 | 거부 |
| holdings | 거부 | 활성 본인만 | 거부 |
| trade_history | 거부 | 활성 본인만 | 거부 |
| clubs, etfs, ratings | 거부 | 활성 계정 | 거부 |
| current news/events | 거부 | 게시·활성 기간 | 거부 |
| market config/state, price history | 거부 | 활성 계정 | 거부 |
| public leaderboard | 거부 | 활성 계정 | 거부 |
| public_profiles | 거부 | 직접 접근 거부 | 거부 |
| private schema 전체 | 거부 | 거부 | 거부 |

RLS 정책에서 사용자 수정 가능한 `raw_user_meta_data`를 권한 근거로 사용하지 않는다.

## 5. Database RPC 보안

- 권위 쓰기는 필요한 `SECURITY DEFINER` 함수만 사용한다.
- 모든 함수에 `set search_path = ''`를 지정하고 객체를 schema-qualified한다.
- 기본 함수 EXECUTE를 회수하고 필요한 signature만 `authenticated`에 부여한다.
- 사용자 UID는 인자로 받지 않고 `auth.uid()`에서 얻는다.
- 인증, 학교 도메인, 계정·시장·종목 상태와 모든 인자 범위를 함수에서 검증한다.
- service-role key는 브라우저·로그·저장소에 절대 넣지 않는다.

## 6. 거래 불변식

- 계정 행 잠금으로 같은 사용자 동시 거래를 직렬화한다.
- 현금과 보유 수량은 음수가 될 수 없다.
- 서버 저장 가격만 사용한다.
- 시장과 종목 상태를 같은 transaction에서 잠그고 확인한다.
- 성공 거래, 사용자 자산, 보유량, 개인/전역 원장, 요청 결과와 수요가 전부 반영되거나 전부 롤백된다.
- 동일 idempotency key의 동일 payload는 한 번만 효과를 내고 결과를 재사용한다.
- 같은 key의 다른 payload는 거부한다.

## 7. Realtime

Realtime은 RLS를 통과한 행만 구독한다. publication에는 UI에 필요한 `accounts`, `holdings`, `clubs`, `ratings`, `news`, `market_state`만 넣는다. private 원장, 전체 거래, 감사, 수요와 가격 runs는 publication에 넣지 않는다.

구독은 화면별로 생성하고 이탈 시 `removeChannel`한다. 검색 입력마다 채널을 만들지 않는다.

## 8. 관리자와 예약 작업

관리자 기능은 향후 별도 role 테이블과 RPC로 구현한다. 사용자 수정 가능한 metadata를 관리자 권한으로 쓰지 않는다. 고위험 시장 명령은 재인증·2인 승인·감사 로그를 요구한다.

가격 작업은 브라우저에서 실행할 수 없는 private 함수다. Hosted Supabase Cron 설정은 운영 migration/승인으로 관리한다. Vault 또는 project secret을 쓸 때도 service-role key를 사용자 세션 client와 혼용하지 않는다.

## 9. 비밀과 환경

브라우저 허용:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- UX용 `VITE_ALLOWED_SCHOOL_DOMAIN`

서버 전용:

- service-role/secret key
- DB 비밀번호와 connection string
- Google OAuth client secret
- 관리자 bootstrap 정보
- 외부 별점 자격 증명

local, staging, production 프로젝트와 키를 분리한다. 테스트는 local stack만 사용한다.

## 10. 테스트

- 외부 도메인, 미확인 이메일, non-Google provider 거부
- 최초·재로그인·동시 초기화와 현금 중복 없음
- 타 사용자 accounts/holdings/history SELECT 거부
- cash/holding/price/volume 직접 DML 거부
- 같은/다른 key 동시 거래, 잔액·보유량 경계, 시장 halt 경합
- private schema와 price function 실행 권한 거부
- RLS가 적용된 Realtime과 채널 해제
- secret scan, dependency audit, staging OAuth redirect 검증

## 11. 잔여 위험

- Google 계정 여러 개를 가진 실제 학생 중복은 학생 명부 없이 완전히 막을 수 없다.
- `SECURITY DEFINER`와 service-role 버그는 RLS를 우회하므로 migration review와 pgTAP 회귀가 필수다.
- Postgres Changes는 Broadcast보다 확장성이 낮다. 수백 명 부하 시험에서 병목이 확인되면 private Broadcast로 전환한다.
- Supabase Auth만으로 봇을 완전히 막지 못하므로 RPC rate limit과 운영 경보가 추가로 필요하다.

## 12. 공식 참고

- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [API grants](https://supabase.com/docs/guides/api/securing-your-api)
- [Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Realtime](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Database RPCs](https://supabase.com/docs/guides/database/functions)
