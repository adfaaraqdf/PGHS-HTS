# 공식 동아리 카탈로그

## 정본 규칙

- 이 문서의 `officialClubCatalog`가 공식 종목 정본이다. 개수는 **정확히 22개**이며 가상의 종목을 추가하지 않는다.
- `id`는 Firestore 문서 ID이자 영구 식별자다. 표시명 변경이 필요해도 ID를 재사용하거나 임의 변경하지 않는다.
- `displayName`, `aliases`, `category`, `description`, `etfId`는 제공된 원문을 그대로 유지한다.
- `aliases`는 검색·표시 보조값일 뿐 별도 종목이 아니다. `Re`와 `리켐`, `invelix`와 `인벨릭스`, `neon`과 `네온`은 각각 동일 종목이다.
- 검색 토큰은 Unicode NFC 정규화, 앞뒤 공백 제거, 영문 대소문자 무시를 적용할 수 있다. 서로 다른 동아리 사이에서 정규화된 ID·표시명·별칭이 충돌하면 시드를 중단한다.
- ETF 구성의 정본은 `ETF_STRUCTURE.md`이며, 아래 `etfId`와 양방향으로 일치해야 한다.

## 공식 목록 (`officialClubCatalog`)

```json
[
  {
    "id": "geulbitnuri",
    "displayName": "글빛누리",
    "aliases": [],
    "category": "인문·독서",
    "description": "문학, 역사, 철학, 사회과학을 탐구하며 인간과 사회를 이해하는 독서 동아리",
    "etfId": "etf-humanities-social"
  },
  {
    "id": "mechanism",
    "displayName": "메커니즘",
    "aliases": [],
    "category": "공학",
    "description": "관심 분야별 팀을 구성해 공학 프로젝트를 직접 기획하고 진행하는 동아리",
    "etfId": "etf-tech-engineering"
  },
  {
    "id": "insight",
    "displayName": "인사이트",
    "aliases": [],
    "category": "인문·사회",
    "description": "인문학과 사회과학 관점으로 사회 현상을 분석하고 탐구하는 동아리",
    "etfId": "etf-humanities-social"
  },
  {
    "id": "paradigm",
    "displayName": "패러다임",
    "aliases": [],
    "category": "사회문제·토론",
    "description": "우리나라 사회 문제를 탐구하고 해결 방안을 토론하는 동아리",
    "etfId": "etf-humanities-social"
  },
  {
    "id": "rechem",
    "displayName": "Re",
    "aliases": ["리켐"],
    "category": "화학",
    "description": "일상 속 현상을 화학 원리로 탐구하고 실험·토론하는 동아리",
    "etfId": "etf-natural-science"
  },
  {
    "id": "invelix",
    "displayName": "invelix",
    "aliases": ["인벨릭스"],
    "category": "코딩·개발",
    "description": "학교 사이트 개발, 서버 관리, 웹 서비스 운영을 하는 코딩 동아리",
    "etfId": "etf-tech-engineering"
  },
  {
    "id": "architecture",
    "displayName": "건축학부",
    "aliases": [],
    "category": "건축·디자인",
    "description": "건축물 스케치, 실내건축 디자인, 우드락 건축물 제작 등을 하는 동아리",
    "etfId": "etf-tech-engineering"
  },
  {
    "id": "mercury",
    "displayName": "머큐리",
    "aliases": [],
    "category": "과학 실험",
    "description": "물리·화학·생명·지구과학 분야별 실험과 심화 탐구를 진행하는 과학 동아리",
    "etfId": "etf-natural-science"
  },
  {
    "id": "neon",
    "displayName": "neon",
    "aliases": ["네온"],
    "category": "밴드·음악",
    "description": "수요음악회, 축제, 외부공연 등을 준비하고 공연하는 밴드 동아리",
    "etfId": "etf-culture-media"
  },
  {
    "id": "teachist",
    "displayName": "티치스트",
    "aliases": [],
    "category": "교육",
    "description": "수업 설계, 모의수업, 교육 이슈 탐구를 하는 교육 진로 동아리",
    "etfId": "etf-humanities-social"
  },
  {
    "id": "chemist",
    "displayName": "케미스트",
    "aliases": [],
    "category": "화학 실험",
    "description": "화학 실험과 탐구 활동으로 과학적 사고력과 문제 해결 능력을 기르는 동아리",
    "etfId": "etf-natural-science"
  },
  {
    "id": "art-canvas",
    "displayName": "아트 캔버스",
    "aliases": [],
    "category": "미술·디자인",
    "description": "드로잉, 채색, 디자인 작업 등 다양한 창작 활동을 하는 미술 동아리",
    "etfId": "etf-culture-media"
  },
  {
    "id": "startup-patent-lab",
    "displayName": "창업특허연구소",
    "aliases": [],
    "category": "창업·특허",
    "description": "아이디어를 특허와 창업으로 발전시키고 지식재산 실무를 탐구하는 동아리",
    "etfId": "etf-business-startup"
  },
  {
    "id": "moment",
    "displayName": "모멘트",
    "aliases": [],
    "category": "문화콘텐츠·마케팅",
    "description": "케이팝, 영화, 음식 등 문화콘텐츠의 산업 구조와 홍보 전략을 탐구하는 동아리",
    "etfId": "etf-culture-media"
  },
  {
    "id": "volleyball-love",
    "displayName": "배구사랑",
    "aliases": [],
    "category": "체육·배구",
    "description": "배구 기본기, 자체 경기, 타교 연습 경기, 대회 출전 등을 하는 체육 동아리",
    "etfId": "etf-sports"
  },
  {
    "id": "world-scope",
    "displayName": "월드 스코프",
    "aliases": [],
    "category": "세계문화·사회문화",
    "description": "세계 각국의 문화, 역사, 정치, 사회적 배경을 조사하고 비교 분석하는 동아리",
    "etfId": "etf-humanities-social"
  },
  {
    "id": "broadcasting",
    "displayName": "방송부",
    "aliases": [],
    "category": "방송·미디어",
    "description": "교내 방송을 관리하고 행사와 축제를 진행하는 방송 동아리",
    "etfId": "etf-culture-media"
  },
  {
    "id": "heartbeat",
    "displayName": "심장박동",
    "aliases": [],
    "category": "심리학",
    "description": "심리학을 바탕으로 다양한 진로 연계 활동과 봉사 프로젝트를 진행하는 동아리",
    "etfId": "etf-humanities-social"
  },
  {
    "id": "reve",
    "displayName": "레브",
    "aliases": [],
    "category": "경영·경제",
    "description": "주식 투자 분석, 마케팅 전략, 국제 경제·사회 이슈를 탐구하는 동아리",
    "etfId": "etf-business-startup"
  },
  {
    "id": "dynamics",
    "displayName": "다이나믹스",
    "aliases": [],
    "category": "공학 프로젝트",
    "description": "환경, 에너지, 로봇, 소프트웨어 등 자유 주제로 공학 프로젝트를 진행하는 동아리",
    "etfId": "etf-tech-engineering"
  },
  {
    "id": "geonetics",
    "displayName": "지오네틱스",
    "aliases": [],
    "category": "지구과학",
    "description": "판 구조, 대기와 해양, 우주 등을 탐구하는 지구과학 동아리",
    "etfId": "etf-natural-science"
  },
  {
    "id": "agora",
    "displayName": "아고라",
    "aliases": [],
    "category": "토론",
    "description": "윤리, 교육, 경영, 경제, 환경, 과학 등 다양한 주제로 토론하는 동아리",
    "etfId": "etf-humanities-social"
  }
]
```

## 시드 시 공통 확장값

위 정본 레코드에 다음 필드를 공통으로 합성한다. 가격·발행량 등 시장 값은 종목별로 작성하지 않고 `market/config`의 동일한 개발 기본값을 적용한다.

```json
{
  "logoUrl": null,
  "imageUrl": null,
  "boothLocation": null,
  "operatingHours": null,
  "isActive": true,
  "tradingStatus": "open",
  "averageRating": 3.0,
  "averageRatingMilli": 3000,
  "ratingCount": 0,
  "ratingRecentDelta": 0,
  "ratingRecentDeltaMilli": 0,
  "lastRatingAt": null,
  "schemaVersion": 1
}
```

`ratingCount: 0`이면 UI는 3.0점으로 표시하지 않고 **평가 없음**으로 표시한다. 표시용 number와 별도로 가격 엔진은 정수 milli-star 필드를 사용한다. 가격·`fundamentalPrice` 등 시장값은 이 JSON에 종목별로 반복하지 않고 공통 `market/config`에서 합성한다. 로고·이미지·부스 정보와 운영 시간은 외부 정보가 제공될 때까지 `null`을 유지한다.

## 자동 검증 불변 조건

1. 배열 길이와 서로 다른 `id` 수가 모두 22다.
2. 모든 `id`는 소문자 kebab-case이며 `/`를 포함하지 않는다.
3. `displayName`, `category`, `description`, `etfId`는 비어 있지 않고 `aliases`는 문자열 배열이다.
4. 정규화된 검색 토큰 충돌은 같은 club ID 내부에서만 허용된다.
5. `리켐`, `인벨릭스`, `네온`은 alias로만 존재하며 club ID나 추가 레코드로 존재하지 않는다.
6. 모든 `etfId`는 공식 ETF 6개 중 하나이며 `ETF_STRUCTURE.md`의 역방향 매핑과 일치한다.
7. 모든 종목의 초기 시장값과 계수는 공통 설정과 동일하다.
8. 기본 시드는 기존 운영 문서를 덮어쓰지 않고 멱등이며, 운영 실행은 대상 프로젝트 확인과 명시적 승인 없이는 실패한다.
