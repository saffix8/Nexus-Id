# NexusID — FYP Status Snapshot (2026-11-23, updated end of session)

Supersedes the 2026-11-22 /fyp-status snapshot below for everything touched
tonight. Stack is NOT persisted — everything is running as dev `tsx watch`
processes from this session (backend 4000, issuers 4001-4004, ML 5001, web
3000, Postgres/Redis in Docker). **Run `/boot-stack` first thing tomorrow**
before touching anything — nothing survives a reboot.

## What actually got fixed tonight (verified live, not assumed)

1. **All four issuer services were silently broken at startup or mid-flow.**
   Fixed real bugs: dotenv-loaded-after-import ordering (NADRA), `__dirname`
   used in ESM modules (HEC, and later `blockchain.service.ts` the first
   time anything imported it), wrong `.keys/` path depth and missing
   leading-dot filenames (AU, LinkedIn, HEC), a bad `@nexusid/sd-jwt/src/issuer`
   subpath import (NADRA). Added local sandbox simulation to all four issuers
   for their real external dependencies (NADRA Verisys, HEC API, AU's live
   student portal scrape, LinkedIn OAuth) — SRS explicitly scopes real
   integration out, and none of the real endpoints exist/work for this team.
   All four verified end-to-end issuing real, independently-verified SD-JWT
   credentials (`@nexusid/sd-jwt/verifier`).

2. **Credential wallet (MOD-2) built from scratch.** `dashboard/credentials/page.tsx`
   was a byte-for-byte copy of `verifier/create/page.tsx` — replaced with a
   real wallet view. New `Credential` Prisma model (metadata-only — issuer,
   type, status, field labels; **never** raw disclosures or claim values),
   a backend proxy (`credentials.route.ts`/`credentials.service.ts`) that
   forwards to the four issuer ports and persists on success, and
   `GET /api/v1/credentials` to list a user's wallet. Revoked credentials
   render dimmed with a red badge, not hidden.

3. **Revocation wiring replaced with something real.** The old
   `GET /api/v1/issuers/:id/revocation` was a hardcoded `{revoked:false}`
   placeholder, keyed by issuer ID (doesn't even match the per-credential
   chaincode design), with nothing anywhere that could ever set a credential
   to revoked. Now `GET/POST /api/v1/credentials/:id/revocation` and
   `/revoke`, scoped to the owning user, Postgres as source of truth,
   `blockchain.service.ts`'s `checkRevocation`/`logRevocation` cross-checked
   on a best-effort fail-open basis (Fabric isn't actually running — that's
   intentional per CLAUDE.md, not a bug).

4. **LinkedIn OAuth round-trip actually completes now.** `AddCredentialModal`
   already had a fully-built popup+poll UI wired to nothing. Fixed:
   `getAuthorizationURL()` pointed at real `linkedin.com` even in sandbox
   mode (would reject our fake client_id instantly); added a local
   mock-consent page sandbox mode redirects to instead. The issuer's
   `/callback` now notifies the backend server-to-server
   (`/linkedin/_internal/complete`, shared-secret gated) since the popup
   lands there directly, bypassing the backend. Added the missing
   `/linkedin/status` endpoint the frontend was already polling.

5. **Public-key sourcing gap — the big one.** `AddCredentialModal` never
   collected a `user_public_key` for _any_ issuer, and the backend required
   one from the client — every flow would have failed validation before
   reaching an issuer. `User.publicKey` storage already existed (FR-002/003
   mobile pairing never wired it up). Backend now looks it up server-side
   and injects it for NADRA/HEC/AU; LinkedIn threads it through the URL
   chain instead since its popup bypasses the backend proxy. Frontend:
   `lib/webKeypair.ts` generates an RSA-2048 keypair via the browser's Web
   Crypto API the first time one's needed (private key in `localStorage`,
   **not** sent to the server — a separate web-only keypair, not the mobile
   Android Keystore key), registers the public half via new `/me` routes.
   Found and fixed an IDOR along the way: `/:id/public-key`, `/:id/push-token`,
   `/:id/profile` had no ownership check — any authenticated user could
   read/write another user's key by ID (`requireSelf` middleware existed
   but was never applied). Also fixed a route-ordering bug where `/:id/...`
   matched the literal string `"me"` before the new `/me` routes got a
   chance to.

All five verified live end-to-end: fresh user, zero manually-supplied keys,
all four issuers (NADRA/HEC/AU/LinkedIn) issuing and landing in the wallet,
revoke/un-revoke round trip, IDOR fix confirmed with cross-user 403s.

## Defense-critical FRs (updated)

| FR                          | State                                                                                                                                                      | Evidence                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| FR-001 Registration         | Done (web + backend)                                                                                                                                       | auth.route.ts, users.route.ts, web-auth.controller.ts                    |
| FR-002 Device keys          | Mobile: code only, not runnable. Web: workaround built tonight — browser-generated RSA keypair (`lib/webKeypair.ts`), not a fix for the mobile requirement | apps/mobile/src/services/keystore.service.ts, apps/web/lib/webKeypair.ts |
| FR-003 QR pairing           | Done for demo (2026-11-23): backend `/pairing` (sessions, claim, devices, revoke), requests routed only to the paired user, extension popup QR + "Copy code". **Web stand-in** for the phone: Dashboard → Devices (paste code, list, revoke). Mobile scan screen written (`PairBrowserScreen`) but untested — app not runnable, camera lib not installed | services/backend/src/services/pairing.service.ts, apps/extension/popup.js, apps/web/app/dashboard/devices/page.tsx, apps/mobile/src/screens/PairBrowserScreen.tsx |
| MOD-4/5 Approve (web stand-in) | Done (2026-11-23): Dashboard → Requests lists requests routed via pairing; approve builds the SD-JWT presentation + KB-JWT in the browser (`lib/webHolder.ts`, mirrors `packages/sd-jwt` holder, cross-checked against `verifyProof`) from credentials kept in `lib/webWallet.ts`; decline supported. Verified live end-to-end (HEC issue → pair → extension request → approve/decline → extension result). Hardened same day: holder key is a non-extractable WebCrypto key and credentials are AES-GCM encrypted, both in IndexedDB (`lib/webVault.ts`); backend refuses proofs from revoked credentials via the stored SD-JWT `jti` (BR-006) | apps/web/app/dashboard/requests/page.tsx, apps/web/lib/webHolder.ts |
| FR-029/033/034 Provider accounts | Done (2026-11-23): role selection at login, provider sign-up/login (separate `nexusid_verifier_token` cookie, `role: verifier` JWT refused on End User routes), API keys stored as SHA-256 only, shown once, rotation invalidates the old key immediately (BR-009). Portal pages (Overview, Analytics, API Keys, Integration, Create) on real data — no mocks | services/backend/src/services/verifier-account.service.ts, apps/web/app/verifier/ |
| FR-017 Notify platform | Done (2026-11-23): extension fires `nexusid:result` (status + requestId) on the page for completed/declined/expired; site confirms server-side via `GET /verification/request/:id` + API key | apps/extension/content.js |
| MOD-6 User history | Done (2026-11-23): real history (platform, fields, outcome, response time) replaces the mock page; dashboard home counts are real | apps/web/app/dashboard/history/page.tsx |
| FR-004 Issuer key registry  | Done                                                                                                                                                       | services/backend/src/routes/issuers.route.ts                             |
| FR-006 Attribute submission | Done, all 4 issuers verified end-to-end tonight                                                                                                            | services/issuers/*/src/routes.ts                                         |
| FR-007 Issuance + storage   | **Done end-to-end via web** (all 4 issuers, Postgres metadata storage). Mobile on-device storage still not runnable                                        | services/backend/src/services/credentials.service.ts, Credential model   |

## Modules (updated)

| MOD                    | State                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| MOD-1 Onboarding       | Partial — no mobile pairing; web registration + web keypair generation now works                       |
| MOD-2 Wallet           | **Web: done tonight** — real listing, revocation, add-credential flow. Mobile: code only, not runnable |
| MOD-3 Notifications    | Backend done; mobile not runnable                                                                      |
| MOD-4 Approve/Reject   | Backend done; mobile not runnable                                                                      |
| MOD-5 Proof generation | Library done; mobile not runnable                                                                      |
| MOD-6 History          | **Unchanged — still a copy of verifier analytics.** Not touched tonight.                               |
| MOD-7 Extension        | Unchanged — still won't load (missing icons, no pairing). Not touched tonight.                         |
| MOD-8 Web portal       | Verifier side done; **user credentials page done tonight** (was a copy, now real)                      |

## Open items (ranked by likely next-session impact)

1. **MOD-6 History page is next in line for the same treatment as credentials** — same "copy of verifier page" problem, not yet fixed.
2. Mobile app still not runnable at all (FR-002/003, MOD-2/3/4/5 mobile side) — the web keypair workaround does NOT replace this; it's web-only.
3. `lib/api.ts` — dead code, unused anywhere, same `httpOnly`-cookie-read bug the modal had before tonight's fix. Will break whatever reaches for it next.
4. Extension icons: still missing PNGs referenced by manifest.
5. issuer-au: `infra/docker-compose.yml` still expects a Dockerfile path that doesn't match `services/issuers/air-university` — moot while running via `npm run dev`, matters if anyone tries `docker compose up`.
6. Mock-data fallbacks still in verifier dashboard/analytics (`history/page.tsx` generates fake data on fetch failure) — not touched tonight, separate from the MOD-6 issue above but related.
7. `zkp.service.ts` and `fraud-detection.service.ts` still unreferenced anywhere; ML service (:5001) still never actually called from the backend despite being up and healthy.
8. `docs/SRS.md` still empty on disk despite being cited as the source for `docs/REQUIREMENTS.md`.
9. In-memory-only state, two instances now: NADRA's OTP session store (pre-existing, flagged before) and tonight's new `pendingLinkedin` map in `credentials.service.ts`. Both are known, accepted single-process limitations — would need Redis for a real deployment, not needed for the FYP defense.

## Cleanup (no demo impact)

- Root strays: `0`, `npm`, `tsc`, `NODE_OPTIONS=--experimental-vm-modules`, nexusid-error-report.txt (most now gitignored)
- services/backend/*.mjs ad-hoc scripts; src/db/schema.sql (superseded by Prisma?)
- apps/web/tsc-output.txt (empty)
- Two LinkedIn test credentials in the wallet from tonight's debugging (`pubkeytest@example.com` test account) — harmless, test-only Postgres rows

---

<details>
<summary>Original 2026-11-22 snapshot (pre-session), kept for reference</summary>

Generated by /fyp-status against docs/REQUIREMENTS.md. Typecheck: backend,
web, sd-jwt clean. Backend Jest not re-run (needs Postgres).

### Defense-critical FRs

| FR                          | State                               | Evidence                                                                                  |
| --------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| FR-001 Registration         | Done (web + backend)                | services/backend/src/routes/auth.route.ts, users.route.ts                                 |
| FR-002 Device keys          | Code only — app not runnable        | apps/mobile/src/services/keystore.service.ts                                              |
| FR-003 QR pairing           | Missing                             | —                                                                                         |
| FR-004 Issuer key registry  | Done                                | services/backend/src/routes/issuers.route.ts                                              |
| FR-006 Attribute submission | Done (issuer services)              | services/issuers/*/src/routes.ts                                                          |
| FR-007 Issuance + storage   | Issuance done; storage not runnable | services/issuers/*/src/credential-builder.ts, apps/mobile/src/services/storage.service.ts |

### Modules

| MOD                    | State                                                                  |
| ---------------------- | ---------------------------------------------------------------------- |
| MOD-1 Onboarding       | Partial — no pairing                                                   |
| MOD-2 Wallet           | Code only — App.tsx is RN template, package.json has no RN deps        |
| MOD-3 Notifications    | Backend done; mobile not runnable                                      |
| MOD-4 Approve/Reject   | Backend done; mobile not runnable                                      |
| MOD-5 Proof generation | Library done; mobile not runnable                                      |
| MOD-6 History          | Backend done; web user page is a copy of verifier analytics            |
| MOD-7 Extension        | Won't load — manifest references missing .png icons; no pairing        |
| MOD-8 Web portal       | Verifier side done; user credentials page is a copy of verifier/create |

### Open items (ranked by demo impact)

1. Make apps/mobile runnable (real package.json, wire App.tsx → navigation)
2. Implement FR-003 device pairing (backend + extension + mobile)
3. Extension icons: ship PNGs or point manifest at existing assets
4. issuer-au: compose expects services/issuers/air-university/Dockerfile
5. Replace duplicated user dashboard pages (credentials, history)
6. Remove or gate mock-data fallbacks in verifier dashboard/analytics
7. zkp/blockchain/fraud-detection services unreferenced; ML :5001 never called
8. docs/SRS.md empty; SETUP/ARCHITECTURE/API reference missing NEXUSID_PROJECT.md

### Cleanup (no demo impact)

- Root strays: `0`, `npm`, `tsc`, `NODE_OPTIONS=--experimental-vm-modules`, nexusid-error-report.txt
- services/backend/*.mjs ad-hoc scripts; src/db/schema.sql (superseded by Prisma?)
- apps/web/tsc-output.txt (empty)
- CLAUDE.md monorepo map: issuers live at services/issuers/<name>

</details>
