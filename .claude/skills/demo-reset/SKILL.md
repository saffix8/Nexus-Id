---
name: demo-reset
description: Reset the dev database to a clean demo state — re-seed Shop A and issuers, clear verification sessions and history for Shop A and the demo End User, backfill 7 days of Shop A verifications. Keeps credentials and pairings. Use 30 min before a demo or defense run.
disable-model-invocation: true
allowed-tools: Bash(npm run demo:reset*) Bash(docker ps *) Bash(docker start nexusid-postgres) Bash(curl *)
---

Reset NexusID for a demo run (docs/DEMO_BUILD.md §5). Run from the repo root.

Arguments: `$ARGUMENTS` (optional: an End User email, or `--dry-run`).

1. Postgres must be up: `docker ps --filter name=nexusid-postgres --format "{{.Status}}"`.
   If it is not running: `docker start nexusid-postgres`.
2. Issuers should be running so their live JWKS keys are re-registered
   (`curl -s localhost:4001/.well-known/jwks.json` … 4004). If one is down, the script keeps the existing
   registry key; say which issuers were down.
3. Run the reset:
   - no arguments → `npm run demo:reset`
   - an email → `npm run demo:reset -- --email <email>`
   - `--dry-run` → `npm run demo:reset -- --dry-run`
4. Report the script's summary: sessions cleared, credentials and paired browsers kept, rows backfilled.

What it does (`services/backend/src/db/demo-reset.ts`):

- Re-seeds the issuer registry and Shop A (`nxk_shop_a_demo_key_2026`, `shop-a@nexusid.demo` / `ShopA-Demo-2026`,
  `AGE_OVER_18`).
- Deletes every verification session of Shop A and of the demo user (default `admin@nexusid.com`), plus that
  user's portal QR sign-in sessions.
- Backfills 24 Shop A verifications over the last 7 days (not linked to any user) so the SP chart isn't empty.
- Keeps users, credentials, device keys, browser pairings, other providers and audit logs.

Never run `prisma migrate reset` or `db push --force-reset` as a substitute.
After the reset: reload the SP dashboard (`localhost:3000/verifier/dashboard`) and the history pages; the phone
history refreshes on its next pull.
