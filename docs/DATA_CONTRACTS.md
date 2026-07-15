# 데이터 계약

## 1. 공통 타입

- 식별자: 사용자 `uuid`, club/ETF `text`, 거래 `uuid`
- 돈·가격·수량·거래량: 안전 범위의 `bigint`
- 비율: 표시용 `numeric`, 권위 계산은 정수 basis point 또는 milli 단위
- 시간: 서버 `timestamptz`; 클라이언트 시각을 권위값으로 받지 않음
- nullable 외부 정보: 로고, 이미지, 부스 위치, 운영 시간은 제공 전 `null`

알 수 없는 enum이나 필수 필드 누락은 호환 오류로 처리한다. DTO의 snake_case 데이터베이스 필드는 서비스 계층에서 camelCase UI 모델로 변환한다.

## 2. 인증 계약

`initialize_user(p_nickname text)`는 현재 Supabase 세션만 사용한다. UID, 이메일, 자금은 클라이언트 인자로 받지 않는다.

성공 응답:

```json
{
  "uid": "uuid",
  "nickname": "학생닉네임",
  "cash": 1000000,
  "estimatedTotalAsset": 1000000,
  "accountStatus": "active"
}
```

신규 닉네임은 trim 후 2~16자 한글·영문·숫자·공백만 허용한다. 서버 금지어 목록을 적용한다. 초기 현금은 UID당 1회만 지급한다.

## 3. 자산 계약

### `accounts`

`id`, `display_name`, `nickname`, `cash`, `estimated_total_asset`, `account_status`, `initial_grant_applied`, `created_at`, `updated_at`, `last_login_at`.

본인만 읽을 수 있고 브라우저 직접 쓰기는 없다. 이메일은 복제하지 않는다.

### `holdings`

복합 키 `(user_id, club_id)`, `quantity`, `average_buy_price`, `created_at`, `updated_at`.

수량과 평균가는 양의 정수다. 매수 평균가는 half-up 가중평균, 부분 매도는 기존 평균 유지, 전량 매도는 행 삭제다.

### `trade_history`

`id`, `user_id`, `club_id`, `side`, `quantity`, `execution_price`, `gross_amount`, `cash_after`, `holding_quantity_after`, `average_buy_price_after`, `executed_at`.

본인 SELECT와 cursor pagination만 허용한다. 성공 체결만 존재하며 브라우저 create/update/delete는 없다.

## 4. 시장 계약

### `clubs`

공식 20개 행만 존재한다. 핵심 필드는 `id`, `display_name`, `aliases`, `category`, `description`, `etf_id`, nullable 외부 정보, 활성·거래 상태, 정수 가격·발행량·시가총액·거래량, 별점 투영과 서버 시각이다.

`Re:chem/리켐`, `invelix/인벨릭스`, `neon/네온`은 각각 한 행이며 한글명은 `aliases`에만 있다.

### `etfs`

공식 6개 행이며 `club_ids` 배열은 정본 20개를 중복 없이 정확히 한 번 포함한다. 동일 가중 조회 지수이고 거래할 수 없다. 스포츠 ETF는 배구사랑 하나만 포함한다.

### `ratings`

`club_id`, 표시용 `average_rating`, 가격용 `average_rating_milli`, `rating_count`, 최근 변화량과 공급자 시각. `rating_count=0`이면 UI는 “평가 없음”, 엔진은 중립 3,000 milli-star로 처리한다.

### `news`

`scope`, nullable `club_id`, `title`, `body`, `is_breaking`, `is_published`, `published_at`, nullable `expires_at`. RLS는 현재 게시 기간만 노출한다.

### `market_config`, `market_state`

각각 `id='current'` 한 행이다. 설정은 공통 가격·샤드·이력 계수를, 상태는 `open|halted|closed`, 활성 수요 창과 공개 가격 창을 가진다.

## 5. 거래 RPC 계약

`buy_stock`과 `sell_stock` 입력:

```json
{
  "p_club_id": "mechanism",
  "p_quantity": 1,
  "p_idempotency_key": "client-generated-random-key"
}
```

가격·총액·UID·현금·보유량·관리자 여부·체결 시각은 허용하지 않는다. 성공 응답은 거래 ID, 종목, 방향, 수량, 서버 체결가, 총액, 체결 후 현금·수량·평균가만 포함한다.

안정 오류: `unauthenticated`, `permission-denied`, `account-disabled`, `market-closed`, `trading-halted`, `club-not-found`, `invalid-quantity`, `insufficient-funds`, `insufficient-holdings`, `duplicate-request`, `price-stale`, `internal`.

같은 UID·key·payload는 저장 결과를 재사용한다. 같은 key의 다른 payload는 `duplicate-request`다. 성공 자산 변경과 `private.trade_requests` 결과는 같은 transaction에 있다.

## 6. 비공개 원장

- `private.trades`: 전역 불변 거래 원장
- `private.trade_requests`: digest 기반 중복 방지
- `private.market_demand`: `(club_id, window_id, shard_id)` 수요
- `private.price_runs`: 회차별 입력과 결정 결과
- `private.audit_logs`: 추가 전용 운영 감사
- `private.leaderboard_entries`: UID 기반 내부 순위

브라우저 역할은 `private` schema USAGE 자체가 없다. service-role 작업도 공개 요청의 사용자 JWT와 혼용하지 않는다.

## 7. 실시간·페이지 계약

- clubs 20, ETFs 6, holdings 20, 뉴스 5, TOP 랭킹 10으로 제한
- 거래 내역은 실시간 구독하지 않고 `(executed_at,id)` cursor 사용
- 화면 진입 후 초기 SELECT와 Realtime 변화를 같은 필터로 재조회
- 화면 이탈·로그아웃 시 채널 제거
- 가격 이력은 종목당 최근 60행만 유지

## 8. 시드 계약

`supabase/seed.sql`은 local reset 기본 시드다. 20 clubs, 6 ETFs, 20 ratings, `market_config`, `market_state`, private app config와 public leaderboard만 만든다. `ON CONFLICT DO NOTHING`으로 재실행이 비파괴적이다. 운영 seed는 대상 project ref와 별도 승인이 필요하다.
