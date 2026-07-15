# 데이터 계약

## 1. 목적과 적용 원칙

이 문서는 클라이언트, Cloud Functions, Firestore, 시드와 테스트가 공유하는 논리 계약이다. 실제 컬렉션 배치와 인덱스는 `FIRESTORE_SCHEMA.md`, 접근 제어는 `SECURITY_MODEL.md`, 가격 수식은 `PRICE_ENGINE.md`를 함께 따른다.

### 1.1 공통 타입과 단위

| 종류 | 계약 |
|---|---|
| ID | 비어 있지 않은 문자열. 공식 club/ETF ID는 카탈로그 값만 허용한다. UID를 공개 식별자로 사용하지 않는다. |
| 돈·절대 가격 | 대한민국 원 단위의 안전한 정수. `NaN`, 무한대, 소수, 음수는 허용하지 않는다. 최소 가격은 `PRICE_ENGINE.md`를 따른다. `priceChange`, 손익처럼 의미상 부호가 필요한 파생값만 음의 정수를 허용한다. |
| 수량·거래량·개수·순위 | 안전한 정수. 보유량·거래량·개수는 0 이상, 주문 수량은 1 이상이다. |
| 등락률 | `priceChangeRate`라는 정수 basis point. `100 = 1.00%`, `10_000 = 100%`다. |
| 별점 | 1.0~5.0 범위의 유한 number를 입력 규격 확정 후 사용한다. 집계 평균은 number, 평가 수는 정수다. |
| 시간 | 저장은 Firestore `Timestamp`, 생성·권한·체결·집계 시각은 서버 시각이다. 클라이언트 Date/string을 권위 있는 값으로 쓰지 않는다. |
| nullable | 아직 없거나 제공되지 않은 값은 명시적으로 `null`; 빈 문자열, 가짜 URL, 추정값으로 대체하지 않는다. |
| enum | 문서에 열거된 소문자 값만 허용하고 알 수 없는 값은 안전하게 거부한다. |
| 버전 | 영속 문서와 API 응답은 양의 정수 `schemaVersion`; 파괴적 변경은 새 버전·마이그레이션·롤백을 요구한다. |

정수 계산은 서버에서 overflow를 검사한다. 평균·비율·표시용 등락률은 결정적 `roundHalfUp`, bp 상한이 있는 원 단위 가격 delta는 `truncTowardZero`를 사용한다. JSON 예시의 `Timestamp`는 설명 표기이며 실제 문자열 저장을 뜻하지 않는다.

### 1.2 데이터 소유권

- **client writable:** 원칙적으로 없음. 닉네임 변경, 거래, 관리 작업도 검증된 서버 함수 경유다.
- **server authoritative:** 사용자 자산, holdings, 거래, 가격·거래량, 별점 집계, ETF, 랭킹, 뉴스·이벤트, 시장 상태, 감사 로그.
- **immutable:** 완료 거래와 감사 로그는 생성 후 수정·삭제하지 않는다. 정정이 필요하면 새 보정 이벤트를 추가한다.
- **public bounded projection:** 공개 시장 데이터, 뉴스, ETF, TOP 10만 제한된 projection으로 제공한다.
- **private:** 이메일·실명·UID 연결, 현금, holdings, 거래 내역, 계정 상태는 본인과 승인된 서버/운영자만 접근한다.

Admin SDK가 Rules를 우회한다는 사실 때문에 모든 서버 함수가 인증·권한·타입·범위·상태를 자체 검증해야 한다.

## 2. 공통 enum

| 이름 | 값 | 의미 |
|---|---|---|
| `accountStatus` | `active`, `suspended`, `disabled` | 거래 가능, 임시 제한, 비활성 |
| `tradingStatus` | `open`, `halted`, `closed` | 종목 거래 가능, 일시 정지, 종료 |
| `marketStatus` | `open`, `halted`, `closed` | 시장 전체 상태 |
| `tradeSide` | `buy`, `sell` | 매수, 매도 |
| `requestStatus` | `succeeded`, `rejected` | 같은 원자 경계에서 확정된 멱등 요청의 terminal 상태. 일시적 내부 오류는 문서를 만들지 않는다. |
| `eventImpactType` | `positive`, `negative` | 호재, 악재 |
| `eventStatus` | `scheduled`, `active`, `ended`, `cancelled` | 이벤트 수명주기 |
| `newsScope` | `global`, `club` | 전체 또는 종목 소식 |

Enum 변경은 클라이언트 fallback과 Rules/Functions 동시 배포를 요구한다.

## 3. 인증 및 사용자 계약

### 3.1 `users/{uid}` — 비공개 계정·자산 projection

| 필드 | 타입/제약 | 소유권 |
|---|---|---|
| `uid` | 문서 ID와 같은 Google UID | 서버, 불변 |
| `displayName` | 인증 토큰 기반 이름 | 서버, 비공개 |
| `nickname` | trim/NFC 후 서버 정책을 통과한 문자열 | 서버 함수 |
| `cash` | 0 이상 원 단위 정수; 최초 1회 `1_000_000` | 거래/초기화 서버 |
| `estimatedTotalAsset` | 0 이상 원 단위 정수 projection | 집계 서버 |
| `accountStatus` | enum | 관리자 서버 |
| `initialGrantApplied` | boolean; 한 번 `true`가 되면 되돌리지 않음 | 초기화 서버 |
| `assetValuationAt` | 총자산 projection의 기준 서버 Timestamp 또는 `null` | 랭킹 서버 |
| `createdAt`, `updatedAt`, `lastLoginAt` | 서버 Timestamp | 서버 |
| `schemaVersion` | 양의 정수 | 서버 |

보유 종목, 평균 매수가, 거래 기록은 무한 배열로 넣지 않고 아래 subcollection으로 저장한다. 사용자 문서 초기 생성과 `initialGrantApplied: true`, `cash: 1_000_000`은 하나의 원자적 초기화 경계에서 처리한다. UID만으로는 한 학생의 복수 학교 계정을 합칠 수 없다.

### 3.2 `users/{uid}/holdings/{clubId}` — 보유 종목

| 필드 | 타입/제약 |
|---|---|
| `clubId` | 문서 ID와 같고 공식 20개 중 하나 |
| `quantity` | 1 이상의 정수; 0이 되면 문서를 삭제하는 정책 |
| `averageBuyPrice` | 1 이상의 원 단위 정수 |
| `updatedAt` | 마지막 거래의 서버 Timestamp |
| `schemaVersion` | 양의 정수 |

매수 후 평균가는 `roundHalfUp((oldQuantity*oldAverage + buyQuantity*executionPrice) / newQuantity)`다. 매도 시 남은 수량의 평균가는 유지한다. 전량 매도 시 holding을 삭제한다. 종목별 평가액·손익은 이 문서에 매분 쓰지 않고 권위 holding과 `market/state.currentPriceWindowId`에 속한 club 가격으로 화면/서버가 계산한다. 사용자 문서, holding, trade, tradeRequest 결과는 같은 Firestore transaction의 원자 경계에서 확정한다.

### 3.3 `users/{uid}/tradeHistory/{tradeId}`

본인 조회용 immutable projection이다. 필드는 `tradeId`, `clubId`, `side`, `quantity`, `executionPrice`, `grossAmount`, `cashAfter`, `holdingQuantityAfter`, `averageBuyPriceAfter`(전량 매도면 `null`), `executedAt`, `schemaVersion`이다. 서버만 생성하며 최신순 cursor pagination과 고정 page limit을 사용한다.

### 3.4 닉네임과 공개 프로필

`publicProfiles/{uid}`와 `leaderboardEntries/{uid}`는 문서 경로 자체가 UID를 노출하므로 **내부 projection**이다. 클라이언트의 collection list와 타 사용자 direct get을 금지한다. 이 문서에도 이메일·실명은 넣지 않으며 `nickname`, 비식별 `publicId`, 필요한 집계값, Timestamp, `schemaVersion`만 둔다.

`publicId`는 서버가 생성한 고엔트로피 opaque ID이며 UID의 평문·접두사·가역 암호문·단순 해시가 아니다. 닉네임 중복 허용 여부와 길이·금지어 정책은 `DECISIONS.md`에서 운영 전 확정하되, 이메일 형식·제어 문자·bidi 제어 문자·공백만 있는 값은 항상 거부한다.

## 4. 공식 시장 데이터

### 4.1 `clubs/{clubId}`

| 필드 | 타입/제약 |
|---|---|
| `id`, `displayName`, `aliases`, `category`, `description`, `etfId` | `CLUB_CATALOG.md`의 원문 정본 |
| `logoUrl`, `imageUrl`, `boothLocation`, `operatingHours` | 현재 모두 `null`; 확인된 정보만 nullable string으로 변경 |
| `isActive` | 초기 `true` |
| `tradingStatus` | 초기 `open`; enum |
| `currentPrice`, `fundamentalPrice`, `basePrice`, `previousClose` | 원 단위 양의 정수; 개발 seed는 모두 10,000. fundamental은 수요로만 이동하는 엔진 기준가 |
| `priceChange` | `currentPrice - previousClose`인 signed 원 단위 정수 |
| `priceChangeRate` | basis point 정수 |
| `issuedShares` | 모든 종목에 같은 양의 정수 |
| `marketCap` | overflow를 검사한 `currentPrice * issuedShares` 정수 |
| `buyVolume`, `sellVolume`, `totalVolume` | 0 이상 정수 projection; `totalVolume = buyVolume + sellVolume` |
| `averageRating` | 초기 `3.0`; 집계 number |
| `averageRatingMilli` | 가격 계산용 정수 milli-star; 초기 `3000` |
| `ratingCount` | 초기 `0`; 0 이상 정수 |
| `ratingRecentDelta` | 초기 `0`; 유한 number |
| `ratingRecentDeltaMilli` | 가격 계산용 signed milli-star 정수; 초기 `0` |
| `lastRatingAt` | 초기 `null`, 이후 서버 Timestamp |
| `lastPriceWindowId` | 마지막 공개 가격 회차 ID 또는 `null` |
| `priceCalculatedAt` | 가격 엔진만 갱신하는 freshness 기준 서버 Timestamp |
| `createdAt`, `updatedAt` | 일반 서버 Timestamp; 가격 freshness 판정에는 사용하지 않음 |
| `schemaVersion` | 양의 정수 |

`ratingCount == 0`이면 UI는 `averageRating`을 실제 평가처럼 표시하지 않고 “평가 없음”으로 표시한다. 가격 엔진은 3.0 prior를 중립 신호로 사용한다. 클라이언트는 club 문서의 어떤 필드도 쓸 수 없다.

### 4.2 `etfs/{etfId}`

| 필드 | 타입/제약 |
|---|---|
| `id`, `displayName`, `componentClubIds` | `ETF_STRUCTURE.md` 정본 |
| `componentCount` | 배열 길이와 같은 양의 정수 |
| `weightingMethod` | `equal` |
| `isTradable` | 항상 `false` |
| `isDiversified` | componentCount > 1; 스포츠 ETF는 `false` |
| `currentPrice`, `previousClose`, `priceChange` | 원 단위 정수 |
| `priceChangeRate` | basis point 정수 |
| `valuationVersion` | 모든 구성 가격이 속한 동일 회차 ID |
| `calculatedAt`, `sourcePriceAsOf`, `updatedAt` | 서버 Timestamp |
| `stale` | boolean |
| `isFinal` | 폐장 최종 projection 여부 |
| `schemaVersion` | 양의 정수 |

동일 가중 계산과 반올림은 `ETF_STRUCTURE.md`의 수식을 따른다. 일부 구성 종목을 누락한 채 계산하지 않는다. ETF 거래 API는 존재하지 않는다.

### 4.3 `ratings/{clubId}`

`clubId`, 표시용 `averageRating: 3.0`, 가격 계산용 정수 `averageRatingMilli: 3000`, `ratingCount: 0`, 표시용 `ratingRecentDelta: 0`, 계산용 `ratingRecentDeltaMilli: 0`, `lastRatingAt: null`, `sourceUpdatedAt: null`, `ingestedAt`, `sourceCursor: null`, `schemaVersion`을 가진 서버 소유 집계다. 외부 점수는 먼저 1,000~5,000 milli-star 정수로 정규화하며 가격 엔진은 number projection을 입력으로 사용하지 않는다. 기존 별점 API 규격이 확정되기 전에는 임의 응답 형식이나 개인 평가 레코드를 만들지 않는다. 외부 재전송은 provider event ID/cursor로 멱등 처리하고 잘못된 범위·역행 시각·중복을 격리한다.

## 5. 거래 계약

### 5.1 Callable 요청

`buyStock`와 `sellStock`은 같은 입력 형태만 허용한다.

```json
{
  "clubId": "mechanism",
  "quantity": 3,
  "idempotencyKey": "client-generated-opaque-key"
}
```

| 필드 | 검증 |
|---|---|
| `clubId` | 공식 club ID, 활성 문서 존재 |
| `quantity` | 1 이상의 안전한 정수, 설정된 주문 상한 이하 |
| `idempotencyKey` | 사용자 작업당 새 고엔트로피 문자열; 서버 허용 길이 16~128자, 문자 `[A-Za-z0-9_-]` |

추가 필드는 거부한다. 가격, 총액, 수수료, UID, 보유량, 현금, 관리자 여부, 체결 시각은 요청으로 받지 않는다. Auth token의 UID·검증 이메일·도메인과 서버 문서를 사용한다.

### 5.2 성공 응답

```json
{
  "ok": true,
  "tradeId": "opaque-trade-id",
  "side": "buy",
  "clubId": "mechanism",
  "quantity": 3,
  "executionPrice": 10000,
  "grossAmount": 30000,
  "cashAfter": 970000,
  "holdingQuantityAfter": 3,
  "averageBuyPriceAfter": 10000,
  "executedAt": "<server Timestamp serialized by callable>",
  "schemaVersion": 1
}
```

동일 UID·idempotencyKey·동일 payload의 재호출은 자산을 다시 변경하지 않고 저장된 성공 결과를 반환한다. 같은 키를 다른 side/clubId/quantity에 재사용하면 `duplicate-request` 또는 `conflict`로 거부한다. 네트워크 응답 유실 뒤 재시도도 이 규칙을 따른다.

클라이언트는 기본적으로 `crypto.randomUUID()`로 키를 만들고 요청이 진행 중인 같은 side·club 버튼을 잠근다. 네트워크 오류가 재시도 가능으로 반환되면 같은 키를 보존해 재호출한다. 서버의 길이·문자 검증은 키 생성기의 실제 난수 품질을 증명하지 않으므로 승인된 클라이언트 생성기를 바꾸지 않는다.

### 5.3 `trades/{tradeId}` — 내부 immutable 원장

`tradeId`, `uid`, `clubId`, `side`, `quantity`, `executionPrice`, `grossAmount`, `idempotencyDigest`, `cashBefore`, `cashAfter`, `holdingQuantityBefore`, `holdingQuantityAfter`, `averageBuyPriceBefore`, `averageBuyPriceAfter`, `demandWindowId`, `shardId`, `configVersion`, `executedAt`, `schemaVersion`을 저장한다. 일반 클라이언트는 전역 collection을 읽거나 쓸 수 없다. `uid`와 원장 잔액은 공개 projection으로 복사하지 않는다.

### 5.4 `tradeRequests/{requestId}` — 중복 방지

`requestId`는 raw key를 경로에 노출하지 않는 서버 digest다. 문서는 `uid`, `idempotencyDigest`, `payloadDigest`, `side`, `clubId`, `quantity`, terminal `status`, `tradeId`, bounded `result`, `errorCode`, `createdAt`, `completedAt`, `expiresAt`(보존 정책 전 null), `schemaVersion`을 가진다. `succeeded` 결과와 자산 변경은 같은 transaction에 있고, 저장하기로 한 업무 거부만 자산 변경 없이 `rejected`로 확정한다. 현재 4단계는 성공만 terminal 저장하며 업무 거부와 일시적 내부 오류를 성공 문서로 가장하지 않아 같은 키로 재시도할 수 있다.

### 5.5 오류 계약

Callable 오류는 안정된 코드와 사용자에게 안전한 메시지, 선택적 `retryable`, `requestId`만 반환한다. 내부 stack, 이메일, UID, 잔액 전체, 문서 경로를 노출하지 않는다.

`unauthenticated`, `permission-denied`, `account-disabled`, `market-closed`, `trading-halted`, `club-not-found`, `invalid-quantity`, `insufficient-funds`, `insufficient-holdings`, `duplicate-request`, `conflict`, `resource-exhausted`, `internal`을 기본 코드로 사용한다. `internal`은 사용자에게 재시도 안내를 주되 서버 로그의 correlation ID로 원인을 추적한다.

## 6. 시장 설정·상태·집계

### 6.1 `market/config`

모든 종목이 공유하는 서버 소유 설정 문서다. 최소 필드는 `initialPrice`, `basePrice`, `previousClose`, `issuedShares`, `initialVolume`, `minPrice`, `maxPrice`, `demandShardCount`, `priceTickSeconds`, `maxPriceDelaySeconds`, `rankingTickSeconds`, `maxRankingDelaySeconds`, `maxTickChangeBps`, `maxRatingContributionBps`, `maxDemandContributionBps`, `maxAdminContributionBps`, `ratingPriorMeanMilli`, `ratingPriorCount`, `ratingScaleHalfRangeMilli`, `ratingRecentFullScaleMilli`, `ratingLevelWeightPermille`, `ratingRecentWeightPermille`, `demandLiquidityFloorShares`, `ratingFreshMinutes`, `ratingZeroMinutes`, `priceHistoryLimit`, `maxActiveAdminEvents`, `maxOrderQuantity`(운영 전 확정), `ratioRoundingMode`, `boundedDeltaRoundingMode`, `festivalTimezone`, `configVersion`, `schemaVersion`, `updatedAt`이다. 두 별점 가중치 합은 1,000이어야 한다. 개발 기준선은 10샤드, 가격·랭킹 60초/최대 120초이며 구체 값과 이유는 `DECISIONS.md`가 정본이다.

`maxOrderQuantity`는 양의 안전 정수가 아니면 거래가 fail-closed한다. `activeDemandWindowId`, config version, 열린 종목별 window가 서로 일치하지 않아도 거래를 확정하지 않는다.

### 6.2 `market/state`

`status`(`open|halted|closed`), `reason`, `activeDemandWindowId`, `processingPriceWindowId`, `currentPriceWindowId`, `configVersion`, `openedAt`, `haltedAt`, `closedAt`, `scheduledOpenAt`, `scheduledCloseAt`, `timezone`, `updatedAt`, `schemaVersion`을 가진 서버 소유·학생 읽기 projection이다. `processingPriceWindowId`는 재시도해야 할 닫힌 창을 잃지 않게 하며 게시 transaction에서만 null로 돌아간다. 행위자 UID는 공개 문서에 넣지 않고 `auditLogs`에만 둔다. 개장 전은 `closed`이면서 `openedAt=null`이다. 새 거래 transaction은 이 문서를 읽어 `status=open`인 경우에만 체결한다.

### 6.3 제한된 수요 집계

`marketDemand/{clubId}/windows/{windowId}` 메타는 `clubId`, `windowId`, `status`(`open|closed|applied`), `shardCount`, `openedAt`, `closedAt`, `appliedAt`, `configVersion`, `schemaVersion`을 가진다. 하위 `shards/{shardId}`는 `buyQuantity`, `sellQuantity`, `buyTradeCount`, `sellTradeCount`, `grossBuyAmount`, `grossSellAmount`, `updatedAt`, `schemaVersion`을 가진다. shard는 서버가 결정하고 `[0, shardCount)` 범위이며 현재 공통 설정은 10이다. 거래가 없어서 생성되지 않은 예상 샤드는 0으로 계산하고, 존재하는 잘못된 샤드는 fail-closed한다. 가격 계산은 닫힌 고정 window와 고정 shard 경로만 읽고 전체 `trades`를 스캔하지 않는다.

4단계 거래는 `clubs.buyVolume/sellVolume/totalVolume`을 직접 갱신하지 않는다. 수요 샤드는 거래와 같은 transaction이라 즉시 일치하고, 공개 club 거래량은 다음 가격 회차 자료화 때까지 지연 가능한 projection이다.

### 6.4 가격 회차와 원자 publish

`priceRuns/{windowId_clubId}`는 한 club의 idempotent 후보 계산으로서 canonical `inputDigest`, config/window/club ID, bounded `input` snapshot, 결정론적 `result`, `pending|completed` 상태와 시각을 가진다. `priceVersions/{windowId}`는 `computing|ready|published`, 예상/완료 club 수, config/input digest, 단계별 시각을 가진 barrier다. 5단계 프로토콜은 20개 run 완료 뒤 단일 transaction으로 20개 `clubs`, 최근 60개만 가진 20개 `priceHistory`, 닫힌 창 20개의 applied 상태, `market/state.currentPriceWindowId/processingPriceWindowId`, version 상태를 함께 갱신한다. 7단계부터 같은 publisher에 ETF 후보 6개를 추가한다. 어느 프로토콜에서도 계산 중 또는 publish 실패 시 공개 문서는 모두 이전 회차를 유지한다.

## 7. 랭킹 계약

### 7.1 내부 데이터

`leaderboardEntries/{uid}`는 `uid`, 내부 tie-break용 `publicId`, `nickname`, `estimatedTotalAsset`, `rank`, `valuationVersion`, `calculatedAt`, `schemaVersion`을 가진 서버 전용 문서다. 다른 사용자 자산을 읽을 수 없고 클라이언트 collection list는 금지한다. `publicId`는 공개 payload에 복사하지 않는다.

### 7.2 공개 TOP 10

`publicLeaderboard/current`는 다음 bounded projection만 포함한다.

```json
{
  "entries": [
    {
      "nickname": "학생닉네임",
      "estimatedTotalAsset": 1000000,
      "rank": 1
    }
  ],
  "updatedAt": "<server Timestamp>",
  "maxStalenessSeconds": 120,
  "valuationVersion": "price-window-id",
  "isFinal": false,
  "schemaVersion": 1
}
```

`entries`는 최대 10개인 유한 배열이며 각 항목은 `nickname`, `estimatedTotalAsset`, `rank`만 공개한다. 이메일·UID·실명·`publicId`·내부 tie key는 금지한다. 자산이 같으면 같은 경쟁 순위(예: 1, 1, 3)를 부여하고, 정확히 10개 경계의 안정 정렬에만 내부 `publicId`를 사용한다. 갱신 목표 60초, 허용 최대 지연 120초를 넘으면 stale 상태를 표시한다.

### 7.3 내 순위

본인 순위는 인증 callable `getMyRank`로만 제공한다. 함수는 token UID의 내부 entry만 읽고 응답에 `rank`, `estimatedTotalAsset`, `calculatedAt`, `stale`, `schemaVersion`만 포함한다. 클라이언트는 `leaderboardEntries`를 직접 읽지 않는다.

## 8. 뉴스, 관리자 이벤트와 감사 로그

### 8.1 `news/{newsId}`

`title`, `body`, `scope`, `clubId`(`scope=club`일 때 공식 ID, 그 외 `null`), `isBreaking`, `isPublished`, `publishedAt`, `expiresAt`(nullable), `createdAt`, `updatedAt`, `schemaVersion`을 가진다. 학생이 읽는 문서에는 관리자 UID를 넣지 않는다. 공개 읽기는 게시 상태·기간·고정 limit 쿼리로 제한하고 쓰기는 관리자 서버만 한다.

### 8.2 `adminEvents/{eventId}`

`impactType`, `targetClubIds`(공식 ID의 중복 없는 제한 배열), `startsAt`, `endsAt`, `impactBps`(0 이상이며 부호는 impactType으로 결정), `status`, 공개 가능한 `reason`, `createdAt`, `updatedAt`, `schemaVersion`을 가진다. 학생이 읽는 문서에는 관리자 UID를 넣지 않는다. `startsAt < endsAt`, 영향도는 공통 상한 이하, 대상은 최소 1개다.

### 8.3 `auditLogs/{logId}`

`action`, `actorUid`, `targetType`, `targetId`, `reason`, `beforeDigest`, `afterDigest`, `correlationId`, 선택적 redacted `changeSummary`, `createdAt`, `schemaVersion`을 가진 추가 전용 문서다. 민감 토큰과 서비스 계정 정보는 기록하지 않는다. 일반 사용자와 관리자 클라이언트 모두 수정·삭제할 수 없다.

### 8.4 내부 권한·승인·제한·lease

- `adminAuthorizations/{uid}`: `roles` bounded map, `active`, `claimVersion`, `grantedAt`, `revokedAt`, `updatedAt`, `schemaVersion`. 관리자 함수는 token role뿐 아니라 이 live 문서를 다시 읽어 회수 지연을 줄인다.
- `adminApprovals/{approvalId}`: `action`, `targetDigest`, `requestedBy`, 서로 다른 `approvedBy`, `status`(`pending|approved|consumed|expired`), `expiresAt`, `createdAt`, `approvedAt`, `consumedAt`, `schemaVersion`. 초기화·finalize·repair 등 고위험 작업은 승인자 2명이 달라야 한다.
- `rateLimits/{uid}/windows/{command_window}`: `command`, `count`, `windowStartedAt`, `expiresAt`, `schemaVersion`. 서버 transaction만 갱신하며 TTL은 집행 창보다 길다.
- `serviceLeases/{leaseId}`: `ownerId`, 증가하는 `fencingToken`, `leaseExpiresAt`, `updatedAt`, `schemaVersion`. 가격·랭킹·폐장 coordinator의 중복 실행을 막으며 만료 owner의 write는 fencing token으로 거부한다.

### 8.5 폐장 workflow와 최종 snapshot

`closureRuns/{closureId}`는 `status`(`pending|running|ready|finalized`), `cutoffAt`, `inputWindowId`, `finalPriceVersion`, `finalEtfVersion`, `finalLeaderboardVersion`, `checksum`, `approvalId`, `startedAt`, `readyAt`, `finalizedAt`, `errorCode`, `schemaVersion`을 가진 서버 전용 멱등 workflow다. `finalMarketSnapshots/{closureId}`는 가격·ETF·TOP10 결과 또는 그 immutable 참조, counts, config/catalog/release hash, cutoff, checksum, createdAt, schemaVersion을 보관하며 create 후 수정·삭제하지 않는다.

## 9. 초기화·시드 계약

- 초기화 함수는 Auth token에서 UID·이름·검증 이메일을 얻고 `ALLOWED_SCHOOL_DOMAIN`을 서버에서 확인한다.
- 성공 시 `schoolVerified=true` custom claim을 발급하고 token refresh를 요구한다. 이메일은 사용자 문서에 복제하지 않으며 Rules는 환경값 대신 이 claim과 본인/계정 상태를 검사한다.
- 최초 사용자 생성과 1,000,000원 지급은 멱등·원자적이며 클라이언트가 금액을 보내지 않는다.
- 공식 시드는 club 20개, ETF 6개, `market/config`, `market/state`, ratings 초기 projection만 만든다.
- 기본 대상은 Emulator다. 운영은 대상 project ID 표시와 명시적 확인이 필요하며 서비스 계정 키를 저장소에 넣지 않는다.
- 시드는 기본적으로 기존 문서를 덮어쓰지 않는다. `--dry-run`을 지원하고, `--force`일 때도 허용된 정본/설정 필드만 갱신하며 자산·거래·운영 가격을 파괴하지 않는다.
- 실행 전 카탈로그 ID, 별칭 충돌, ETF 합집합/중복, 공통 초기 조건을 검증하고 생성·건너뜀·갱신·실패 수를 보고한다.

## 10. 호환성, 쿼리와 수명주기

- 소비자는 알 수 없는 `schemaVersion`을 조용히 해석하지 않고 호환 오류와 갱신 안내를 제공한다.
- optional 필드 추가는 기존 독자가 무시할 수 있을 때만 하며 필수 필드 변경·단위 변경·enum 삭제는 새 버전이다.
- Snapshot Listener는 화면에 보이는 제한 쿼리에만 연결하고 화면 이탈 시 반드시 해제한다. 거래 내역은 cursor pagination, 뉴스/랭킹/시장 목록은 고정 limit을 쓴다.
- 무한 증가 배열을 금지한다. TOP 10 배열은 길이 10으로 계약상 bounded이므로 예외적으로 허용한다.
- TTL을 쓰더라도 tradeRequests 만료는 중복 재처리 위험이 없는 축제/재시도 보존 기간 뒤로 설정한다. trades와 auditLogs는 운영 보존 정책 확정 전 삭제하지 않는다.
- 모든 projection은 source 시각과 계산 시각을 가져 stale 여부를 판단할 수 있어야 한다.

## 11. 계약 검증 체크리스트

1. 필수/추가 필드, 타입, enum, 정수·범위, Timestamp와 `schemaVersion`을 Rules/함수 양쪽에서 검증한다.
2. 일반 사용자의 현금·holding·거래·club·rating·ETF·랭킹·뉴스·이벤트·시장 상태 직접 쓰기가 모두 거부된다.
3. 다른 사용자의 비공개 자산과 UID 기반 collection list가 거부된다.
4. 음수·소수·overflow, 가짜 UID/가격/권한/시각, 추가 필드가 거부된다.
5. 같은 idempotency key 동시 요청, 서로 다른 키 동시 요청, 응답 유실 재호출에서 정확히 한 번의 효과를 검증한다.
6. 시장/종목 정지와 거래 transaction 경합에서 정지 후 새 체결이 없다.
7. 20개 club·6개 ETF·20개 구성 합계·별칭 비중복·공통 초기값을 CI에서 검증한다.
8. 공개 TOP 10에 UID·이메일·실명·`publicId`가 없고 최대 10개이며 내 순위 접근은 본인으로 제한된다.
9. `ratingCount=0`에서 UI는 평가 없음, 엔진은 3.0 중립 prior로 처리한다.
10. 비용 경계를 넘는 무제한 listener, collection scan, 전체 거래 스캔이 없다.
