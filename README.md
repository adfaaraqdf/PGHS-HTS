# 📈 가상 주식 거래 플랫폼 (Virtual Stock Market Node)

> **동아리 축제 및 행사를 위한 실시간 가상 주식 거래 웹 애플리케이션입니다.** > 참가자들은 가상 자산을 이용해 동아리 부스 주식 및 ETF를 실시간으로 매매하며 자산을 증식할 수 있습니다. 높은 변동성과 실시간 데이터 동기화를 통해 몰입감 넘치는 경험을 제공합니다.
## 이 프로젝트가 잘된다면 다른 학교들도 쓸수있게 탬플릿화 할 계획
---

## ✨ 주요 기능 (Key Features)

### 1. 실시간 주가 변동 엔진
* **수요와 공급 기반 변동**: 유저들의 매수/매도 주문량에 따라 주가가 즉각적으로 반응합니다.
* **고변동성 모드 (High Volatility)**: 축제용 활성화를 위해 가중치 파라미터를 높여 주가의 폭등 및 폭락을 유도하고, 주기적인 랜덤 노이즈를 섞어 변동성을 극대화합니다.

### 2. ETF (상장지수펀드) 시스템
* 여러 개별 종목을 테마별로 묶은 ETF 상품을 제공합니다.
* 기초 자산(개별 주식)의 가격 변동 및 설정된 가중치에 따라 ETF 가격이 실시간으로 산출됩니다.

### 3. 실시간 매매 및 자산 관리
* 시장가 매수/매도 기능을 지원합니다.
* 유저별 보유 자산(예수금), 포트폴리오(보유 주식 및 수익률)를 한눈에 확인할 수 있는 대시보드를 제공합니다.

---

## 🛠 기술 스택 (Tech Stack)

* **Frontend**: React.js / Tailwind CSS (or Next.js)
* **Backend**: Node.js (Express)
* **Database & Realtime**: Firebase Realtime Database (또는 Supabase)
* **Deployment**: Vercel (Frontend) / Render (Backend)

---

## 🗄 데이터베이스 구조 (Data Structure - 큰 틀)

### `users`
```json
{
  "userId": {
    "username": "김시후",
    "cash": 1000000,
    "stocks": {
      "STOCK_A": { "quantity": 10, "avgPrice": 5000 },
      "ETF_VCC": { "quantity": 5, "avgPrice": 12000 }
    }
  }
}

