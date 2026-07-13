# Cloud Firestore 스키마

## 1. 설계 규칙

- 문서 ID와 필드 이름은 이 문서를 단일 기준으로 삼는다. 모든 주요 문서에는 양의 정수 `schemaVersion`을 둔다.
- 돈·가격·수량·거래량·순위는 정수다. 비율은 정수 basis point(bp, 100bp = 1%)로 저장한다. 시간은 서버 `Timestamp`다.
- 사용자 자산과 시장 파생값은 Admin SDK를 사용하는 서버만 쓴다. 클라이언트 입력은 서버 원장의 필드로 그대로 복사하지 않는다.
- 무한히 커지는 배열은 금지한다. 거래·뉴스·이벤트·감사 로그는 개별 문서와 cursor pagination을 사용한다. 예외는 구성원이 최대 7개인 ETF 구성과 항목이 최대 10개인 공개 랭킹이다.
- 삭제가 회계 의미를 없애는 원장 문서는 삭제하지 않는다. 사용자 탈퇴·계정 정지는 상태로 표현한다.
- 문서 ID에 이메일, 닉네임, 실명 같은 개인정보를 넣지 않는다. 서버 발급 무작위 `publicId`는 내부 tie-break에만 사용하고 공개 화면·payload에 내보내지 않는다.
- `createdAt`, `updatedAt`, `executedAt` 등 권위 시각은 서버에서 기록한다.

## 2. 컬렉션 개요

| 경로 | 성격 | 클라이언트 접근 |
|---|---|---|
| `users/{uid}` | 비공개 사용자 자산 요약 | 본인 제한 읽기, 쓰기 금지 |
| `users/{uid}/holdings/{clubId}` | 비공개 보유 종목 | 본인 제한 읽기, 쓰기 금지 |
| `users/{uid}/tradeHistory/{tradeId}` | 본인용 불변 체결 이력 | 본인 페이지 읽기, 쓰기 금지 |
| `publicProfiles/{uid}` | 서버 내부 공개정보 원본 | 직접 목록 읽기·쓰기 금지 |
| `clubs/{clubId}` | 공식 종목과 서버 가격 투영 | 인증된 학교 사용자 읽기, 쓰기 금지 |
| `etfs/{etfId}` | 조회 전용 ETF 투영 | 인증된 학교 사용자 읽기, 쓰기 금지 |
| `trades/{tradeId}` | 전역 불변 거래 원장 | 클라이언트 접근 금지 |
| `tradeRequests/{requestId}` | idempotency 결과 | 클라이언트 접근 금지 |
| `ratings/{clubId}` | 서버 정규화 별점 집계 | 인증된 학교 사용자 읽기, 쓰기 금지 |
| `news/{newsId}` | 뉴스·공지 | 제한 쿼리 읽기, 쓰기 금지 |
| `adminEvents/{eventId}` | 가격 영향 이벤트 | 활성 제한 쿼리 읽기, 쓰기 금지 |
| `auditLogs/{logId}` | append-only 감사 원장 | 클라이언트 접근 금지 |
| `leaderboardEntries/{uid}` | 내부 전체 랭킹 엔트리 | 클라이언트 접근 금지; `getMyRank` callable만 사용 |
| `publicLeaderboard/current` | 공개 TOP 10 투영 | 단일 문서 읽기, 쓰기 금지 |
| `market/config` | 공통 시장·가격 설정 | 인증된 학교 사용자 읽기, 쓰기 금지 |
| `market/state` | 시장 상태·활성 창 | 인증된 학교 사용자 읽기, 쓰기 금지 |
| `marketDemand/{clubId}/windows/{windowId}` | 종목·회차 수요 메타 | 클라이언트 접근 금지 |
| `marketDemand/{clubId}/windows/{windowId}/shards/{shardId}` | 10개 고정 수요 샤드 | 클라이언트 접근 금지 |
| `priceRuns/{windowId_clubId}` | 가격 회차 결과·idempotency | 클라이언트 접근 금지 |
| `priceVersions/{windowId}` | 20종목 원자 publish barrier | 클라이언트 접근 금지 |
| `rateLimits/{uid}/windows/{command_window}` | 사용자·명령별 호출 제한 | 클라이언트 접근 금지 |
| `serviceLeases/{leaseId}` | 가격·랭킹·폐장 fencing lease | 클라이언트 접근 금지 |
| `adminAuthorizations/{uid}`, `adminApprovals/{approvalId}` | 실시간 역할·2인 승인 | 클라이언트 접근 금지 |
| `closureRuns/{closureId}` | 폐장 멱등 workflow | 클라이언트 접근 금지 |
| `finalMarketSnapshots/{closureId}` | 불변 최종 결과 | 서버/callable 제한 읽기, 쓰기 금지 |

### 간단한 주식 서비스 모델 대응

아래는 서비스의 핵심을 `stock`, `news`, `holding` 세 모델로 단순화해 본 대응표다. 실제 구현은 Firestore 문서 경로를 관계 키로 사용하므로, `user_id`와 `stock_id`를 여러 필드에 중복 저장하지 않는다.

| 개념 모델 | Firestore 경로 | 최소 필드 | 실제 필드 대응 |
|---|---|---|---|
| `stock` | `clubs/{clubId}` | `id`, `name`, `price` | `id`, `displayName`, `currentPrice` |
| `news` | `news/{newsId}` | `id`, `title`, `content`, `stock_id`, `created_at` | 문서 ID, `title`, `body`, `clubId`, `createdAt` |
| `holding` | `users/{uid}/holdings/{clubId}` | `id`, `user_id`, `stock_id`, `quantity` | 문서 경로의 `uid`·`clubId`, `clubId`, `quantity` |

- `stock_id`는 이 서비스에서 `clubId`다. 전체 뉴스는 `clubId=null`을 사용한다.
- holding 문서의 ID는 `clubId`다. 사용자 ID는 상위 경로의 `uid`이므로 별도 `userId` 필드를 만들지 않는다.
- 실제 종목 문서는 가격·거래량·상태·ETF·별점 같은 모의주식 운영 필드를 추가로 가진다.

## 3. 사용자와 거래 원장

### `users/{uid}`

| 필드 | 타입 | 제약/의미 |
|---|---|---|
| `schemaVersion` | integer | 양수 |
| `uid` | string | 문서 ID 및 Auth UID와 동일, 불변 |
| `displayName` | string | 인증 토큰에서 얻은 실명, 비공개 |
| `nickname` | string | 서버 검증을 통과한 표시명 |
| `cash` | integer | 0 이상 원 단위, 최초 1회 1,000,000 |
| `estimatedTotalAsset` | integer | 0 이상 서버 투영값 |
| `accountStatus` | string | `active`, `disabled`, `suspended` |
| `initialGrantApplied` | boolean | 최초 지급과 같은 transaction에서 true, 이후 불변 |
| `assetValuationAt` | Timestamp 또는 null | 총자산 평가 기준 시각 |
| `createdAt` | Timestamp | 최초 생성 시각, 불변 |
| `updatedAt` | Timestamp | 서버 변경 시각 |
| `lastLoginAt` | Timestamp | 서버가 검증한 최종 로그인 시각 |

이메일은 권한 판단 시 최신 Auth 토큰에서만 사용하고 기본 스키마에는 저장하지 않는다. 향후 운영상 저장이 필요하면 개인정보 승인과 계약 버전 변경이 선행돼야 한다. 사용자 문서에 holdings나 거래 목록 배열을 넣지 않는다.

### `users/{uid}/holdings/{clubId}`

| 필드 | 타입 | 제약/의미 |
|---|---|---|
| `schemaVersion` | integer | 양수 |
| `clubId` | string | 문서 ID와 동일, 공식 club 존재 |
| `quantity` | integer | 1 이상. 전량 매도 시 문서 삭제 |
| `averageBuyPrice` | integer | 1원 이상, 매수 가중평균의 원 단위 half-up |
| `updatedAt` | Timestamp | 마지막 체결 시각 |

매도 시 잔여 수량의 `averageBuyPrice`는 유지한다. 0수량 문서를 남기지 않아 holdings 조회량을 제한한다. 평가액·손익은 current valuationVersion의 club 가격으로 파생해 매분 모든 holding을 다시 쓰는 비용을 피한다.

### `users/{uid}/tradeHistory/{tradeId}`

| 필드 | 타입 | 제약/의미 |
|---|---|---|
| `schemaVersion` | integer | 양수 |
| `tradeId` | string | 전역 거래 ID와 동일 |
| `side` | string | `buy` 또는 `sell` |
| `clubId` | string | 공식 club ID |
| `quantity` | integer | 양수 |
| `executionPrice` | integer | 서버 체결 가격, 1원 이상 |
| `grossAmount` | integer | `quantity × executionPrice`, 0보다 큼 |
| `cashAfter` | integer | 체결 후 현금, 0 이상 |
| `holdingQuantityAfter` | integer | 체결 후 수량, 0 이상 |
| `averageBuyPriceAfter` | integer 또는 null | 전량 매도면 null |
| `executedAt` | Timestamp | 서버 체결 시각 |

개인 이력은 `executedAt desc`, 동일 시각 안정 정렬용 문서 ID를 cursor로 페이지네이션한다. 수정·삭제하지 않는다.

### `trades/{tradeId}`

전역 거래 원장은 서버 감사·복구 전용이다. 필드는 `schemaVersion`, `tradeId`, `uid`, `clubId`, `side`, `quantity`, `executionPrice`, `grossAmount`, `idempotencyDigest`, `cashBefore`, `cashAfter`, `holdingQuantityBefore`, `holdingQuantityAfter`, `averageBuyPriceBefore`, `averageBuyPriceAfter`, `demandWindowId`, `shardId`, `configVersion`, `executedAt`이다. 클라이언트는 단건·목록 모두 읽을 수 없다. 성공 체결만 기록하며 실패 요청을 거래로 위장하지 않는다.

### `tradeRequests/{requestId}`

`requestId`는 서버가 `uid + idempotencyKey`를 단방향 해시한 결정적 ID다. 원본 키나 이메일을 문서 ID에 노출하지 않는다.

| 필드 | 타입 | 제약/의미 |
|---|---|---|
| `schemaVersion` | integer | 양수 |
| `uid` | string | 요청자 Auth UID |
| `idempotencyDigest` | string | 원본 키를 노출하지 않는 digest |
| `payloadDigest` | string | side·clubId·quantity 정규화 해시 |
| `side`, `clubId`, `quantity` | string/string/integer | 재호출 payload 일치 검사용 |
| `status` | string | `succeeded` 또는 `rejected`; 미완료 성공 상태 금지 |
| `tradeId` | string 또는 null | 성공 시 거래 ID |
| `result` | map | 허용된 결과 필드만 가진 bounded map |
| `errorCode` | string 또는 null | 저장한 업무 거부의 안전한 코드 |
| `createdAt` | Timestamp | 최초 처리 시각 |
| `completedAt` | Timestamp | terminal 확정 시각 |
| `expiresAt` | Timestamp | idempotency 보존 종료 후보 시각 |

성공 결과와 자산 쓰기는 같은 트랜잭션에 있다. 같은 키·같은 payload digest는 저장 결과를 반환하고, 같은 키·다른 digest는 `duplicate-request`로 거부한다. 일시적 내부 오류는 terminal 문서를 만들지 않는다. TTL은 축제 종료 후 재시도·감사 보존 기간이 지난 문서만 대상으로 하며 운영 중에는 삭제하지 않는다.

## 4. 공개 프로필과 랭킹

### `publicProfiles/{uid}`

서버 내부 투영 원본이다. `schemaVersion`, opaque `publicId`, `nickname`, `accountStatus`, `createdAt`, `updatedAt`만 허용한다. UID가 경로에 있으므로 클라이언트 목록 쿼리는 전면 거부한다. `displayName`, 이메일, 현금, holdings는 넣지 않는다.

### `leaderboardEntries/{uid}`

| 필드 | 타입 | 제약/의미 |
|---|---|---|
| `schemaVersion` | integer | 양수 |
| `uid` | string | 내부 키, 공개 금지 |
| `publicId` | string | 서버 발급 opaque ID |
| `nickname` | string | 공개 표시명 |
| `estimatedTotalAsset` | integer | 서버 평가액 |
| `rank` | integer | 1 이상 competition rank |
| `valuationVersion` | string | 사용한 가격 회차 |
| `calculatedAt` | Timestamp | 계산 시각 |

클라이언트 단건·목록 읽기를 모두 거부한다. `getMyRank` callable이 token UID로 이 문서를 읽고 식별자를 제거한 응답만 반환한다.

### `publicLeaderboard/current`

| 필드 | 타입 | 제약/의미 |
|---|---|---|
| `schemaVersion` | integer | 양수 |
| `entries` | array | 정확히 0~10개의 bounded map |
| `entries[].nickname` | string | 공개 표시명 |
| `entries[].estimatedTotalAsset` | integer | 0 이상 |
| `entries[].rank` | integer | competition rank |
| `valuationVersion` | string | 가격 회차 |
| `updatedAt` | Timestamp | 갱신 시각 |
| `maxStalenessSeconds` | integer | 현재 기본 120 |
| `isFinal` | boolean | 폐장 최종본 여부 |

동점은 동일 총자산이면 같은 rank를 공유한다. 상위 10개 잘라내기의 안정 정렬은 내부 `estimatedTotalAsset desc`, `publicId asc`지만 공개 entries에는 `publicId`를 복사하지 않는다. 폐장 최종본은 별도 불변 snapshot ID로 서버 보관하고 `current`가 그 버전을 가리키게 한다.

## 5. 종목·ETF·별점

### `clubs/{clubId}`

이 컬렉션은 일반 관계형 DB의 `Stocks` 테이블 역할을 한다. 다만 이 서비스는 한국 학교 축제용 단일 모의 시장이므로, 종목마다 반복될 필요가 없는 국가·통화·시장 정보는 공통 설정으로 관리한다. 문서 ID는 자동 증가 정수가 아니라 변경되지 않는 공식 문자열 ID(`rechem`, `mechanism` 등)다.

| 일반 Stocks 필드 | Firestore 종목 필드 | 적용 방식 |
|---|---|---|
| `id` (integer PK) | 문서 ID + `id` | 공식 문자열 `clubId`를 사용하며, 문서 ID와 `id`는 같아야 한다. |
| `symbol` | `id` | 별도 숫자 종목 코드를 만들지 않고 공식 `clubId`를 검색·참조 코드로 쓴다. |
| `name` | `displayName` | 학생에게 보이는 동아리명이다. |
| `market` | `market/state` | 모든 종목이 하나의 축제 모의 시장을 공유하므로 종목별 필드가 아니다. |
| `sector` | `category` | 동아리 분야·성격이다. |
| `country` | 공통값 `KR` | 한국 학교 서비스의 고정 전제라 종목마다 저장하지 않는다. |
| `currency` | 공통값 `KRW` | 모든 돈·가격은 원 단위 정수로 저장한다. |
| `created_at`, `updated_at` | `createdAt`, `updatedAt` | 서버가 기록하는 Firestore `Timestamp`다. |

주식 서비스에 필요한 시장 전용 필드는 `currentPrice`, `previousClose`, `priceChange`, `priceChangeRate`, `issuedShares`, `marketCap`, `buyVolume`, `sellVolume`, `totalVolume`, `tradingStatus`로 추가한다.

| 필드 | 타입 | 제약/의미 |
|---|---|---|
| `schemaVersion` | integer | 양수 |
| `id` | string | 문서 ID와 동일, 공식 20개 중 하나 |
| `displayName` | string | 공식 명칭 |
| `aliases` | array<string> | bounded 별칭; 별도 종목 생성 금지 |
| `category`, `description` | string | 공식 카탈로그 값 |
| `etfId` | string | 공식 ETF 1개를 참조 |
| `logoUrl`, `imageUrl` | string 또는 null | 제공 전 null |
| `boothLocation`, `operatingHours` | string 또는 null | 제공 전 null |
| `isActive` | boolean | 초기 true |
| `tradingStatus` | string | `open`, `halted`, `closed` |
| `currentPrice` | integer | 초기 10,000, 최소 100 |
| `fundamentalPrice` | integer | 수요로만 이동하는 엔진 기준가, 초기 10,000, 최소 100 |
| `basePrice` | integer | 공통 기준 10,000 |
| `previousClose` | integer | 개발 seed 10,000 |
| `priceChange` | integer | `currentPrice - previousClose` |
| `priceChangeRate` | integer | previousClose 대비 bp |
| `issuedShares` | integer | 공통 100,000 |
| `marketCap` | integer | `currentPrice × issuedShares` |
| `buyVolume`, `sellVolume`, `totalVolume` | integer | 누적 서버 투영, 초기 0 |
| `averageRating` | number | 1.0~5.0, seed 3.0 |
| `averageRatingMilli` | integer | 가격 계산용 1,000~5,000, seed 3,000 |
| `ratingCount` | integer | 0 이상, seed 0 |
| `ratingRecentDelta` | number | 유한 범위, seed 0 |
| `ratingRecentDeltaMilli` | integer | 가격 계산용 signed milli-star, seed 0 |
| `lastRatingAt` | Timestamp 또는 null | seed null |
| `lastPriceWindowId` | string 또는 null | 마지막 적용 회차 |
| `priceCalculatedAt` | Timestamp | 가격 freshness의 유일 기준; 가격 publish만 갱신 |
| `createdAt`, `updatedAt` | Timestamp | 일반 서버 시각; freshness 판정에 사용하지 않음 |

20개 모두 같은 `market/config`의 초기값으로 seed한다. `Re:chem/리켐`, `invelix/인벨릭스`, `neon/네온`은 각각 한 문서의 별칭이다.

### `ratings/{clubId}`

`schemaVersion`, `clubId`, 표시용 `averageRating`, 계산용 정수 `averageRatingMilli`, `ratingCount`, 표시용 `ratingRecentDelta`, 계산용 정수 `ratingRecentDeltaMilli`, `lastRatingAt`, `sourceUpdatedAt`, `ingestedAt`, `sourceCursor`를 둔다. 공급자 규격 확정 전에는 3.0/3000, 개수 0, 변화량 0, source·last 시각 null인 중립값이다. 가격 엔진은 milli-star 필드만 사용한다.

### `etfs/{etfId}`

`schemaVersion`, `id`, `displayName`, bounded `componentClubIds`, `componentCount`, `weightingMethod="equal"`, `isTradable=false`, `isDiversified`, `currentPrice`, `previousClose`, `priceChange`, `priceChangeRate`, `valuationVersion`, `calculatedAt`, `sourcePriceAsOf`, `updatedAt`, `stale`, `isFinal`을 둔다. 가격은 구성 종목 현재가 합계/종목 수의 half-up 정수다. 모든 club은 정확히 하나의 ETF에 속하고 중복 편입되지 않는다. 스포츠 ETF는 `isDiversified=false`다.

## 6. 시장·이벤트·뉴스

### `market/config`

운영자가 임의 클라이언트 쓰기를 할 수 없는 버전 설정이다.

| 필드 | 개발 기본값 |
|---|---:|
| `schemaVersion`, `configVersion` | 양의 정수 |
| `initialPrice`, `basePrice`, `previousClose` | 10,000원 |
| `issuedShares` | 100,000주 |
| `initialVolume` | 0 |
| `minPrice` | 100원 |
| `demandShardCount` | 10 |
| `priceTickSeconds` | 60 |
| `maxPriceDelaySeconds` | 120 |
| `maxTickChangeBps` | 200 |
| `maxRatingContributionBps` | 50 |
| `maxDemandContributionBps` | 120 |
| `maxAdminContributionBps` | 60 |
| `ratingPriorMeanMilli`, `ratingPriorCount` | 3,000, 20 |
| `ratingScaleHalfRangeMilli`, `ratingRecentFullScaleMilli` | 2,000, 1,000 |
| `ratingLevelWeightPermille`, `ratingRecentWeightPermille` | 700, 300; 합 1,000 |
| `demandLiquidityFloorShares` | 100 |
| `ratingFreshMinutes`, `ratingZeroMinutes` | 10, 30 |
| `rankingTickSeconds`, `maxRankingDelaySeconds` | 60, 120 |
| `maxOrderQuantity` | 운영 전 확정 placeholder |
| `ratioRoundingMode`, `boundedDeltaRoundingMode` | `half-up`, `toward-zero` |
| `festivalTimezone` | 운영 전 확정 IANA timezone placeholder |
| `updatedAt` | 서버 Timestamp |

가격 계수 전체, 랭킹 주기, 허용 가격 나이, 축제 타임존도 이 문서 또는 서버 환경의 단일 버전 설정으로 관리한다. 각 종목별 계수 재정의는 금지한다.

### `market/state`

`schemaVersion`, `status`(`open|halted|closed`), `reason`, `activeDemandWindowId`, `currentPriceWindowId`, `configVersion`, `openedAt`, `haltedAt`, `closedAt`, `scheduledOpenAt`, `scheduledCloseAt`, `timezone`, `updatedAt`을 둔다. 개장 전은 `closed`이면서 `openedAt=null`이다. 폐장 단계는 `closureRuns`로 분리한다. 학생이 읽는 이 문서에는 `updatedBy` 같은 관리자 식별자를 넣지 않으며 거래 함수는 `status=open`일 때만 체결한다.

### `news/{newsId}`

`schemaVersion`, `scope`(`global|club`), `clubId`(global이면 null), `title`, `body`, `isBreaking`, `isPublished`, `publishedAt`, `expiresAt`, `createdAt`, `updatedAt`을 둔다. 관리자 UID는 감사 로그에만 두고 학생이 읽는 문서에는 넣지 않는다.

### `adminEvents/{eventId}`

`schemaVersion`, `impactType`(`positive|negative`), `targetClubIds`(공식 ID bounded 목록), `impactBps`(0 이상, 부호는 impactType), `startsAt`, `endsAt`, `status`, 공개 가능한 `reason`, `createdAt`, `updatedAt`을 둔다. 관리자 UID는 감사 로그에만 둔다. 활성 이벤트의 합은 제한된 temporary premium을 만들며 개별·합산 상한은 `market/config`로 검증한다.

### `auditLogs/{logId}`

`schemaVersion`, `action`, `actorUid`, `targetType`, `targetId`, `reason`, `beforeDigest`, `afterDigest`, `correlationId`, `createdAt`을 둔다. 필요 시 검증된 redacted change summary만 bounded map으로 추가한다. 서버 create-only이며 수정·삭제하지 않는다.

## 7. 수요 샤드와 가격 회차

### `marketDemand/{clubId}/windows/{windowId}`

`schemaVersion`, `clubId`, `windowId`, `status`(`open|closed|applied`), `shardCount`(해당 창에서 고정), `openedAt`, `closedAt`, `configVersion`, `appliedAt`을 둔다.

### `marketDemand/{clubId}/windows/{windowId}/shards/{shardId}`

샤드 ID는 `00`~`09`다. `schemaVersion`, `buyQuantity`, `sellQuantity`, `buyTradeCount`, `sellTradeCount`, `grossBuyAmount`, `grossSellAmount`, `updatedAt`만 둔다. 모두 0 이상 정수다. 거래 요청의 결정적 해시로 샤드를 골라 동일 요청 재시도가 다른 샤드에 중복 반영되지 않게 한다.

### `priceRuns/{windowId_clubId}`

`schemaVersion`, `windowId`, `clubId`, `status`, `configVersion`, `inputDigest`, 각 샤드 합계, milli-star 별점 입력, 정렬된 `adminEventIds` bounded 목록, `demandBps`, `desiredRatingPremiumBps`, `desiredAdminPremiumBps`, `oldFundamentalPrice`, `newFundamentalPrice`, `targetPrice`, `downBound`, `upBound`, `appliedChangeBps`, `oldPrice`, `newPrice`, `startedAt`, `completedAt`, `attemptCount`, `errorCode`를 둔다. 동일 ID의 `completed` 결과는 다시 가격에 적용하지 않는다.

### 원자 가격 publish와 내부 제어 문서

- `priceVersions/{windowId}`: `status`(`computing|ready|published|failed`), `completedClubCount`, `configVersion`, `sourceWindowId`, `inputDigest`, `publishedAt`, `schemaVersion`. 20개 `priceRuns`가 완료되기 전에는 ready가 될 수 없다.
- 5단계 pre-ETF publish transaction은 알려진 20개 run과 이전 version을 확인한 뒤 20개 `clubs`, `market/state.currentPriceWindowId`, version 상태를 한 번에 커밋한다. 7단계 최종 프로토콜은 ETF 후보 6개를 추가해 총 28개 문서를 함께 커밋한다. 회차 계산은 transaction 밖에서 하지만 해당 단계에서 공개되는 가격은 혼합 회차가 되지 않는다.
- `serviceLeases/{leaseId}`: `purpose`, `owner`, 증가하는 `fencingToken`, `leaseExpiresAt`, `updatedAt`, `schemaVersion`.
- `rateLimits/{uid}/windows/{command_window}`: `command`, `count`, `windowStartedAt`, `expiresAt`, `schemaVersion`.

### 관리자 승인과 폐장

- `adminAuthorizations/{uid}`: bounded `roles`, `active`, `claimVersion`, `grantedAt`, `revokedAt`, `updatedAt`, `schemaVersion`.
- `adminApprovals/{approvalId}`: `action`, `targetDigest`, `requestedBy`, 서로 다른 `approvedBy`, `status`(`pending|approved|consumed|expired`), `expiresAt`, `createdAt`, `approvedAt`, `consumedAt`, `schemaVersion`.
- `closureRuns/{closureId}`: `status`(`pending|running|ready|finalized`), `cutoffAt`, `inputWindowId`, final version 3종, `checksum`, `approvalId`, 단계별 시각, `errorCode`, `schemaVersion`.
- `finalMarketSnapshots/{closureId}`: 최종 가격·ETF·TOP10 또는 immutable 참조, counts, config/catalog/release hash, cutoff, checksum, createdAt, schemaVersion. create 후 수정·삭제하지 않는다.

## 8. 필수 인덱스

실제 쿼리와 함께 최소 인덱스만 배포한다.

- `clubs`: `isActive` + `currentPrice`, `isActive` + `priceChangeRate`, `isActive` + `totalVolume`
- `news`: `isPublished` + `publishedAt desc`; 필요 시 `scope`/`clubId` + `isPublished` + `publishedAt desc`
- `adminEvents`: `status` + `startsAt`; 종료 판정용 `status` + `endsAt`
- `leaderboardEntries`: `estimatedTotalAsset desc` + `publicId asc` (서버 계산 전용)
- 사용자 `tradeHistory` collection group이 아니라 본인 하위 컬렉션의 `executedAt desc`

인덱스가 없다는 이유로 보안 범위를 넓히거나 전체 컬렉션을 읽지 않는다.

## 9. 삭제·보존·마이그레이션

- 거래 원장, 개인 거래 이력, 폐장 최종 랭킹, 관리자 감사 로그는 축제 운영 보존 정책이 확정될 때까지 자동 삭제하지 않는다.
- idempotency·완료된 수요 창·price run TTL은 축제 종료 후 감사/이의제기 기간보다 길게 설정하고 운영 중 TTL을 활성화하지 않는다.
- 뉴스는 `expiresAt` 이후 화면에서 제외하되 감사 필요 시 즉시 삭제하지 않는다.
- 스키마 변경은 `schemaVersion`과 별도 migration run ID로 추적한다. 운영 문서 전체 덮어쓰기가 아니라 허용 필드의 서버 마이그레이션을 사용한다.
- 공식 seed는 기본 create-if-absent다. `--force`와 명시적 프로젝트 확인 없이는 기존 운영 가격·자산·상태를 덮어쓰지 않는다.

## 10. 스키마 불변 조건 점검

- 현금과 holding 수량은 음수가 될 수 없다.
- 가격·돈·수량·거래량은 정수이고 가격은 최소 100원이다.
- 거래 한 건의 사용자 자산, 개인 이력, 전역 원장, idempotency 결과, 수요 샤드 증가는 함께 성공하거나 함께 실패한다.
- `marketCap = currentPrice × issuedShares`, `totalVolume = buyVolume + sellVolume`이다.
- 클럽 20개는 동일 초기 가격·기준가·발행량·시총·거래량·계수를 사용한다.
- ETF 6개 구성의 합집합은 공식 club ID 20개와 같고 교집합 중복은 없다.
- 공개 TOP 10에는 UID, 이메일, `displayName`, 현금, holdings, 내부 tie key가 없다.
- 관리자/서버 생성 문서는 일반 클라이언트가 생성·수정·삭제할 수 없다.
