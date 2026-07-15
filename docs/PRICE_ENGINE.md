# 가격 변동 엔진

## 1. 권위와 실행

가격은 PostgreSQL의 `private.run_price_tick()`만 기록한다. 브라우저 역할에는 EXECUTE 권한이 없다. Hosted 환경에서는 Supabase Cron이 매분 함수를 호출하며, local에서는 테스트가 직접 호출한다.

함수는 `pg_try_advisory_xact_lock(hashtext('pghs-price-tick'))`을 사용한다. 락을 얻지 못한 중복 실행은 `locked`를 반환하고 아무것도 변경하지 않는다. 시장이 `open`이 아니면 `market-closed`를 반환한다.

## 2. 공통 설정

`market_config(id='current')`에서 관리한다.

| 설정 | 개발값 |
|---|---:|
| 초기 가격 | 10,000원 |
| 최소/최대 가격 | 100원 / 1,000,000원 |
| 최대 tick 변화 | ±200bp |
| 수요 기여 상한 계수 | 120bp |
| 별점 기여 계수 | 50bp |
| 별점 prior count | 20 |
| 유동성 바닥 | 100주 |
| 수요 샤드 | 10 |
| 가격 최신성 최대 지연 | 120초 |
| 종목별 이력 | 60행 |

모든 20개 종목에 동일한 설정을 적용하며 종목별 우대 계수는 없다.

## 3. 입력

- 이전 `clubs.current_price`, `fundamental_price`, `previous_close`
- 활성 창 `private.market_demand`의 10개 샤드 합계
- `clubs.average_rating`, `rating_count`
- 현재 시각에 활성인 `admin_events`
- 공통 `market_config`

전체 거래 원장을 스캔하지 않는다.

## 4. 계산

수요 신호:

```text
demandBps = round((buyQuantity - sellQuantity) × demandImpactBps
                  / (buyQuantity + sellQuantity + liquidityFloor))
```

별점 신호:

```text
shrunkDeviationMilli = (averageRatingMilli - 3000) × ratingCount
                        / (ratingCount + ratingPriorCount)
ratingBps = round(shrunkDeviationMilli × ratingImpactBps / 2000)
```

이벤트 신호는 활성 이벤트의 positive `+impact_bps`, negative `-impact_bps` 합이다.

```text
totalBps = clamp(demandBps + ratingBps + eventBps, -maxTickBps, +maxTickBps)
delta = round(currentPrice × totalBps / 10000)
nextPrice = clamp(currentPrice + delta, minPrice, maxPrice)
```

거래·별점·이벤트 신호가 모두 0이면 `totalBps=0`으로 고정해 불필요한 진동을 막는다. 최종 가격과 금액은 정수다.

## 5. 회차 반영

한 transaction에서 다음을 수행한다.

1. `market_state` 잠금과 활성 수요 창 고정
2. 20개 `clubs` 행을 고정 순서로 잠금
3. 샤드 합계와 신호 계산
4. `private.price_runs(window_id,club_id)` 입력·결과 저장
5. club 가격·거래량·시가총액 갱신
6. `price_history` 삽입 후 종목당 최근 60행만 유지
7. `market_state.current_price_window_id`와 새 활성 창 원자 교체

실패하면 transaction 전체가 롤백되어 혼합 회차 가격이 공개되지 않는다.

## 6. 테스트 불변식

- 동일 DB snapshot과 설정은 동일 결과
- 매수 우세 상승, 매도 우세 하락
- 거래 없음·중립 별점·이벤트 없음은 가격 유지
- ratingCount 1은 500보다 약한 영향
- 만료 이벤트 영향 없음
- 가격 범위와 ±200bp 준수
- 결과 가격·거래량·시가총액 정수
- 락 경쟁 시 중복 publish 없음
- 20개 공식 종목을 한 회차에서 처리
- 이력 종목당 최대 60행

## 7. 잔여 위험

현재 구현은 PostgreSQL 행 잠금으로 20개 가격을 직렬 처리한다. 수백 명 규모에서는 거래 요청이 club 가격 행을 잠그는 짧은 구간과 price tick이 충돌할 수 있다. staging에서 lock wait, RPC p95/p99와 Cron 실행 시간을 측정하고 120초를 넘으면 시장을 halt한다.
