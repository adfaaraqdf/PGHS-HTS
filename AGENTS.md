# AGENTS.md

## Scope and order of work

This repository is a production school-festival service. Follow `docs/IMPLEMENTATION_PLAN.md` in order and implement only the stage explicitly requested. Official data is exactly 20 clubs and 6 ETFs; aliases are search metadata, not securities.

## Repository layout

- `index.html`, `src/`, `public/`: Vite vanilla HTML/CSS/JavaScript client
- `supabase/migrations/`: PostgreSQL schema, RLS, grants, RPC and scheduled market logic
- `supabase/seed.sql`: idempotent official development seed
- `supabase/tests/`: pgTAP database, RLS and transaction tests
- `docs/`: product, architecture, schema, security, testing, deployment and operations source of truth
- `scripts/`: catalog validation utilities

Do not modify unrelated sibling projects in this workspace.

## Standard commands

```sh
npm ci
npm run dev
npm run build
npm run lint
npm test
npm run supabase:start
npm run db:reset
npm run db:lint
npm run test:db
npm run test:local
```

Confirm commands exist before running them. Supabase local development requires Docker. Never point automated tests at production.

## Code and data rules

- Use vanilla modular JavaScript, HTML and mobile-first CSS; do not add React or Vue.
- Keep money, prices and quantities as bounded integers. Authoritative calculations run in PostgreSQL transactions.
- Treat `docs/DATA_CONTRACTS.md` and `docs/DATABASE_SCHEMA.md` as contracts.
- Keep Realtime subscriptions bounded to the current screen and remove channels on route exit.
- Use migrations for schema, RLS, grants and functions; do not make untracked Dashboard-only database changes.

## Supabase security principles

- The browser receives only `VITE_SUPABASE_URL` and a publishable key. RLS and explicit grants remain mandatory.
- Cash, holdings, trades, prices, aggregates, rankings, market controls and audit logs are modified only by reviewed `SECURITY DEFINER` functions or service-role jobs.
- Every exposed function validates `auth.uid()`, confirmed Google identity, the centralized school domain, account status, arguments and resource state.
- `SECURITY DEFINER` functions use `set search_path = ''`, fully qualified objects and minimal `EXECUTE` grants.
- The service-role key, database password, Google OAuth secret, provider secrets and administrator credentials never enter the browser bundle or repository.

## Environment variables and secrets

- Commit `.env.example` placeholders only. Separate local, staging and production Supabase projects.
- The publishable key is public client configuration. Secret/service-role keys are server-only.
- Keep `ALLOWED_SCHOOL_DOMAIN=pangyo.hs.kr` synchronized between the database configuration and client UX setting.
- Store hosted secrets in Supabase project settings or Vault. Do not print tokens or private records.

## Absolute prohibitions

- Do not grant browser roles direct writes to authoritative tables.
- Do not weaken RLS, grants or tests to make a build pass.
- Do not add unofficial clubs or duplicate alias securities.
- Do not use production as a test target, apply remote migrations, seed production, deploy, commit or push unless the user explicitly authorizes the exact action.

## Definition of done

1. Only requested scope and approved fixes changed.
2. Contracts and decisions match migrations and client code.
3. Lint, unit tests, database tests and production build pass, or unavailable checks are reported honestly.
4. Concurrency, failure, accessibility, mobile width, Realtime lifecycle and cost implications were checked proportionally.
5. No secret or unrelated workspace file is included.
6. Rollback and remaining risks are documented.

## Completion report

Report changed files, data flow, commands/results, security guarantees, external configuration, remaining risks, rollback notes and a recommended commit message. Never claim an unrun test or deployment succeeded.
