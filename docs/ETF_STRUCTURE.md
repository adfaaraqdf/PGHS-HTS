# ETF 구조

## 제품 계약

- ETF는 1차 버전에서 **조회 전용 지수**다. ETF 주문, 보유량, 체결, 현금 결제는 없다.
- 공식 ETF는 정확히 6개이며 아래 JSON이 정본이다. ID·표시명·구성 순서를 제공된 원문 그대로 유지한다.
- 각 동아리는 정확히 하나의 ETF에 한 번만 속한다. 구성 종목은 동일 가중이며 임의 가중치·보너스를 두지 않는다.
- ETF projection은 서버가 구성 종목의 검증된 가격으로 계산한다. 클라이언트는 계산값을 기록할 수 없다.
- 스포츠 ETF는 구성 종목이 하나뿐이므로 분산 효과가 없다. 화면에 이 사실을 명시하고 분산 투자 상품처럼 오인시키지 않는다.

## 공식 목록 (`officialEtfCatalog`)

```json
[
  {
    "id": "etf-tech-engineering",
    "displayName": "IT·공학 ETF",
    "componentClubIds": [
      "mechanism",
      "invelix",
      "architecture",
      "dynamics"
    ]
  },
  {
    "id": "etf-natural-science",
    "displayName": "자연과학 ETF",
    "componentClubIds": [
      "rechem",
      "mercury",
      "chemist"
    ]
  },
  {
    "id": "etf-culture-media",
    "displayName": "문화예술·미디어 ETF",
    "componentClubIds": [
      "neon",
      "art-canvas",
      "moment",
      "broadcasting"
    ]
  },
  {
    "id": "etf-humanities-social",
    "displayName": "인문사회·교육 ETF",
    "componentClubIds": [
      "geulbitnuri",
      "insight",
      "paradigm",
      "teachist",
      "world-scope",
      "heartbeat"
    ]
  },
  {
    "id": "etf-business-startup",
    "displayName": "경영·창업 ETF",
    "componentClubIds": [
      "startup-patent-lab",
      "reve"
    ]
  },
  {
    "id": "etf-sports",
    "displayName": "스포츠 ETF",
    "componentClubIds": [
      "volleyball-love"
    ]
  }
]
```

## 구성 요약

| ETF ID | 표시명 | 종목 수 | 구성 ID |
|---|---|---:|---|
| `etf-tech-engineering` | IT·공학 ETF | 4 | `mechanism`, `invelix`, `architecture`, `dynamics` |
| `etf-natural-science` | 자연과학 ETF | 3 | `rechem`, `mercury`, `chemist` |
| `etf-culture-media` | 문화예술·미디어 ETF | 4 | `neon`, `art-canvas`, `moment`, `broadcasting` |
| `etf-humanities-social` | 인문사회·교육 ETF | 6 | `geulbitnuri`, `insight`, `paradigm`, `teachist`, `world-scope`, `heartbeat` |
| `etf-business-startup` | 경영·창업 ETF | 2 | `startup-patent-lab`, `reve` |
| `etf-sports` | 스포츠 ETF | 1 | `volleyball-love` |
| 합계 |  | **20** | 중복 없이 공식 동아리 전체 |

## 계산 계약

시점 `t`의 구성 종목 수를 `N`, 종목 현재가를 원 단위 정수 `Pᵢ(t)`, 종목 기준가를 `Bᵢ`라 한다.

```text
ETF currentPrice       = roundHalfUp(sum(Pᵢ(t)) / N)
ETF previousClose      = roundHalfUp(sum(Bᵢ) / N)
ETF priceChange        = currentPrice - previousClose
ETF priceChangeRate    = previousClose > 0
                         ? roundHalfUp(priceChange * 10_000 / previousClose)
                         : 0
```

- `priceChangeRate` 단위는 basis point이며 `100`이 1.00%다.
- 모든 가격·변동액·등락률 저장값은 정수다. 음의 ETF 가격은 허용하지 않는다.
- `roundHalfUp`은 정확히 절반이면 0에서 먼 방향으로 반올림하는 결정적 정수 연산이다. 구현에서는 부동소수점 누적이 아니라 정수 합과 명시적 반올림을 사용한다.
- 모든 종목이 같은 초기 가격과 기준 가격을 가지므로 모든 ETF 역시 같은 초기값을 가진다. 구성 종목 수가 다른 ETF에 규모 보정이나 가중치 보너스를 주지 않는다.
- 구성 종목 가격이 아직 없거나 유효하지 않으면 일부 종목만으로 지수를 계산하지 않는다. 마지막 정상 projection을 `stale: true`로 유지하거나 값 전체를 unavailable로 처리하고 오류를 관측한다.
- 시장 또는 종목 거래 정지는 구성에서 제거한다는 뜻이 아니다. 정지 종목의 마지막 서버 확정 가격을 포함하고 최신성 시각을 노출한다.

## PostgreSQL projection 최소 계약

`public.etfs`의 `id=etf_id` 행은 서버 소유 projection이며 다음 필드를 갖는다. 상세 타입·소유권은 `DATA_CONTRACTS.md`가 정본이다.

| 필드 | 계약 |
|---|---|
| `id`, `displayName` | 공식 정본 값 |
| `componentClubIds` | 공식 ID의 중복 없는 고정 배열 |
| `weightingMethod` | `"equal"` |
| `currentPrice`, `previousClose`, `priceChange`, `priceChangeRate` | 위 수식으로 계산한 정수 |
| `componentCount` | 배열 길이와 동일 |
| `isTradable` | 항상 `false` |
| `isDiversified` | 구성 수가 2 이상일 때만 `true`; 스포츠 ETF는 `false` |
| `calculatedAt`, `sourcePriceAsOf` | 서버 Timestamp |
| `valuationVersion` | 20개 구성 가격과 동일한 공개 회차 ID |
| `stale` | 허용 최대 지연 초과 또는 입력 이상 여부 |
| `isFinal` | 폐장 최종 projection 여부 |
| `schemaVersion` | 양의 정수 |

클라이언트는 ETF 문서를 읽을 수 있으나 생성·수정·삭제할 수 없다. ETF 화면은 허용 최대 지연을 넘긴 값을 실시간이라고 표현하지 않으며 마지막 갱신 시각과 지연 상태를 보인다.

## 시드 및 CI 검증

1. ETF 배열 길이와 서로 다른 ID 수가 6이다.
2. `componentClubIds` 총 길이는 20이고 전체 집합 크기도 20이다.
3. 모든 구성 ID가 `CLUB_CATALOG.md`에 존재하고 누락·중복·미등록 ID가 없다.
4. 각 club의 `etfId`가 자신을 포함하는 ETF ID와 일치한다.
5. `rechem`, `invelix`, `neon`만 구성 ID로 사용하고 별칭을 구성 ID로 쓰지 않는다.
6. `etf-sports`는 `volleyball-love` 하나만 포함하고 `isDiversified: false`다.
7. 모든 ETF의 `weightingMethod`는 `equal`, `isTradable`은 `false`다.
8. 같은 구성 가격 입력은 실행 순서와 무관하게 같은 정수 결과를 생성한다.
