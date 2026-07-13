# 가격 엔진 설계

## 1. 목적과 비목표

가격 엔진은 별점, 닫힌 거래 수요 창, 관리자 이벤트를 이용해 공식 동아리 20개의 가격을 예측 가능하고 공정하게 갱신한다. 최종 가격은 서버만 기록하며 같은 입력과 설정 버전은 같은 결과를 낸다.

목표는 실제 증권시장을 정밀 모사하는 것이 아니라 축제에서 설명 가능하고 조작에 강한 가격 흐름을 제공하는 것이다. 호가·지정가·시장조성·공매도·파생상품·복잡한 차트는 설계하지 않는다. ETF는 매매 대상이 아닌 동일 가중 조회 지수다.

## 2. 공정성 불변 조건

- 모든 club은 동일한 `market/config`를 사용한다. 종목별 초기 가격, 발행량, 변동·별점·이벤트 계수 override를 금지한다.
- 개발 seed는 현재가·`fundamentalPrice`·기준가·전일 종가 10,000원, 발행량 100,000주, 시가총액 1,000,000,000원, 거래량 0으로 동일하다.
- 가격과 돈은 원 단위 정수이며 모든 중간 비율은 정수 bp 또는 명시된 고정 정밀도로 계산한다.
- 새 가격은 최소 100원이고 한 tick 총변동은 ±200bp를 넘지 않는다.
- 평가 수가 적을수록 중립 3.0에 강하게 수축한다. 평가가 없으면 가격 신호는 0이다.
- 열린 수요 창이나 전체 거래 컬렉션을 계산 입력으로 스캔하지 않는다.
- 스케줄러 재실행, 네트워크 재시도, 함수 중복 실행이 가격을 두 번 반영하지 않는다.
- 닫힌 시장에서는 정규 가격 tick을 적용하지 않는다. 폐장 확정 뒤 가격과 최종 랭킹은 불변이다.

## 3. 개발 기본 설정

모든 값은 `market/config`에서 한 번만 관리하고 `configVersion`으로 고정한다. 아래 값은 운영 전 부하·게임경제 테스트 후 확정할 개발 기본안이다.

| 설정 | 기본값 | 이유 |
|---|---:|---|
| `initialPrice` / `basePrice` / `previousClose` | 10,000원 | 학생이 계산하기 쉽고 원 단위 변동 여유가 큼 |
| `issuedShares` | 100,000주 | 동일 초기 시총 10억원을 만드는 공통값 |
| `initialVolume` | 0주 | 모든 종목의 동일 출발 |
| `minPrice` | 100원 | 0·음수 방지와 거래 가능 단위 유지 |
| `demandShardCount` | 10 | 수백 명 경합 완화를 위한 제한된 시작점 |
| `priceTickSeconds` | 60초 | 분 단위 스케줄, 비용과 운영 단순성 |
| `maxPriceDelaySeconds` | 120초 | 한 회 재시도 여유; 초과 시 stale/거래 차단 |
| `maxTickChangeBps` | ±200bp | 1분당 최대 ±2%로 급변 제한 |
| `maxRatingContributionBps` | ±50bp | 소수 평가의 영향 억제 |
| `maxDemandContributionBps` | ±120bp | 실제 참여 수요를 주 요인으로 반영 |
| `maxAdminContributionBps` | ±60bp | 운영 이벤트의 자의적 영향 제한 |
| `ratingPriorMeanMilli` | 3,000 | 3.000점을 나타내는 정수 milli-star 중립값 |
| `ratingPriorCount` | 20 | 소수 평가를 중립으로 강하게 수축 |
| `ratingScaleHalfRangeMilli` | 2,000 | 중립 3.0에서 1.0/5.0까지 신호 정규화 폭 |
| `ratingRecentFullScaleMilli` | 1,000 | 최근 변화 ±1.0점을 full-scale로 보는 기준 |
| `ratingLevelWeightPermille` | 700 | 별점 절대 수준 신호 70% |
| `ratingRecentWeightPermille` | 300 | 최근 변화 신호 30%; 두 가중치 합은 1,000 |
| `demandLiquidityFloorShares` | 100주 | 한두 건이 최대 수요 변동을 만드는 것 방지 |
| `ratingFreshMinutes` | 10분 | 최신 입력은 전량 반영 |
| `ratingZeroMinutes` | 30분 | 오래된 변화 신호는 선형 감쇠 후 제거 |
| `ratioRoundingMode` | half-up | 평균·신호·등락률의 대칭 반올림 |
| `boundedDeltaRoundingMode` | toward-zero | 정수 원 단위에서도 bp 상한을 절대 넘지 않음 |

수요는 fundamental을 최대 ±120bp 움직이고 별점·관리자 target premium은 합계 최대 ±110bp다. 현재가는 계산된 target을 향하되 한 tick에 `maxTickChangeBps`(개발값 ±200bp)만 이동한다. 계수 변경은 회차 도중이 아니라 새 demand window 경계에서만 활성화하고 감사 로그를 남긴다.

## 4. 시간 창과 입력 스냅샷

- window ID는 UTC epoch minute를 기반으로 만든 결정적 문자열이다. 화면 표시만 `FESTIVAL_TIMEZONE`을 사용한다.
- 거래 함수는 `market/state.activeDemandWindowId`를 transaction에서 읽고 종목·창별 10개 샤드 중 하나를 증가시킨다.
- 샤드 선택은 `requestId`의 안정 해시 modulo `shardCount`다. 같은 거래 재시도는 항상 같은 샤드를 가리킨다.
- 1분 스케줄러는 lease를 얻은 뒤 transaction으로 활성 창을 교체한다. 이전 state를 읽었던 미완료 거래는 재시도되어 새 창으로 들어가므로 닫힌 창은 안정된 입력이 된다.
- 가격 입력은 닫힌 10개 샤드의 합, 해당 시점의 별점 집계, 활성 관리자 이벤트, 이전 `currentPrice`·`fundamentalPrice`, `configVersion`이다.
- 이벤트는 `(startsAt, eventId)` 순으로, 샤드는 shard ID 순으로 정렬한다. 입력의 canonical digest를 `priceRuns`에 기록한다.

서버 도착 시각이 창 배정을 결정한다. 클라이언트 시계와 클라이언트가 보낸 시각은 사용하지 않는다.

## 5. 결정적 계산

모든 `clamp(x, low, high)`는 경계를 포함한다. 별점은 milli-star(`1,000=1.000점`), 정규화 신호와 freshness는 ppm(`1,000,000=1.0`), 변동률은 bp 정수로 계산한다. 평균·신호에는 명시된 `halfUp`, 상한이 있는 원 단위 가격 delta에는 `truncTowardZero`를 사용한다. 후자는 양수 floor, 음수 ceil과 같아 이산 가격에서도 bp 상한을 넘지 않는다. 권위 계산에 JavaScript 부동소수 연산을 쓰지 않고 곱셈 전 안전 정수 범위를 검사한다.

### 5.1 별점 기여

저장 초기값은 표시용 `averageRating=3.0`과 별도로 계산용 `averageRatingMilli=ratingPriorMeanMilli`(개발값 3000), `ratingCount=0`, `ratingRecentDeltaMilli=0`, `lastRatingAt=null`이다. UI는 count 0을 “평가 없음”으로 표시하며 엔진은 milli-star 필드만 읽는다.

1. Bayesian 평균:

   `bayesianMeanMilli = halfUp((averageRatingMilli × ratingCount + ratingPriorMeanMilli × ratingPriorCount) / (ratingCount + ratingPriorCount))`

2. 수준 신호:

   `levelSignalPpm = clamp(halfUp((bayesianMeanMilli - ratingPriorMeanMilli) × 1_000_000 / ratingScaleHalfRangeMilli), -1_000_000, 1_000_000)`

3. 최근 변화 신호:

   `recentSignalPpm = clamp(halfUp(ratingRecentDeltaMilli × 1_000_000 / ratingRecentFullScaleMilli), -1_000_000, 1_000_000)`

4. freshness:

   - count 0 또는 `lastRatingAt=null`: `0ppm`
   - 마지막 별점이 `ratingFreshMinutes` 이내: `1_000_000ppm`
   - `ratingFreshMinutes`~`ratingZeroMinutes`: 설정된 구간에서 정수 선형 감쇠
   - `ratingZeroMinutes` 초과 또는 미래·비정상 시각: 0 및 운영 경보

5. 원하는 별점 premium:

   `weightedSignalPpm = halfUp((ratingLevelWeightPermille × levelSignalPpm + ratingRecentWeightPermille × recentSignalPpm) / 1000)`

   `desiredRatingPremiumBps = halfUp(maxRatingContributionBps × freshnessPpm × weightedSignalPpm / 1_000_000_000_000)`

평균 수준을 매분 반복 적용하면 가격이 끝없이 복리로 움직이므로, 별점은 `fundamentalPrice`에 붙는 절대 target premium으로 해석한다. 새 평가가 없고 freshness가 사라지면 target이 0으로 돌아가며 같은 입력을 반복해 가격을 계속 올리지 않는다.

### 5.2 거래 수요 기여

닫힌 창의 10개 샤드를 합쳐 다음 정수를 얻는다.

- `buyQuantity`, `sellQuantity`
- `buyTradeCount`, `sellTradeCount`
- `grossBuyAmount`, `grossSellAmount`

수량 기반 순수요는 다음과 같다.

`netQuantity = buyQuantity - sellQuantity`

`activityDenominator = max(buyQuantity + sellQuantity, demandLiquidityFloorShares)`

`imbalancePpm = clamp(halfUp(netQuantity × 1_000_000 / activityDenominator), -1_000_000, 1_000_000)`

`demandBps = halfUp(maxDemandContributionBps × imbalancePpm / 1_000_000)`

거래가 없으면 0이다. 최소 유동성 바닥 때문에 1주의 단독 매수가 즉시 +120bp를 만들지 않는다. 금액 합계와 거래 건수는 조작·이상 탐지와 테스트에 사용하지만, 고가가 된 종목이 자동으로 더 큰 영향력을 갖지 않도록 1차 가격식은 수량 imbalance를 사용한다. 운영 전 합성 부하에서 주문 상한과 100주 바닥을 함께 검증한다.

### 5.3 관리자 이벤트 기여

관리자 이벤트는 매 tick 반복 수익률이 아니라 활성 기간 동안 유지되는 제한된 가격 premium이다.

1. `startsAt <= windowEnd < endsAt`, 대상 club 포함, 활성 상태인 이벤트만 고른다.
2. `positive`는 +, `negative`는 -로 `impactBps`를 부호화한다. 클라이언트가 부호나 적용 종목을 직접 기록할 수 없다.
3. 정렬된 이벤트의 합을 `±maxAdminContributionBps`로 clamp해 `desiredAdminPremiumBps`를 만든다.

관리자 영향도 `fundamentalPrice`에 붙는 절대 target premium이다. 이벤트 시작·종료 때 target이 변하고 같은 활성 이벤트를 매 tick 복리 적용하지 않는다. 이벤트 기간, 대상, 영향도, 생성자와 사유는 감사 로그에 남는다.

### 5.4 최종 가격

수요는 영구 기준인 정수 `fundamentalPrice`를 움직이고, 별점·관리자 이벤트는 그 기준에 붙는 절대 target premium으로 계산한다. 이 분리 덕분에 같은 이벤트를 반복 복리 적용하지 않고 원 단위 반올림이나 최저가 때문에 시작·종료 영향이 비대칭으로 누적되지 않는다.

`demandDeltaWon = truncTowardZero(oldFundamentalPrice × demandBps / 10_000)`

`newFundamentalPrice = max(minPrice, oldFundamentalPrice + demandDeltaWon)`

`statePremiumBps = desiredRatingPremiumBps + desiredAdminPremiumBps`

`stateTargetDeltaWon = truncTowardZero(newFundamentalPrice × statePremiumBps / 10_000)`

`targetPrice = max(minPrice, newFundamentalPrice + stateTargetDeltaWon)`

`maxTickDeltaWon = truncTowardZero(oldPrice × maxTickChangeBps / 10_000)`

`downBound = max(minPrice, oldPrice - maxTickDeltaWon)`

`upBound = oldPrice + maxTickDeltaWon`

`newPrice = clamp(targetPrice, downBound, upBound)`

target이 1회 상한 밖이면 현재가는 매 tick 같은 target을 향해 이동하며, target이 사라지면 새 target으로 되돌아간다. `fundamentalPrice` 자체도 `minPrice` 아래로 내려가지 않으므로 숨은 음수 carry를 쌓지 않는다. `appliedChangeBps`는 감사용으로 `truncTowardZero((newPrice-oldPrice)×10_000/oldPrice)`에서 파생하며 다음 계산의 입력으로 사용하지 않는다.

파생 필드는 다음 기준을 사용한다.

- `priceChange = newPrice - previousClose`
- `priceChangeRate = halfUp((newPrice - previousClose) × 10,000 / previousClose)` bp
- `marketCap = newPrice × issuedShares`
- `totalVolume = cumulativeBuyVolume + cumulativeSellVolume`

`priceRuns`에는 old/new fundamental, rating/admin target premium, targetPrice, 상·하한, 최종 가격을 모두 남긴다. `previousClose`는 세션 기준가이며 매 tick 덮어쓰지 않는다.

## 6. 실행·idempotency 프로토콜

1. 정규 스케줄 호출은 `market/state.status=open`과 마지막 완료 window를 확인한다. `halted`에서는 새 회차를 만들지 않되 incident-admin이 같은 실패 window/run ID를 복구 재실행할 수 있다. 폐장 최종 tick은 시장이 `closed`인 상태에서 승인된 `closureRuns/{closureId}.status=running`을 가진 별도 명령만 허용한다.
2. `serviceLeases/price-coordinator`를 transaction으로 획득하고 증가하는 fencing token과 expiry를 기록한다.
3. 활성 demand window를 회전하고 이전 창을 `closed`로 고정한다.
4. 20개 club 각각에 결정적 ID `windowId_clubId`인 `priceRuns`를 만든다.
5. run이 이미 `completed`면 저장 결과를 반환하고 가격을 다시 쓰지 않는다.
6. 입력을 읽고 후보 결과를 `priceRuns`에 완료한다. 이 단계는 공개 `clubs`를 변경하지 않는다.
7. 20개 성공을 확인해 `priceVersions/{windowId}=ready`로 만든다. 5단계에서는 알려진 20개 run과 이전 version을 검증하고 20개 `clubs`, `market/state.currentPriceWindowId`, version=`published`를 한 transaction에 커밋한다.
8. 7단계부터는 ready 뒤 ETF 후보 6개를 계산하고 publisher를 최종 프로토콜로 확장한다. 이 transaction은 20개 `clubs`, 6개 `etfs`, pointer, version=`published`를 함께 커밋하며 모든 club의 `priceCalculatedAt`과 ETF `calculatedAt/sourcePriceAsOf`는 같은 publish 시각이다.
9. lease를 해제하고 duration, read/write 수, retry, clamp 여부, stale age를 기록한다.

한 club 계산 실패는 같은 run ID로 그 club만 재시도한다. 어떤 `clubs`/ETF 문서도 20개가 모두 준비되기 전 바뀌지 않는다. 원자 publish transaction은 20개 club + 6개 ETF + market state + version, 총 28개의 작은 문서를 한 번에 쓰는 구조이며 실제 문서·인덱스 크기, 경합, Firestore transaction 한도를 staging 부하 테스트로 검증한다. publish 실패 시 이전 회차가 그대로 공개된다.

단계 순서는 유지한다. 5단계에서는 ETF를 선행 구현하지 않고 20개 club + market state + version만 원자 publish한다. 7단계가 ETF 계산을 구현하면서 같은 publisher를 위의 최종 28문서 구조로 확장한다.

## 7. ETF 계산

ETF는 해당 `valuationVersion`의 구성 club 가격을 동일 가중으로 계산한다.

`etfPrice = halfUp(sum(component currentPrice) / componentCount)`

등락률도 ETF의 `previousClose` 대비 정수 bp다. 모든 club은 정확히 하나의 ETF에만 편입된다. 스포츠 ETF는 구성 종목이 `volleyball-love` 하나여서 그 가격과 같고 분산 효과가 없음을 UI와 문서에 표시한다. 부분 성공 회차가 있으면 새 ETF를 공개하지 않는다. 마지막 정상 ETF의 `stale`은 `sourcePriceAsOf`가 최대 지연을 넘었는지로 판단한다.

## 8. 거래와 가격의 경합

- 거래 transaction은 `clubs/{clubId}` 가격을 읽지만 쓰지 않고, user별 문서와 10개 중 한 demand shard를 쓴다. 인기 종목의 단일 club 문서를 매 거래마다 쓰지 않는다.
- 원자 publish transaction이 club을 쓰는 순간 겹친 거래는 충돌 감지 후 최신 가격으로 자동 재시도된다. 체결 응답에는 실제 `executionPrice`를 반환한다.
- 시장 정지나 폐장 cutoff는 거래가 읽는 `market/state.status`를 `halted` 또는 `closed`로 변경한다. 이전 상태로 시작한 transaction은 commit 전에 충돌해 새 상태를 보고 거부된다.
- 운영 중 shard count를 즉시 바꾸지 않는다. 새 window에서 `shardCount`와 configVersion을 함께 고정한다.

수백 명 테스트에서 10샤드로도 transaction retry와 p95 지연이 높다면 개장 전 샤드 수를 늘린다. 무제한 샤드는 가격 회차 읽기 비용을 선형 증가시키므로 측정 없이 확대하지 않는다.

## 9. 지연, stale, 장애 정책

- 정상 목표: 매 60초 새 가격 회차 완료.
- 최대 허용: 이전 정상 가격 `priceCalculatedAt` 기준 120초. 일반 `updatedAt`은 freshness에 절대 사용하지 않는다.
- 120초 초과 시 UI는 갱신 지연을 표시하고 거래 함수는 `price-stale`로 신규 체결을 fail-closed 한다.
- 스케줄 중복은 같은 run ID로 no-op한다. 부분 실패는 완료되지 않은 club만 재시도한다.
- 입력 digest가 같은데 출력이 다르면 결정성 위반으로 시장을 정지하고 배포·설정 버전을 조사한다.
- 샤드 합계가 음수, 타입 오류, 예상 shard 누락, 비정상 미래 별점 시각, 설정 버전 불일치이면 그 club 가격을 갱신하지 않는다.
- 두 회 연속 최대 지연, 다수 club 실패, 가격 불변 조건 위반은 전체 시장 자동 halt 후보이며 운영자가 원인을 확인한 뒤 명시적으로 재개한다.
- 마지막 정상 가격을 유지하는 것은 허용하지만 오래된 가격으로 체결하는 것은 허용하지 않는다.

복구는 동일 window/run ID 재실행을 우선한다. 완료 run을 삭제하거나 새 ID로 같은 입력을 다시 적용하지 않는다. 잘못 적용된 가격은 Firestore 콘솔 직접 수정이 아니라 감사되는 교정 이벤트/복구 함수로 처리한다.

## 10. 비용 상한

기본 가격 회차의 수요 읽기는 `20 clubs × 10 shards = 200 shard reads`에 고정된다. 여기에 20개 별점/club 입력, 활성 이벤트 제한 쿼리, 20개 run/club 쓰기, 6개 ETF 투영이 더해진다. 전체 `trades` 스캔이나 사용자별 holdings 스캔은 없다.

운영 전 개장 분을 곱해 가격 엔진 read/write 예산을 산정하고 무료/유료 한도와 별도로 경보를 둔다. 이벤트 쿼리는 시간·상태·대상 수를 제한하고, price run과 닫힌 창의 보존/TTL은 감사 기간 확정 뒤 적용한다.

## 11. 랭킹·자산 가격 연계

가격 회차 완료 뒤 별도 파생 작업이 보유 종목을 현재 회차로 평가해 `estimatedTotalAsset`과 `leaderboardEntries`를 갱신한다. 화면 요청마다 모든 사용자와 holdings를 읽어 계산하지 않는다. 목표 60초, 최대 120초 지연이다.

랭킹 투영은 사용한 `valuationVersion`을 명시한다. 일부 사용자가 이전 가격 버전인 동안 공개 current를 바꾸지 않거나 `stale`로 유지해 혼합 버전 랭킹을 정상값처럼 보이지 않게 한다. 폐장 finalization은 모든 자산이 폐장 가격 버전으로 평가된 뒤 한 번만 수행한다.

## 12. 필수 테스트

### 순수 계산/golden vector

- count 0 중립 별점, 1개 극단 별점, prior count 경계, 평균 1·3·5
- freshness 10분 직전/정확히/직후, 30분 경계, null·미래 시각
- 매수·매도 없음, 1주 단독, 균형 수요, 순매수·순매도 포화, 매우 큰 정수
- 단일/중첩/상쇄 관리자 이벤트, 시작·종료 경계, 합산 상한
- fundamental 수요 이동, rating/admin target 합성, 현재가 ±200bp 이동 상한, 100원 최저가, half-up 신호 경계와 toward-zero 가격 delta 경계. 특히 125원에서 200bp tick 상한은 2원, 120bp 수요 상한은 1원이어야 하고 실제 bp가 설정 상한을 넘지 않아야 한다.
- 100원에서 음의 state premium 시작·종료, 원 단위로 반올림되어 가격이 그대로인 target, 상한 밖 target의 다중 tick 수렴이 비대칭·숨은 carry를 만들지 않는지
- 같은 입력 digest와 configVersion의 반복 결과 byte-level 동일성

### 통합/Emulator

- 10개 샤드 합계와 전역 거래 원장 표본 일치
- 창 회전과 동시에 들어온 거래가 구/신 창에 중복·누락되지 않음
- 같은 스케줄 호출·run 동시 실행이 가격 한 번만 반영
- club 한 개 실패 후 재시도로 ETF가 혼합 회차를 공개하지 않음
- publish 직전/중단/충돌에서 20 clubs의 `lastPriceWindowId`와 6 ETFs의 `valuationVersion`이 전부 이전 또는 전부 새 회차이고 혼합되지 않음
- 가격 갱신과 거래 동시 실행 시 최신 서버 가격으로 원자 체결
- 시장 halt/closed cutoff와 거래 경합에서 정지 후 신규 commit 없음
- 120초 stale 시 체결 거부, 복구 후 명시적 재개
- 공식 20개 모두 동일 설정, ETF 6개 전체 구성 정확성

### 부하·운영

- 수백 명이 한 종목에 동시에 매수/매도할 때 transaction retry, p50/p95/p99, 오류율, 샤드 편중
- 20개 종목 동시 수요에서 회차가 120초 안에 끝나는지
- 예상 축제 시간 전체의 Firestore 읽기·쓰기와 Functions 호출 비용
- 함수 kill/timeout, 중복 전달, 네트워크 단절, lease 만료 후 안전한 재개

## 13. 운영 전 확정할 사항

- 실제 개장·폐장 시각과 `FESTIVAL_TIMEZONE`
- 주문당 수량 상한, 사용자별 호출 제한, 가격 stale 자동 halt 기준
- 100주 demand liquidity floor와 10샤드의 부하 테스트 결과
- 별점 API의 점수 범위, 집계 의미, 최신성 시각, 장애·재전송 계약
- 이벤트 impact의 운영 승인 절차와 최대 지속 시간
- 폐장 기준가·finalization 및 이의 제기/보존 기간

이 값이 정해지기 전에는 개발 기본값을 운영 확정값처럼 표시하지 않는다.
