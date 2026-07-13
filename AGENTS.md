# AGENTS.md

## Scope and order of work

This repository is being built as a production school-festival service, not a demo. Follow `docs/IMPLEMENTATION_PLAN.md` in order and implement only the stage explicitly requested by the user. A later stage's code must not be added early. Stage 0 is documentation-only.

## Repository layout

- `index.html`, `src/`, `public/`: planned Vite-based vanilla HTML/CSS/JavaScript client (stage 1 onward)
- `functions/`: planned JavaScript Cloud Functions and Admin SDK code
- `docs/`: product, architecture, data, security, test, deployment, and operations source of truth
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`: planned Firebase configuration
- `scripts/`: planned validation and seed utilities
- `tests/`: planned client/integration tests; Functions tests may live under `functions/test/`

Do not modify unrelated sibling projects in this workspace.

## Standard commands

Stage 1 must expose these commands from the root `package.json`; until then they are planned interfaces, not currently runnable commands.

```sh
npm ci
npm run dev
npm run build
npm run lint
npm test
npm run emulators
npm run test:emulator
npm --prefix functions ci
npm --prefix functions run lint
npm --prefix functions test
```

Before running a command, confirm it exists in the relevant `package.json`. Use the Firebase Emulator Suite for local authentication, Firestore, and Functions verification; never point automated tests at production.

## Code and data rules

- Use vanilla modular JavaScript, HTML, and mobile-first CSS; do not add React, Vue, or an unapproved design system.
- Keep money and prices as integer KRW values and share quantities as integers. Never use floating-point arithmetic for authoritative financial state.
- Keep shared constants and tunable market coefficients in validated configuration, not duplicated per club or scattered across client files.
- Prefer small modules with explicit input validation, stable error codes, and deterministic behavior. Release Firestore listeners when a screen is hidden or disposed.
- Treat `docs/DATA_CONTRACTS.md` and `docs/FIRESTORE_SCHEMA.md` as contracts. Update affected documents and tests in the same task when an approved design changes.
- Official catalog data is exactly 22 clubs and 6 ETFs. Aliases are search metadata, never additional securities.

## Firebase security principles

- The client is untrusted. Authoritative writes for onboarding, cash, holdings, trades, prices, aggregates, rankings, news, events, market state, and audit logs occur only in validated server code.
- Enforce authentication, verified email, the centrally configured school domain, account status, authorization, and resource state on the server. Client checks are UX only.
- Use transactions or other documented atomic mechanisms plus idempotency keys for value-moving operations.
- Security Rules must deny by default, validate allowed fields and types, prevent cross-user private reads, and expose only the minimum public profile.
- Use least-privilege IAM, App Check enforcement after rollout verification, bounded queries, paginated history, short-lived listeners, and Emulator rules tests.

## Environment variables and secrets

- Commit `.env.example` with placeholders only. Use separate development, test, and production Firebase projects/configuration.
- Firebase Web config is public client configuration; Admin credentials, service-account keys, provider secrets, and admin allowlists are server secrets and must never enter the repository or client bundle.
- Centralize placeholders such as `ALLOWED_SCHOOL_DOMAIN`, `FESTIVAL_TIMEZONE`, administrator configuration, festival schedule, and rating-provider configuration. Do not guess missing real values.
- Never print tokens, credentials, full private user records, or secret environment values in logs or task reports.

## Absolute prohibitions

- Do not let clients directly mutate authoritative balances, holdings, trade history, prices, volume, rating aggregates, ETF values, rankings, market controls, or audit logs.
- Do not weaken, delete, skip, or rewrite tests merely to make a failing build pass.
- Do not create unofficial clubs, duplicate alias securities, or add excluded financial features.
- Do not commit secrets, use production as a test target, seed production without explicit confirmation, or silently overwrite operational data.
- Do not run `git commit`, `git push`, deploy to production, or make irreversible production changes unless the user explicitly requests that exact action.

## Definition of done

Every task must satisfy all of the following:

1. Only the requested implementation-plan stage and approved fixes changed.
2. Relevant contracts and decisions are synchronized with the implementation.
3. Lint, unit tests, applicable Emulator/rules tests, and production build pass; any unavailable check is reported with the reason.
4. Security, concurrency, failure, loading, empty, retry, accessibility, mobile-width, and cost implications were checked in proportion to the change.
5. No secret or service-account material is present, and `git diff` contains no unrelated edits.
6. Rollback steps and remaining risks are documented.

## Completion report

Report only: changed files; implemented scope/data flow; commands and verification results; security and integrity guarantees; required external configuration; remaining risks or blockers; rollback notes when applicable; and one recommended commit message. Never claim a test or deployment ran when it did not.
