# Timo — web & API

Timo records working time automatically: a phone that enters a company's beacon region checks in, leaving
checks out. This repo is the backend **and** both web admins; the iOS/Android app lives in
[`nijemeis/timo-apps`](https://github.com/nijemeis/timo-apps). The design handoff is in `design/`
(start with `design/README.md`).

| Surface | Path | Who |
|---|---|---|
| Company admin — presence, timesheets, needs attention, export, locations & beacons, people | `/admin` | `company_admin`, `manager` (own team only) |
| Timo system admin — companies (majors), beacon inventory (minors), requests | `/sys` | `system_admin` |
| REST API for the apps and admins | `/api/**` | bearer token or session cookie |
| Magic-link landing pages | `/auth/verify`, `/m/[token]` (bounces into `timo://`) | — |

Stack: Next.js 16 (App Router) · Prisma 6 · PostgreSQL · zod. EN/NL throughout.

## Beacon identity
- **UUID** `A1CA9F6B-CFC3-4DC6-9A4D-B4FB1B691C3D` — the estate UUID shared on purpose with Dealiteful, Luggo,
  Whemma and NoGo (the handoff's `5A4B…` was replaced). Constant in `src/lib/beacon.ts`.
- **Major** = company, assigned sequentially by the system admin (first one 1001; the demo uses 1042).
- **Minor** = one beacon within the company, assigned atomically (row lock on the company + unique (major, minor)).
- The apps only act on (major, minor) pairs of *active* beacons from `GET /api/me/beacon-config`, so the other
  apps' beacons on the same UUID are ignored.

## Check-in / check-out
The phone decides (natively — see the app repo) and uploads raw enter/exit events to `POST /api/events`
(idempotent on deviceId + seq). The server replays them through `src/lib/engine.ts`:
enter → check in · other location → switch · exit of the active beacon → check out at the last-seen time ·
re-entry at the same location within the company's grace period (default 3 min) → reopen · nothing by 23:59
local → closed with status `auto` (excluded from totals, listed under Needs attention) — a late exit from an
offline phone still resolves it. Decisions on the handoff's open questions: zone beacons at the same location
never split a registration; grace is per company; exports ship as CSV/Excel/JSON (AFAS/Nmbrs/Loket use the
generic CSV until their import mappings are verified).

## Run locally
```bash
createdb timo
cp .env.example .env     # set DATABASE_URL etc.
npm install
npm run setup            # migrate + seed the demo (Northpier Logistics, major 1042)
npm run dev              # http://localhost:3200
```
Sign in: company admin `mark.jansen@northpier.example`, employee `sanne.devries@northpier.example` (in
development the magic-link response carries a `devToken`, shown as "dev: open the link"); system admin
`ADMIN_EMAIL` / `ADMIN_PASSWORD` via "Sign in with password". Emails print to the console until
`RESEND_API_KEY` is set.

Checks: `npm test` (engine + time rules), `npm run test:smoke` (event pipeline against the DB), `npm run typecheck`.

## Production (DigitalOcean)
App Platform app from `.do/app.yaml`, region `tor`, deploys on push to `main`. Database `timo` on the shared
managed cluster `dealiteful-pgsql-tor1-98577`; the app connects through the PgBouncer pool `timo-pool`
(`DATABASE_URL`, `?pgbouncer=true&connection_limit=5`) and migrates over the direct URL
(`DIRECT_DATABASE_URL`). Start runs `prisma migrate deploy` + the base seed (system admin only).
Before go-live: set `RESEND_API_KEY` + a verified `EMAIL_FROM`, and empty `DEMO_LOGIN_DOMAINS`.

SSO: per company OIDC (issuer, client id/secret, email domains) set by the system admin; redirect URI
`${APP_URL}/api/auth/sso/callback`. SAML is not implemented.
