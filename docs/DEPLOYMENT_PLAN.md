# 배포 계획

## 1. 환경과 승인

local, staging, production은 서로 다른 Supabase 프로젝트를 사용한다. production migration, seed, Cron 활성화, 정적 웹 배포와 Git push는 각각 명시적 승인이 필요하다. 자동 테스트는 production을 대상으로 하지 않는다.

| 환경 | 데이터 | 목적 |
|---|---|---|
| local | Docker local stack + 고정 seed | 빠른 개발·pgTAP |
| staging | 비식별 시험 사용자 | OAuth·RLS·Realtime·Cron·부하·복구 |
| production | 실제 학교 계정 | 축제 운영 |

`supabase link --project-ref` 대상과 현재 계정을 명령 전 확인한다. 정적 웹은 별도 승인된 호스팅 프로젝트를 환경별로 분리한다.

## 2. 필수 운영 입력

- Supabase project ref·리전·요금제와 DB 백업/PITR 정책
- Google OAuth client ID/secret, callback URL, redirect allow list
- `ALLOWED_SCHOOL_DOMAIN=pangyo.hs.kr`
- 정적 호스팅 URL과 `VITE_SUPABASE_URL`, publishable key
- 축제 날짜·개장·폐장 시각·`Asia/Seoul`
- 관리자 역할·2인 승인 담당자·비상 연락망
- Cron, RPC rate limit, 예상 부하·예산 경보
- 개인정보·거래·감사·백업 보존 기간

placeholder가 남으면 production No-Go다.

## 3. 비밀

클라이언트 빌드에는 Supabase URL과 publishable key만 넣는다. 다음은 Supabase project secrets/Vault 또는 CI secret에만 둔다.

- service-role/secret key
- DB 비밀번호와 connection string
- Google OAuth secret
- 관리자 bootstrap과 별점 공급자 secret

로그에 값을 출력하지 않는다. `.env.example`은 이름과 placeholder만 가진다.

## 4. 사전 검증

```sh
npm ci
npm run lint
npm test
npm run build
npm run seed:validate
npm run supabase:start
npm run db:reset
npm run db:lint
npm run test:db
```

staging에서 다음을 추가 검증한다.

- Google 허용·외부 도메인·non-Google·미확인 이메일
- RLS allow/deny와 private schema 차단
- 초기 자금 1회, 동시 거래·응답 유실·시장 halt
- Realtime 채널 생성·해제와 20개 bounded query
- 가격 Cron 60초, 최대 지연 120초, lock 경쟁
- 20 clubs·6 ETFs·별칭·공통 초기 조건
- 모바일·접근성·오프라인·세션 만료
- 백업 복원과 거래 원장 reconciliation

## 5. 배포 순서

1. 대상 project ref·migration 상태·백업·현재 market 상태를 read-only 확인한다.
2. market을 `closed`로 유지한다.
3. additive migration과 인덱스를 staging에 적용한다.
4. RLS·grants·RPC·seed pgTAP 및 smoke를 실행한다.
5. 같은 migration을 승인 후 production에 `supabase db push`로 적용한다.
6. 공식 seed는 신규 빈 환경에서만 검토 후 적용한다. 운영 자산에 강제 덮어쓰지 않는다.
7. Cron job과 모니터링을 확인하되 시장은 자동 개장하지 않는다.
8. Vite build를 정적 호스팅 preview에 배포하고 OAuth redirect·로그인·조회 smoke를 한다.
9. 승인된 동일 artifact를 production으로 승격한다.
10. 운영 runbook의 2인 확인으로만 market을 `open`으로 전환한다.

## 6. 관측

- Auth 성공/거부와 외부 도메인 시도
- RPC error code, p50/p95/p99, DB lock wait와 connection 수
- 거래 idempotency replay·RLS 거부·직접 DML 시도
- Realtime 연결 수와 fan-out
- Cron 성공·실패, 가격 age, price run 회차 수
- DB CPU/IO/storage/egress와 예산 50/80/100% 경보

자산 불변식 의심, 가격 age 120초 초과, 광범위 인증/RPC 오류, DB 용량 위험이면 market halt를 우선한다.

## 7. 롤백

- UI: 직전 정적 release로 전환한다.
- DB: 운영 데이터를 파괴하는 down migration 대신 시장을 halt하고 검증된 forward fix를 적용한다.
- RLS/grants: 직전 검증 정책으로 복원하되 임시 권한 확대는 금지한다.
- Cron: job을 비활성화하고 마지막 정상 가격을 유지한다.
- seed: 재실행으로 운영 데이터를 덮지 않는다.

롤백 뒤 원장·account·holding·request reconciliation, 보안 smoke와 가격 최신성을 확인하기 전 시장을 재개하지 않는다.

## 8. 정적 호스팅

Supabase는 이 Vite 사이트의 정적 호스팅을 담당하지 않는다. Vercel, Cloudflare Pages 등 운영 공급자를 별도로 선택하고 다음을 설정한다.

- SPA hash route 지원
- HTTPS와 OAuth redirect URL
- CSP와 cache/version 정책
- 환경별 publishable key 분리
- 직전 artifact 즉시 롤백
