# PGHS HTS

판교고 축제용 모바일 모의 주식 서비스입니다. 공식 동아리 20개를 가상 자산으로 조회·거래하며 실제 화폐나 실제 증권과 연결하지 않습니다.

## 기술 구성

- Vite + Vanilla HTML/CSS/JavaScript
- Supabase Auth Google OAuth
- Supabase PostgreSQL, RLS, Realtime, Database Functions
- Supabase CLI local stack과 pgTAP
- 별도 정적 웹 호스팅(운영 공급자 미확정)

## 로컬 실행

Node.js 20 이상과 Docker가 필요합니다.

```sh
npm ci
cp .env.example .env.local
npm run supabase:start
npm run db:reset
npm run dev
```

Supabase local stack이 출력한 API URL과 publishable key를 `.env.local`의 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`에 입력합니다. Google OAuth local 테스트에는 별도의 Google client ID/secret 설정이 필요하며 secret은 커밋하지 않습니다.

## 검증

```sh
npm run lint
npm test
npm run build
npm run db:lint
npm run test:db
npm run seed:validate
```

스키마·RLS·RPC는 [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md), 보안 경계는 [SECURITY_MODEL.md](docs/SECURITY_MODEL.md), 공식 데이터는 [CLUB_CATALOG.md](docs/CLUB_CATALOG.md)와 [ETF_STRUCTURE.md](docs/ETF_STRUCTURE.md)를 따릅니다.

## 비밀정보

브라우저에는 Supabase URL과 publishable key만 둡니다. service-role/secret key, DB 비밀번호, Google OAuth secret, 관리자·별점 공급자 secret은 저장소와 클라이언트 번들에 넣지 않습니다.
