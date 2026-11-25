# ▶ RESUME HERE (updated 2026-11-25, Phase 8)

**Where we are:** Phases 0 → 7 done, **Phase 8 (polish) code complete** — see the Phase 8 section below.
Phase 6 device run is still pending.
**Next:** look over the new landing page and the rebuilt End User screens in Chrome (no headless browser here, so not
checked visually), reload the extension, run the phone app end to end, then `npm run demo:reset` before the demo.

## Demo story status (DEMO_BUILD.md §1)

| # | Step | State |
|---|------|-------|
| 1 | Landing page | Exists (Phase 7/8 polish) |
| 2 | SP portal: Shop A registers, key, `AGE_OVER_18` | Done (Phase 3) |
| 3–4 | Phone wallet + add credential | **Phase 6.** Web stand-in works: `/dashboard/credentials` → Add → NADRA |
| 5 | Extension pairing QR → "Paired" | **Done, verified live** |
| 6 | Shop A detected by extension + desktop notification | **Done, verified live** |
| 7–8 | Phone request + fingerprint + proof | **Phase 6.** Web stand-in works: `/dashboard/requests` → Approve / Decline |
| 9 | Popup Verified + shop unlocks | **Done, verified live** (3 × VERIFIED) |
| 10 | SP dashboard log, no personal data | Done (Phase 3) |
| 11 | Negative cases | Decline **verified live**. Expired not yet watched live. Replay rejected (backend tests) |
| 12 | History (phone + web) | Web `/dashboard/history` fixed (time-zone bug) and shows the entries. Phone = Phase 6 |

## How to run and test (from scratch)

1. `docker start nexusid-postgres` (if stopped), then `bash dev-start.sh` → backend :4000, web :3000, Shop A :3001.
2. **Issuers are NOT started by `dev-start.sh`.** Start each in its own terminal so you can see its output:
   `npm run dev --workspace=services/issuers/nadra` (:4001), likewise `hec` (:4002), `air-university` (:4003).
   The NADRA **sandbox OTP** is printed in that terminal: `[SANDBOX] OTP for session …: 123456`.
   (Tonight NADRA was running in the background from an earlier Claude session, logging to
   `/tmp/claude-1000/-home-safi-Documents-nexusid/908130ef-3673-4745-b434-79feb95e245d/scratchpad/issuer-nadra.log`.
   That path is temporary; after a reboot use your own terminal.)
3. Extension: `npm run build -w apps/extension` → `chrome://extensions` → Developer mode → **Load unpacked**
   → pick `apps/extension` (the folder, not `dist/`). After code changes: rebuild, click the card's reload arrow, reload
   the Shop A tab (content scripts only attach to pages loaded after the extension).
4. End User (web stand-in for the phone): sign in at `localhost:3000/auth/login` (End User tab).
   Your account: **`admin@nexusid.com`** (it holds the NADRA credential, the live pairing and tonight's history).
   Shop A provider login: `shop-a@nexusid.demo` / `ShopA-Demo-2026` (API key `nxk_shop_a_demo_key_2026`).
5. Add credential: Dashboard → Credentials → Add → NADRA, any CNIC (dashes auto-insert), any `03…` number, OTP from
   the NADRA terminal. Sandbox always returns DOB 2000-01-15 → over 18.
6. Pair (until the phone app scans): open the popup → right-click → Inspect → Console:
   `chrome.storage.local.get('nexusid_pairing').then(r => console.log(r.nexusid_pairing.qrPayload))`
   → open the printed `localhost:3000/pair#…` link in the signed-in tab within 120 s → popup "Paired ✓" → Ready.
7. Verify: new tab `localhost:3001` → start verification → notification + popup "Waiting for your phone…"
   → `localhost:3000/dashboard/requests` → Approve (or Decline) → popup + shop update within ~2 s.

## Open items (carry forward)

- **Watch the Expired state live:** reload Shop A, don't approve, wait 2 min → popup amber EXPIRED, shop "Try again".
- **Web holder key is per browser, not per account** (`apps/web/lib/webKeypair.ts`, IndexedDB `signing-keypair`).
  Signing in as a different End User in the same Chrome profile → pairing/credentials fail
  ("No device key is registered"). Fix: key the vault entry by user ID, or re-register on account change.
  Workaround: one End User account per Chrome profile.
- **Stale session cookie:** if the account behind the cookie was deleted, web actions failed with "Record not found".
  `PUT /users/me/public-key` now says "sign out and sign in again"; other routes may still show the generic message.
- **Device name** in the popup shows "NexusID wallet" for web pairings (no `device_info.model`); the phone app will send it.
- Pairing without the phone: popup → **Copy code** (under the QR) → paste on `/dashboard/devices` or open the link in
  the signed-in tab. The DevTools-console workaround in step 6 above is no longer needed.
- Popup "Open portal" opens `http://localhost:3000` (hard-coded in `apps/extension/src/shared/config.ts`).
- CLAUDE.md says DB name `nexusid`; it is actually **`nexusid_db`** (tests use `nexusid_db_test`).
- Dev DB has throwaway `diag…@example.test` users from tonight's API checks, harmless.

## Git state: NOTHING COMMITTED since `d087139 Phase 3`

Uncommitted work = Phase 4 (`apps/demo-shop/`, `dev-start.sh`, root `package.json`) + Phase 5 (below) + tonight's fixes.
`package-lock.json` changed (adds `@types/chrome` for the new `apps/extension` workspace).
Suggested: commit Phase 4 and Phase 5 as two commits before starting Phase 6.

---

# NexusID — Phase 8: polish, landing page, demo safety (2026-11-25)

## 1. Landing page + logo
- `apps/web/app/page.tsx` rewritten per DESIGN.md §6.1: nav · hero "Prove what matters. Hide what doesn't." with
  `components/landing/HeroCredential.tsx` (NADRA card whose values blur into ✓ predicates / "Never shared"; reduced
  motion → opacity only) · old way vs NexusID · 3 steps · 4 issuers (predicates from `packages/types`) · verifier
  CodeBlock · footer "Air University Islamabad · FYP 2026". Server component; only the hero and CodeBlock are client.
- Logo mark (§10): `scripts/generate-logo.py` (stdlib only, no Pillow) writes `apps/web/app/{icon.svg,favicon.ico,
  apple-icon.png}`, extension `icons/icon{16,32,48,128}.{png,svg}` (32 added to the manifest) and the Android
  launcher `mipmap-*/ic_launcher{,_round}.png`. Re-run it after changing the mark.
- Tab titles "Page · NexusID" everywhere: root template + small `layout.tsx` files with `metadata` next to the
  client pages. `app/verifier/layout.tsx` is now a server layout around `components/nexus/VerifierShell.tsx`.

## 2. Demo reset
- `npm run demo:reset` (`services/backend/src/db/demo-reset.ts`), skill `/demo-reset`.
  Re-seeds issuers + Shop A, deletes every verification session of Shop A and of the demo user (default
  `admin@nexusid.com`, `-- --email x` for another), plus that user's portal QR sign-ins, then backfills 24 Shop A
  verifications over 7 days (17 verified, 2 failed, 3 declined, 2 expired, not linked to a user) so the SP chart and
  log aren't empty. Keeps users, credentials, device keys, pairings, audit logs. `-- --dry-run` shows the counts.
- `seed-demo.ts` now exports `seedIssuers` / `seedShopA` and only runs `main()` when executed directly.
- Ran once on the dev DB: 24 test sessions cleared, 1 credential + 1 pairing kept, 24 rows backfilled.

## 3. Rough edges found and fixed
| Where | Problem | Fix |
|---|---|---|
| `apps/web/components/AddCredentialModal.tsx` (whole file) | v1 design: emoji icons, inline hex, gradient buttons, headlessui; success step printed raw attribute values; "Successfully verified" (§8) | Rebuilt on shadcn Dialog + lucide; success shows `CredentialCard` with predicates only; same API calls and masks. A failed local save now shows an error instead of a false success |
| `apps/web/app/dashboard/credentials/page.tsx` | v1 cards with emoji, "Active" status, raw field names, second h1 under the top bar, gradient button, no Retry | Shared `CredentialCard` (Valid/Expired/Revoked), skeletons, `EmptyState`, `ErrorState` with Retry |
| `apps/web/app/dashboard/requests/page.tsx` | Showed raw disclosure values ("Age Over 18: true"), minutes countdown, no "Never shared", decline without confirm, "Loading…" text | Web ConsentSheet (§5.2): WILL BE CONFIRMED label + mono code, NEVER SHARED list, m:ss countdown (warning < 30 s, danger < 10 s, announced at 30/10 s), Decline → AlertDialog, expired state, toasts |
| `apps/web/app/dashboard/devices/page.tsx` | v1 styles, duplicated the dashboard list without browser names or revoke confirm; told users to use a "Copy code instead" button the extension didn't have | Shared `components/nexus/PairedDevices.tsx` (also used by SCR-014) + shadcn paste form |
| `apps/web/app/auth/login/password/page.tsx`, `auth/register/page.tsx` | Old hexagon logo with gradient, inline hex, `#3B6FE8` small link text, generic errors | `AuthFrame` like the provider pages; specific server-unreachable message |
| `apps/web/app/pair/page.tsx` | v1 hex styles, `#3B6FE8` small text | Tokens, Card, spinner |
| `auth/login/page.tsx:259`, `dashboard/pair/page.tsx:225`, `dashboard/history/page.tsx:319,375`, `PairedDevices` | `text-faint` on meaningful text (§9 contrast) | `text-muted` |
| `apps/extension/src/popup/popup.ts` QR view | No way to pair without the phone except DevTools | "Copy code" button next to "New code" |
| `apps/extension/popup.html` | Fonts from Google Fonts at runtime (flash on a weak hotspot, §10) | Bundled the app's TTFs in `apps/extension/fonts`, `@font-face` in popup.css |
| `apps/mobile/src/components/ConsentSheet.tsx` | Countdown not announced (§9) | `announceForAccessibility` at 30 s, 10 s and on expiry |
| `apps/mobile/src/screens/RequestScreen.tsx:71` | Error button said "Retry" but went back | "Back to wallet" (`ErrorState` got `actionLabel`) |
| `apps/web/components/QRGenerator.tsx`, `AnalyticsCharts.tsx`, `lib/constants.ts` | Dead v1 code | Deleted |

Checked and already fine: SP dashboard/requirements/API keys, history, QR sign-in, Shop A (copy, banner, states),
popup states and focus ring, mobile copy (§8), touch targets (44 px), icon-button labels on all three surfaces.

## Checks
- `npx tsc --noEmit`: web, extension, mobile, backend all pass. `next build` passes (lint + types).
- Rendered over HTTP: landing, auth pages, SP pages signed in as Shop A, titles, favicons. End User pages not
  rendered signed in (no password for the demo account here), and nothing checked visually (no headless browser).
- **Incident:** a `next build` into `apps/web/.next` broke the running dev server ("Cannot find module './3135.js'").
  Fixed by restarting `next dev` with a fresh `.next` (old one moved to the scratchpad). Always build with
  `NEXT_DIST_DIR=.next-build npx next build` while the dev server runs.

## Not done
- `@headlessui/react` is now unused in `apps/web/package.json`; left installed (no dependency changes before the demo).
- Extension icon / phone launcher need a reload / reinstall to show the new mark.

---

# NexusID — Phase 7: End User web portal (2026-11-25)

## FR-036 QR sign-in (was not implemented in the backend before)
- API-023 now accepts `purpose: "SIGN_IN"` → `{ challengeId, code, pollToken, expiresAt, qrPayload }`.
  QR payload = `<PAIRING_WEB_URL>/pair#p=..&c=..&t=SIGN_IN` (PAIRING links unchanged, no `t`).
- New table `portal_sign_ins` (migration `portal_sign_in`): pending → approved (API-025) → consumed (API-024).
  Kept apart from `device_pairings` so an approved sign-in can never route requests.
- API-025 signs `nexusid-qr:SIGN_IN:<id>:<code>` (purpose-bound: a pairing signature can't sign someone in).
- API-024 with header `x-challenge-token`: the **first** poll after approval returns `sessionToken` (normal portal JWT,
  `issueToken` now exported from `web-auth.controller.ts`), atomically marked consumed; later polls get none.
  Approval must be collected within 60 s. Audit events `portal_sign_in_approved`, `portal_sign_in`.
- Web: `POST /api/auth?action=qr-start` / `qr-status`. The poll token lives only in the httpOnly cookie
  `nexusid_qr_signin` (`<challengeId>.<token>`, 180 s); page JS never sees it. On approval the route sets `nexusid_token`.
- Pairings now store `browser_label` ("Chrome on Linux", from the User-Agent at API-023); API-026 returns `browser`.
  Older pairings show "Browser extension". `GET /users/me` adds `deviceName` (model from device_info only).
- Tests: 6 new (SIGN_IN create/poll, purpose binding, wrong token, single use + one-time session, expiry, `browser`)
  → backend **111/111**. Live end-to-end script through the web route also passed.

## Screens (apps/web)
- **SCR-013 `/auth/login`** — QR sign-in, WhatsApp Web style: `QRPanel` left (120 s ring), 3 steps right.
  Auto-refreshes a new code at 0:00, up to 5 times in a row (10 min idle), then "Code expired · New code".
  Polls every 2 s; "Signed in ✓" then full navigation to `/dashboard` (or `?next=`). Another tab starting a code → message.
  Links: "Use email and password" → **`/auth/login/password`** (the old form moved there, plus "Sign in with your
  phone instead"), "Service Provider? Sign in here". FR-037 recovery is **not built**; the "Lost your phone?" link
  goes to the password sign-in.
- **SCR-014 `/dashboard`** — KPI row (Credentials · Verifications · Paired browsers), "Paired browsers & devices"
  (your phone's device key row + each browser with Revoke → AlertDialog → API-027, "Show N revoked"),
  Recent activity (6 latest, PredicateChip + OutcomeBadge) → View all.
- **SCR-015 `/dashboard/history`** — table with filter tabs All / Verified / Declined / Expired (with counts),
  row → side Sheet (outcome, condition + code, requested/answered times, issuer, request ID, "learned only …"),
  delete one (API-039) and Clear all (API-040), both behind AlertDialog. The old analytics-style page is gone.
- `/dashboard/pair` (web stand-in for the phone) handles both purposes: "Pair a browser" or "Sign in on another screen".
- `QRPanel` new props: `showSteps`, `doneLabel`, `qrLabel`. Data hooks in `lib/userApi.ts`.
  Verification proxy now forwards DELETE.

## Mobile
- Scanner reads `t=SIGN_IN`, signs with that purpose (prompt "Sign in on your computer"), shows "Signed in".

## How to test QR sign-in without the phone
1. Signed-in Chrome profile A (End User). Profile B / incognito: open `localhost:3000/auth/login`.
2. In B's DevTools console: `document.querySelector('[aria-label="NexusID sign-in QR code"]')` is the code; easier:
   the QR encodes `localhost:3000/pair#p=…&c=…&t=SIGN_IN` — scan it with a phone camera, or copy it from the
   `qr-start` response in B's Network tab, and open it in profile A → "Sign in" → B opens the dashboard.
   (Profile A must hold the device key registered for that account — see the per-browser key note above.)

## Not verified
- No headless browser on this machine: the screens were checked by SSR render + typecheck only, not visually.
- Phone scan of a SIGN_IN code (needs the Phase 6 device run).

---

# NexusID — Phase 6: Mobile wallet (2026-11-25)

`apps/mobile` was the bare RN template (no dependencies, `App.tsx` = sample screen, `src/` never compiled).
Now a real app on **React Native 0.88.1** (new arch, Hermes), DESIGN.md §3/§5/§6.2.

## Setup changes
- **Not in the root npm workspace any more** (root `package.json` lists `apps/web`, `apps/extension`,
  `apps/demo-shop` explicitly). RN needs React 19, web is on React 18. Install with
  `cd apps/mobile && nvm use && npm install --no-workspaces`. Needs **Node 22** (`.nvmrc`).
- `@nexusid/types` linked with `file:`; Metro watches `packages/types`. `@nexusid/sd-jwt` is **not** used on the phone.
- Kit per §6.2 (no NativeWind): `src/styles/tokens.ts` + own `src/ui/*`, lucide-react-native, reanimated 4,
  @gorhom/bottom-sheet 5, react-native-svg, vision-camera 5 (QR), react-native-biometrics, keychain.
- Fonts bundled: `android/app/src/main/assets/fonts` (DM Sans, Inter, JetBrains Mono — OFL).
- Manifest: CAMERA, USE_BIOMETRIC. App label "NexusID".

## Screens (src/screens)
SignIn (+ "Securing your device…" while the Keystore key is made, FR-002) · Lock (FR-015, auto biometric prompt,
re-locks after 30 s in background) · Wallet SCR-002 (Apple Wallet stack, empty state with 4 category tiles,
pending-request banner) · CredentialDetail SCR-003 (Confirms list label + mono code, details, Update/Delete with
confirm) · AddCredential SCR-004/005 (state machine pick → form → [NADRA OTP 6 boxes] → processing → success/error;
NADRA, HEC, Air University, LinkedIn OAuth) · Scan SCR-007 (camera, cutout, animated corners, pairing API-025) ·
Request SCR-008 (`ConsentSheet`: WILL BE CONFIRMED / NEVER SHARED, 120 s ring warning < 30 s / danger < 10 s,
Decline confirm, Approve with fingerprint, expired state, no-credential → API-037) · Proof SCR-009
(`ProofStepper` 3 steps ≥ 400 ms each → drawn check "Verified"; failure with backend reason + Retry while open) ·
History SCR-010 (grouped by day, outcome badges, long-press delete, Clear all) · Profile.
Bottom tabs Wallet · History · Profile + centred floating Scan button.

## Crypto / storage changes (approved by Safi 2026-11-25)
- **On-device holder ported:** `apps/mobile/src/crypto/holder.ts` mirrors `packages/sd-jwt/src/holder.ts` (like
  `apps/web/lib/webHolder.ts`) with pure-JS SHA-256 (`@noble/hashes`) and its own base64url/UTF-8, because Hermes has
  no Node `crypto`, no `crypto.subtle`. Signer = Android Keystore (`keystore.service.ts` → `createSignature`).
  The package itself is unchanged. **Any change to holder.ts must be mirrored in both copies.**
- **Bug fixed:** the old `crypto.service.ts` put `sd_hash` in **hex**; the verifier expects base64url (RFC 9901) →
  every phone proof would have failed.
- **Proof check:** `npx tsx scripts/check-mobile-holder.mts` → issues a real credential (package issuer), builds the
  proof with the phone holder, verifies with the backend `verifyProof`: **all checks pass** (accepts valid; rejects
  wrong nonce and a different holder key; SHA-256/base64url/UTF-8 incl. Urdu text match Node).
- **One fingerprint prompt per approval:** Approve signs the KB-JWT with the Keystore key; that biometric prompt is
  the FR-015 auth for FR-021. Then the stepper shows the steps and sends (API-035).
- **Storage rewritten (CON-010):** `react-native-sqlite-storage` failed the Gradle 9 build (`jcenter()`) and never
  encrypted (its `key` needs SQLCipher). Now each credential is sealed with **AES-256-GCM** (`@noble/ciphers`), fresh
  96-bit IV per write, credential id as AAD; 256-bit key in `react-native-keychain` (Keystore-backed); ciphertext in
  AsyncStorage. CSPRNG from `react-native-get-random-values` (no Math.random fallback any more).
- Sign-out deletes the device key (as before) **and** wipes the credential store (credentials are cnf-bound to that key).
- `KeystoreService.getInstance()` added; `signData()` takes a prompt title ("Approve request from Shop A").

## Backend: history delete (API-039/040, FR-030, BR-023)
- Migration `history_user_delete`: `verification_requests.user_deleted_at` (soft delete).
- `DELETE /api/v1/verification/history/:id` and `DELETE /api/v1/verification/history` (device JWT). Hidden from API-038
  (phone + web), **SP log and audit log keep the row** (BR-023). 404 for pending / not yours / already deleted.
- Tests: 5 new in `verification-loop.test.ts`; backend suite **105/105 pass**.

## Important for the demo
- **Credentials are bound to the device key (cnf).** Signing in on the phone registers the phone's key
  (`PUT /users/me/public-key`) and replaces the web stand-in key for that account. Add credentials **on the phone,
  after signing in there**. Old web-issued credentials won't verify from the phone (and vice versa).
- Push (FR-019) = **polling `GET /verification/pending` every 3 s** while unlocked. Real FCM needs a Firebase project
  (`google-services.json`); `notification.service.ts` is kept but excluded from the build.
- Backend URL `src/config.ts`: `10.0.2.2:4000` (emulator). Real phone → laptop LAN IP.

---

# NexusID — Phase 5: Extension popup redesign (2026-11-24 → verified 2026-11-25)

SCR-011 rebuilt to DESIGN.md §6.3 (360 × 560, §3 tokens, §5.4 QRPanel, §3.2 OutcomeBadge, §5.6 PredicateChip).

## Extension (`apps/extension`)
- **Now a TypeScript workspace** (`@nexusid/extension`) bundled by esbuild (`build.mjs`, `npm run build|watch|typecheck
  -w apps/extension` → `dist/`, git-ignored). `@types/chrome` 0.3.7. `manifest.json` (v1.1.0) points at
  `dist/background.js`; `popup.html` loads `qrcode.vendor.js` + `dist/popup.js`; styles in `popup.css` (CSS variables
  from DESIGN §3, not Tailwind). Old `background.js`, `popup.js`, `config.js` deleted.
- Files: `src/background/index.ts` (worker), `src/popup/popup.ts` (views), `src/shared/{config,state,icons}.ts`
  (`icons.ts` is generated from lucide-react icon data, no React in the bundle).
- `content.js` unchanged (plain JS, same message protocol, so Shop A is unaffected). Not converted to TS yet.
- Popup states: loading skeleton → Not paired (QR via API-023, 120 s ring → amber at 30 s / red at 10 s, blur +
  "Code expired · New code", "Paired ✓" moment, screen-reader announcements at 30/10 s) → Paired idle (device name,
  inline Unpair confirm, no dialogs) → Request pending (platform, host, PredicateChip + mono code, pulsing
  "Waiting for your phone…", session countdown) → Verified (drawn check) / Failed / Declined / Expired + Dismiss.
  Error state with Retry when the backend is down. Labels/colours from `packages/types` (build aliases the source).
- Worker: relay API-032 with pairing token, poll API-033 with poll secret. `chrome.alarms` (30 s, Chrome's minimum) is
  the durable scheduler surviving worker suspension; a 2 s loop runs while awake, and an open popup nudges it every 2 s.
  FR-033 notifications on relay ("Shop A asks: Age over 18 — check your phone") and on every outcome. Toolbar badge for
  pending/verified. Storage keys: `nexusid_pairing`, `nexusid_request` (poll secret dropped once final). v1.0 storage is
  migrated/cleaned on install. Popup never shows claim values.
- Permissions: storage, notifications, alarms, activeTab, scripting.

## Backend
- API-024 `GET /qr-challenges/:id` (and redeem) now also return `active` and `deviceName` (from `users.device_info.model`).
- New `DELETE /api/v1/pairings/self` (header `x-pairing-token`): extension revokes its own pairing on Unpair
  (idempotent, audited `device_pairing_revoked` with `by: extension`).
- `PUT /users/me/public-key`: 401 "account no longer exists, sign out and sign in again" instead of Prisma's
  "Record not found" (stale cookie for a deleted user).
- Backend tests 100/100 pass (re-run 2026-11-25 after all changes). Extension typecheck clean.

## Web fixes found during the live check
- `components/AddCredentialModal.tsx` `apiFetch` returned the `{ success, data }` envelope, so NADRA verify-otp got
  `session_id: undefined` (Zod "expected string, received undefined") and **every issuer's credential (NADRA, HEC,
  AU, LinkedIn) was dropped before reaching the browser wallet**. Now unwraps `data`. Any credential added before this
  fix is not in the browser wallet; re-add it.
- Input masks: CNIC auto-dashes as typed (`3520212345678` → `35202-1234567-8`), phone strips spaces/dashes
  (`0300-1234567` → `03001234567`), OTP digits only (max 6).
- `app/dashboard/history/page.tsx`: "today" came from the UTC date while the range end was parsed as local time, so in
  PKT 00:00–05:00 the day's entries were filtered out and every total showed 0. Now uses local dates on both ends.

## Verified live in Chrome (2026-11-25)
- Pairing via `/pair` link → popup "Paired ✓" → Ready. Unpair revoked server-side (pairing row `revoked`).
- 3 Shop A sessions relayed → approved on `/dashboard/requests` → VERIFIED (popup, notification, shop unlock).
- 2 Shop A sessions declined → DECLINED.
- History page shows the 5 entries after the time-zone fix.
- Not watched live: Expired, Failed (backend tests cover FAILED), backend-down error screen.

---

# NexusID — Phase 4: Demo shop "Shop A" (2026-11-24)

New workspace **`apps/demo-shop`** (plain Vite 6.3.5 + TS, **http://localhost:3001**). Chosen over a route in `apps/web`
because the web root layout forces the dark theme, and a separate origin makes Shop A look like someone else's site.
The extension needs nothing new: it already detects any `#nexusid-verify` (including ones added later via MutationObserver).

- **Page** (DESIGN §6.4): light e-commerce checkout for an 18+ game (product, order summary), dark NexusID card
  ("Verify your age with NexusID", status + 2-min countdown, extension mount slot, "Only the answer is shared…",
  collapsible "What this page embeds" showing the live snippet). VERIFIED → green "Age verified · no personal data shared"
  banner + "Place order" unlocks (lock opens, pulse). DECLINED / EXPIRED / FAILED / session error → specific message +
  **Try again** (new session, fresh `#nexusid-verify` node). If the extension doesn't take over the element within 2.5 s
  the slot says the extension is not installed.
- **Server routes** (`server/shop-api.ts`, Node-only Vite middleware for `vite` and `vite preview`):
  `POST /shop-api/session` → API-030 (`AGE_OVER_18`), `GET /shop-api/session/:id/outcome` → API-031,
  `POST /shop-api/order` re-checks API-031 server-side (must be VERIFIED; one order per session). The `nexusid:result`
  page event only triggers an early poll; it is never trusted.
- **API key** read from `SHOP_A_API_KEY` (not `VITE_`-prefixed, so never exposed) with the seeded
  `nxk_shop_a_demo_key_2026` as default; `NEXUSID_API_URL` defaults to `http://localhost:4000/api/v1`.
  `vite build` output grepped: no key, no `x-api-key`.
- Snippet: `data-session-id`, `data-nonce` (what content.js reads) + `data-platform`, `data-condition` (informational;
  the extension shows the platform/condition from the backend, FR-032).
- `dev-start.sh` step 6 starts it; root `npm run dev:shop`, and root `npm run dev` now starts it too.
- Checked in headless Chrome against the live backend: pending → verified → order placed, declined → Try again (new
  session), expired, failed, 390 px (no horizontal scroll), no console errors. Outcomes were simulated by updating the
  test sessions' status in `nexusid_db` (≈8 extra Shop A sessions in its log). The real phone/extension loop is Phase 5–6.
- Note: the dev DB is actually **`nexusid_db`** (user `nexusid`), not `nexusid` as CLAUDE.md says.

---

# NexusID — Phase 3: Service Provider portal (2026-11-24)

Backend Jest **100/100** (2 new tests). `tsc --noEmit` clean (backend, web). `next build` passes. Every screen checked
in headless Chrome against `next dev` + live backend, as Shop A and as a throwaway provider: loading, empty, error
(mocked 503), 8 s timeout, success, 390 px width (16 px gutter, no horizontal scroll). No console errors apart from
the known `/favicon.ico` 404.

## Backend
- **API-043** `GET /verifiers/api-key` (prefix + rotation time, never the key) and **API-044**
  `POST /verifiers/api-key/regenerate` (ALG-009) at the SRS paths. `POST /verifiers/me/api-key` kept as an alias.
- **API-047/048** (`/analytics/verifications`, `/analytics/recent`) now accept the portal JWT **or** `x-api-key`
  (`requireVerifierAuth`). If an `x-api-key` header is sent and it's wrong, the request gets 401. It is never retried as a token.
  - API-047: `{ total, verified, failed, declined, expired, pending, successRate, daily[7] }`. Overdue pending sessions count as
    expired. `?tzOffset=` buckets days in the viewer's timezone.
  - API-048: `{ sessionId, createdAt, predicate, predicateLabel, outcome, issuer, proofHash, decidedAt }`, `?limit=` ≤ 100.
    No user fields (FR-042 AC2, tested by exact key list).

## Web
- **SCR-012** `/login`: two role cards → `/auth/login` (End User, unchanged until Phase 7) or `/auth/provider-login`.
- **SCR-017** `/auth/provider-login` + `/auth/provider-register` (login-03 `AuthFrame`). Register: platform name, domain,
  email, password. Inline field errors, a taken email/domain shown on the field (FR-039 AC2), first key shown once, then → Requirements.
  `/auth/login?role=provider` and unauthenticated `/verifier/*` redirect to the SP login.
- **SCR-018** `/verifier/dashboard`: KPI row, stacked 7-day chart, `LiveLogTable`, "Integrate in 2 minutes" snippet,
  configured-conditions card, and a warning banner when nothing is configured. Stats and log poll every **3 s**. A session created
  with Shop A's key appeared in the log in under 3 s.
- **SCR-019** `/verifier/requirements`: 4 category cards with colour strips, the 9 catalog predicates, sticky footer with
  a live chip preview, Save/Discard (API-046).
- **SCR-020** `/verifier/api-keys`: masked key row, Rotate → AlertDialog (BR-009 wording) → show-once dialog with Copy;
  "Create key" empty state if a provider has no key.
- `/verifier/integration` rewritten for `{ predicate }` / `outcome` (it still said `requestedFields` / `verifiedFields`).
  `/verifier/create` and `/verifier/analytics` now redirect (Requirements / Dashboard).
- `lib/verifierApi.ts`: typed hooks; 8 s request timeout, not retried; 401 → "Your session has ended".
- New in `components/nexus/`: `ApiKeyReveal`, `ErrorState`, `AuthFrame`. `StatCard` gained `hint`.
- Fixes found in the browser: duplicate nested `<main>` in `AppShell` (SidebarInset is already `<main>`). `LiveLogTable`
  showed "in 2 seconds" for rows newer than its 10 s clock tick (now "just now"). Recharts re-animated on every poll.
  Middleware open redirect on `?next=//host` for already-signed-in users.

## Dev DB side effects of the check
- One extra Shop A session (AGE_OVER_18, now EXPIRED) in Shop A's log.
- One provider "UI Test Provider" (`ui-test-…@example.com`) with a rotated key and requirements AGE_OVER_21 + ENROLLED_CURRENT.
- Shop A's key (`nxk_shop_a_demo_key_2026`) and requirements were **not** changed.

## Not done / later
- One key per provider (schema has a single `api_key`), so no key names or "last used".
- Seeded 7-day history for the chart (DESIGN §10) → Phase 8.

---

# NexusID — Phase 2b: shared components (2026-11-24)

`npx tsc --noEmit` and `next build` pass. `/dev/components` renders every component in every state with no console
errors or hydration warnings (headless Chrome against `next dev`; only a missing `/favicon.ico` 404 — Phase 8 polish).

- `packages/types`: `PredicateCode`, `PREDICATE_DISPLAY` (§5.6 labels + category), `PREDICATE_CODES`, `isPredicateCode`,
  `predicateLabel`, `CATEGORY_DISPLAY` (label, issuer, hex, lucide icon name). Categories follow the sd-jwt catalog, so the
  CGPA predicates are **enrollment** (AU issues them), not education. Rebuild `dist/` after editing (`npm run build -w packages/types`).
- `apps/web/components/nexus/` (barrel `index.ts`): `OutcomeBadge` (all 10 §3.2 states + pending dot), `PredicateChip`,
  `CodeBlock` (copy → check 2 s + sonner toast), `QRPanel` (120 s ring, warning ≤30 s, danger ≤10 s, aria-live at 30/10 s,
  blurred expired state + New code, loading), `CredentialCard` (§5.1, valid/expired/revoked), `StatCard` + `EmptyState`
  on shadcn Card, `LiveLogTable` shell (loading/empty/error/rows, new rows slide + flash, session copy, BR-015 tooltip),
  `AppShell` (sidebar-07 style, collapsible to icons, user menu with area switch + sign out, 56 px top bar).
- `AppShell` now wraps `/dashboard` and `/verifier` (replaces `DashboardChrome.tsx` and the hand-made verifier chrome).
  Dropped the dead `/dashboard/settings` link.
- Root layout renders sonner `<Toaster>` (tokens: card bg, border, radius 8, dialog shadow, status-coloured icon).
  `TooltipProvider` added to `providers.tsx`. `react-hot-toast` removed (nothing used it any more).
- Hydration: times only computed client-side (`hooks/use-now.ts`, tooltip content); expiry formatted from the ISO string;
  QR countdown starts in `useEffect`. Fixed shadcn `SidebarMenuSkeleton`'s `Math.random()` width (now derived from `useId`).
- `components/legacy-ui/` deleted; old unused `components/CredentialCard.tsx` replaced; `VerifierIntegrationCode` uses the new `CodeBlock`.
- `next.config.js`: `distDir` honours `NEXT_DIST_DIR` so `NEXT_DIST_DIR=.next-build npx next build` can run next to a live
  `next dev` (`.next-build/` gitignored).
- Not done: `styles/tokens.css` is unused (and has a font `@import`); `@headlessui/react` still used by existing pages.

---

# NexusID — Phase 2a: shadcn/ui install (2026-11-24)

`apps/web` now has shadcn/ui (new-york, neutral, CSS variables) on Tailwind 3.4.19 / Next 14.2.35 / React 18.3.1 (none upgraded).
`npx tsc --noEmit` and `npm run build` both pass with no warnings.

- Hand-made components moved to `components/legacy-ui/` (Badge, Button, EmptyState, Input, Skeleton, StatCard); 3 imports updated.
  `components/ui/` now holds only shadcn output.
- Added with `shadcn@2.3.0`: button input label card badge table dialog alert-dialog sheet tabs checkbox dropdown-menu avatar
  separator skeleton tooltip sonner **sidebar** (worked on 2.3.0) chart form progress scroll-area, plus `hooks/use-mobile.tsx`.
- `globals.css`: DESIGN.md §4.2 dark mapping on `:root` only (no `.dark`, no light theme). Sidebar vars derived from the same tokens.
- `tailwind.config.ts`: shadcn tokens + §3.1 colours (`surface overlay inset text.{muted,faint} accent.{primary,hover,text}
  success warning danger cat.*`). Legacy v1 colours (`bg.*`, `border.{subtle,default,strong}`, `text.{primary,secondary,tertiary}`,
  `cred.*`, `accent.secondary`) kept because existing pages use them.
- Fonts: next/font (already in layout.tsx) now wired via `--font-inter / --font-dm-sans / --font-jetbrains`; CSS `@import` removed.
- Removed the custom v1 `fontSize` scale (xs 10.2 px, sm 12.8 px) and the `rounded-xl: 16px` override so shadcn components get the
  default scale (text-sm 14 px = DESIGN body size; rounded-xl 12 px = card radius). Existing pages render slightly larger text.
- `sonner.tsx` pinned to `theme="dark"` (it used next-themes with no provider); `next-themes` uninstalled.
- `themeColor` moved from `metadata` to `viewport` export (removed the Next 14 build warning).
- Packages: lucide-react, motion, qrcode.react, date-fns, sonner, Radix primitives, tailwindcss-animate.
- Not done yet: `react-hot-toast` and `@headlessui/react` still used by existing pages; remove once Phase 3 replaces them.

---

# NexusID — Phase 1: backend verification loop (2026-11-24)

The backend loop now matches SRS v2, predicate-only. Backend Jest **98/98**
(`verification-flow.test.ts` 65 adapted + new `verification-loop.test.ts` 33)
against `nexusid_db_test`. Typecheck clean: backend, sd-jwt, types, web.

## What changed

- **Predicate catalog (FR-005, BR-021):** `packages/sd-jwt/src/predicates.ts`
  (`@nexusid/sd-jwt` and `@nexusid/sd-jwt/predicates`): 9 codes, label, category,
  issuing issuer. Issuance, configuration and verification share it.
- **API-045/046** `GET/PUT /api/v1/verifiers/requirements` (portal JWT): catalog
  codes only; stored in `verifiers.required_predicates`.
- **API-030** takes `{ predicate }` (one catalog code). Unknown code → 422,
  not configured for this SP → 403. `requestedFields: [predicate]` is still
  returned as a legacy alias.
- **API-035 / ALG-002:** the nonce is consumed on receipt (ALG-003, PK on
  `used_nonces`), then: issuer in registry → issuer authorised for the
  predicate → not revoked → signature, disclosures, KB-JWT (nonce, aud, age
  ≤ 60 s), holder binding, credential `exp` → the only disclosed claim is the
  predicate and it is `true`. Any failure closes the session as **FAILED**
  (400 with `details.code`, e.g. `PREDICATE_MISMATCH`, `CREDENTIAL_EXPIRED`,
  `NONCE_MISMATCH`, `PROOF_TOO_OLD`, `CONDITION_NOT_MET`).
- **API-036** decline → DECLINED; **API-037** `POST /verification/fail/:id`
  (new) → FAILED with no proof hash or issuer.
- **ALG-005:** `verificationService.expireSessions()` (atomic `UPDATE …
  RETURNING`) runs every 5 s from `bootstrap()`; lazy expiry kept as backup.
- **Outcomes (API-031/033, history, SP log):** `{ status, outcome, predicate,
  predicateLabel, issuer?, decidedAt? }`; `outcome` ∈ PENDING / VERIFIED /
  FAILED / DECLINED / EXPIRED. **No claim values anywhere.**
- **BR-015:** migration `20261124180000_predicate_outcomes` drops
  `verification_results.verified_fields` (claim values already stored in the
  dev DB were deleted with it) and adds `outcome`, `condition`; `issuer` and
  `proof_hash` are nullable for API-037.
- **`npm run seed:demo`** (`services/backend/src/db/seed-demo.ts`): the 4
  issuers with keys from their live JWKS, and **Shop A** — API key
  `nxk_shop_a_demo_key_2026`, portal `shop-a@nexusid.demo` / `ShopA-Demo-2026`,
  `AGE_OVER_18` configured. Idempotent, deletes nothing.
- `packages/types` tsconfig fixed (TS18003); `VerificationStatus` gains `failed`.

## Issuers sign predicate claims (same day)

All four issuers now issue **only** catalog predicates as selectively
disclosable booleans, through `buildPredicateClaims()` in
`@nexusid/sd-jwt/predicates`, which refuses non-catalog codes and codes owned by
another issuer (BR-021). Always-visible claims are just `credential_type` and
`issuer_name`. Name, CNIC, DOB, address, degree title, CGPA, employer and email
never enter a credential.

| Issuer | Predicates | Derived from |
|---|---|---|
| NADRA | AGE_OVER_18, AGE_OVER_21, NATIONALITY_PAKISTANI | DOB; verified CNIC record |
| HEC | DEGREE_BACHELOR_OR_HIGHER | `isBachelorOrHigher(degree_title)` |
| Air University | ENROLLED_CURRENT, CGPA_AT_LEAST_2_0/3_0/3_5 | enrollment status, CGPA |
| LinkedIn | EMPLOYMENT_ACTIVE | current position |

**Doc conflict resolved:** `.claude/rules/sd-jwt.md` gives CGPA to HEC, but
FR-005 AC1 lists CGPA under enrollment and only the AU record has a CGPA, so
CGPA moved to `au.edu.pk`. Fix the rules table if you agree.

**Verified live (2026-11-24):** NADRA sandbox issued a credential → Shop A
session `AGE_OVER_18` → relay → proof disclosing only `AGE_OVER_18=true` →
VERIFIED on API-031 and API-033; replay → 400. HEC/AU/LinkedIn builders checked
with throwaway keys. This added one test user + pairing to the dev DB.

## Still to do in later phases

- **Credentials already in web wallets are the old raw-field kind** and can't
  satisfy a predicate. Re-add them (or clear the web vault) before the demo.
- **Extension, demo/sp-server.mjs, verifier/create** still send
  `requestedFields` / read `verifiedFields`. Sessions now need `{ predicate }`.
  The web Requests page should work since `requestedFields` = `[predicate]`,
  but it shows `true` as a "value". Fix that in Phase 7.
- `scripts/verify-flow.mjs` still checks `verified_fields`; it needs updating.
- Issuer Zod `.errors` → `.issues` bug (fix list #3) is not fixed yet.

---

# NexusID — Phase 0 Audit (2026-11-24, demo story in docs/DEMO_BUILD.md §1)

Phase 0 of docs/DEMO_BUILD.md §4. Every later phase starts from this section.
No code was changed for this audit. Backend tests ran against `nexusid_db_test`.

**Main finding:** there is no predicate catalog in the code. No `AGE_OVER_18`
appears in any service, package or app. Credentials carry raw fields such as
`degree_title`, and outcomes carry raw values. Step 10 ("your strongest
moment") currently shows the opposite of the privacy claim.

## Demo story, step by step

| #   | Step                                       | Verdict                           | Files involved                                                                                                                                             | What's missing                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Landing                                    | **WORKS**                         | `apps/web/app/page.tsx`                                                                                                                                    | Headline "Prove what matters. Hide what doesn't." is there. Only the Phase 8 restyle is left.                                                                                                                                                                                                            |
| 2   | SP registers, API key, ticks `AGE_OVER_18` | **PARTIAL**                       | `app/auth/provider-register`, `app/verifier/api-keys`, `app/verifier/create`, `services/backend/src/services/verifier-account.service.ts`                  | Registration, show-once key and rotation work and are tested. No predicate catalog, no API-045/046. `verifier/create` only builds a snippet in the browser from raw field keys (`age`, `age_over_18`, `degree_title`) and saves nothing. Route drift from the SRS: `/verifiers/register`, `/me/api-key`. |
| 3   | Phone wallet shows cards                   | **MISSING**                       | `apps/mobile/App.tsx`, `apps/mobile/src/**`                                                                                                                | `App.tsx` is the React Native template screen. `package.json` has no react-native dependencies and none are installed. The screens in `src/` are never wired in. Stand-in: web wallet (`app/dashboard/credentials`). No biometric gate (FR-015).                                                         |
| 4   | Add NADRA credential live                  | **PARTIAL**                       | `services/issuers/nadra/src/routes.ts`, `apps/web/components/AddCredentialModal.tsx`                                                                       | CNIC → OTP → credential works from the web modal. No phone flow. **Bug:** issuers use Zod 4.5.4, where `parsed.error.errors` is undefined, so invalid input throws a 500 instead of a 400 with a message (NADRA, AU, LinkedIn).                                                                          |
| 5   | Extension pairing QR                       | **PARTIAL**                       | `apps/extension/popup.js`, `background.js`, `services/backend/src/services/qr-challenge.service.ts`, `pairing.service.ts`                                  | Extension QR has a countdown and an expired state. API-023–027 tested (single use, expiry). No phone scanner; pairing goes through web `/pair`.                                                                                                                                                          |
| 6   | Shop A checkout detected                   | **PARTIAL**                       | `demo/sp-server.mjs` (:5500), `apps/extension/content.js`                                                                                                  | Snippet detection and relay work. Demo site is "Demo Job Portal" asking for `degree_title`/`university`. No Shop A, no age check, no locked checkout, not in `dev-start.sh`.                                                                                                                             |
| 7   | Push → request on phone                    | **MISSING** (phone)               | `services/backend/src/services/notification.service.ts`, `apps/web/app/dashboard/requests/page.tsx`                                                        | FCM code exists but nothing registers a push token. Web stand-in shows a minutes countdown (not 120 s) and the decoded raw values instead of "WILL BE CONFIRMED: Age over 18" / "NEVER SHARED: …".                                                                                                       |
| 8   | Fingerprint → proof → verified             | **PARTIAL**                       | `packages/sd-jwt/src/holder.ts`, `apps/web/lib/webHolder.ts`, `packages/sd-jwt/src/verifier.ts`                                                            | ALG-001 runs in the browser with a WebCrypto key, not Android Keystore. No fingerprint, no 3-step progress. ALG-002 on the backend is solid (signature, KB-JWT, nonce, 60 s proof age, revocation).                                                                                                      |
| 9   | Popup **Verified** + shop unlocks          | **PARTIAL**                       | `apps/extension/popup.js`, `background.js`, `demo/sp-server.mjs`                                                                                           | Polling API-033 → Verified works. The popup lists verified field values. Polling uses `setInterval`, not `chrome.alarms`, so it stops when the service worker is shut down. No distinct Failed/Expired states. No checkout unlock.                                                                       |
| 10  | SP log, no PII                             | **PARTIAL (privacy claim fails)** | `apps/web/app/verifier/dashboard/page.tsx`, `services/backend/src/services/verification.service.ts`, `schema.prisma` (`VerificationResult.verifiedFields`) | Log exists but shows raw field names. `verification_results.verified_fields` stores claim values and the outcome includes `verifiedFields` (breaks BR-015 / NFR-010). Page fetches once, no auto-refresh.                                                                                                |
| 11  | Decline / expire / replay                  | **PARTIAL**                       | `services/backend/src/routes/verification.route.ts`, `src/__tests__/verification-flow.test.ts` (Tests 5, 7, 8)                                             | All three work on the backend and are tested. Expiry is checked only on read; no ALG-005 cron. API-037 (fail) missing. No phone UI; popup has no Expired state.                                                                                                                                          |
| 12  | History on phone + web                     | **PARTIAL**                       | `apps/web/app/dashboard/history/page.tsx`, API-038                                                                                                         | Web history works. Phone history not runnable. No delete (API-039/040).                                                                                                                                                                                                                                  |

## Infrastructure checks

- **`dev-start.sh`:** starts only Postgres, the backend and the web app. It does
  not start the 4 issuers, ML or the demo shop. All 7 services answered
  `/health` with 200 during the audit, but they had been started separately.
  The script was not run (all ports in use). Minor: the `&& || &&` chain on
  the Postgres step prints "Started" even when the container was already healthy.
- **`npx tsc --noEmit`:**
  - Pass: `services/backend`, `apps/web`, `packages/sd-jwt`, root project references.
  - **Fail: `packages/types`** — TS18003: `index.ts` is at the package root but
    the tsconfig only includes `src/**`.
  - **No tsconfig:** the 4 issuers, `apps/mobile`, `apps/extension` (plain JS).
    A one-off check of the issuers finds 16 errors: the Zod `.errors` bug
    (real runtime bug), plus HEC import extensions and `unknown` catch errors.
- **Tests:** backend Jest 65/65 pass against `nexusid_db_test`.
- **Seed data:** `npm run db:seed` (`services/backend/src/db/seed.ts`) seeds the
  4 issuers (the database holds real keys, not placeholders), "Demo Job
  Portal" with key `demo_api_key_12345`, and a demo user with a placeholder
  public key.
  - No `seed:demo`, no Shop A, no `AGE_OVER_18`, no demo credentials.
  - The dev database holds leftover test data: 7 verifiers (3 duplicate
    "VerifyFlow SP" rows from `scripts/verify-flow.mjs`), 28 users, 27 pairings.
- **Doc drift:** CLAUDE.md says the database is `nexusid`; it is `nexusid_db`.
  `docs/SRS.md` is empty (0 bytes).

## Fix list, in order

1. **Predicate catalog end to end (fold into Phase 1).** The 9 codes in
   `packages/types`; issuers sign predicate claims; sessions take a configured
   predicate; API-045/046 save requirements; outcome and `verification_results`
   hold only predicate, outcome, proof hash and issuer. Steps 2, 6, 7, 9 and 10
   depend on this.
2. **`seed:demo` + demo reset:** Shop A with a known key and `AGE_OVER_18`;
   clear leftover verifiers, users and pairings. Fix the `packages/types`
   tsconfig in the same pass.
3. **Issuer Zod bug:** `.errors` → `.issues` in the 4 issuer route files; add
   tsconfigs to the issuers so `tsc` catches this kind of bug.
4. **Remaining backend gaps:** API-037 fail, ALG-005 expiry cron, API-039/040
   history delete.
5. **`dev-start.sh`:** start the issuers, ML and the shop; fix the Postgres-step chain.
6. **Phase 3, SP portal:** requirements page that saves; dashboard refreshing
   every 3 s with predicate and outcome columns.
7. **Phase 4:** Shop A checkout page that unlocks on VERIFIED.
8. **Phase 5, extension:** remove field values from the popup, add Expired and
   Failed states, move polling to `chrome.alarms`.
9. **Phase 6, mobile:** make it runnable (dependencies, wire `App.tsx` to
   `src/navigation`), then scan QR, push, consent with biometrics, on-device
   proof, history. Biggest risk; the web stand-in is the fallback, so decide early.
10. **Phase 7/8:** user portal history delete, polish.

---

# NexusID — FYP Status Snapshot (2026-11-24, /fyp-status vs docs/REQUIREMENTS.md)

Checked against the real tree, not prior notes. Typecheck clean (backend, web,
sd-jwt). Backend Jest 65/65. `node scripts/verify-flow.mjs` 38/42 (the 3 FAILs
are BR-015 ×2 and ML; 1 N/A). Older snapshots below are kept for history —
note they label some FRs wrongly (see "Doc corrections").

## 1. Complete — with proof

| Item                                                                                                                                                | Proof                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| FR-001 Registration · API-017/018                                                                                                                   | services/backend/src/controllers/web-auth.controller.ts                                                 |
| FR-003 Pairing · FR-031 QR · API-023–027 · ALG-006                                                                                                  | services/backend/src/services/qr-challenge.service.ts, pairing.service.ts, apps/extension/background.js |
| FR-004 Issuer registry · API-012/013                                                                                                                | services/backend/src/routes/issuers.route.ts                                                            |
| FR-006/007 Issuance (all 4 issuers, holder-bound `cnf.jwk`, no `sub`) · API-003–010                                                                 | services/issuers/*/src/credential-builder.ts, packages/sd-jwt/src/issuer.ts                             |
| FR-010 View credentials (web) · FR-012 encrypted at rest (web)                                                                                      | apps/web/app/dashboard/credentials/page.tsx, apps/web/lib/webVault.ts                                   |
| FR-016 Expiry enforced at verify (issuer `exp`)                                                                                                     | packages/sd-jwt/src/verifier.ts (jwtVerify)                                                             |
| FR-020/021/022/023 Summary, approve, prove, decline (web stand-in) · API-034/036                                                                    | apps/web/app/dashboard/requests/page.tsx, apps/web/lib/webHolder.ts                                     |
| FR-026/027 Proof generation + submit · ALG-001                                                                                                      | packages/sd-jwt/src/holder.ts, apps/web/lib/webHolder.ts                                                |
| FR-028 History · API-038                                                                                                                            | apps/web/app/dashboard/history/page.tsx                                                                 |
| FR-032/033/034 Detect+relay, in-browser notice, result · API-032/033                                                                                | apps/extension/content.js, background.js (chrome.notifications)                                         |
| FR-035 Role selection                                                                                                                               | apps/web/app/auth/login/page.tsx                                                                        |
| FR-038 User dashboard (pairings + history)                                                                                                          | apps/web/app/dashboard/devices/page.tsx                                                                 |
| FR-039/040 SP registration, hashed API key, rotation · ALG-009                                                                                      | services/backend/src/services/verifier-account.service.ts                                               |
| FR-042 SP dashboard · API-047/048                                                                                                                   | services/backend/src/routes/analytics.route.ts, apps/web/app/verifier/                                  |
| FR-043 Session + backend nonce · API-030/031                                                                                                        | services/backend/src/services/verification.service.ts                                                   |
| FR-044 / ALG-002 VerifyProof: issuer sig, disclosures, KB-JWT, holder binding, nonce, aud, proof age ≤60 s, exact-field match, revocation · ALG-003 | packages/sd-jwt/src/verifier.ts, verification.service.ts submitProof                                    |
| API-049–051 Portal auth proxy                                                                                                                       | apps/web/app/api/auth                                                                                   |

## 2. Claimed by the docs, missing from the code

| Requirement                                                                                                               | Gap                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| FR-005 Predicate catalog · BR-021                                                                                         | No predicate code (`AGE_OVER_18` …) anywhere in services/packages/apps. Credentials carry raw fields.                   |
| FR-041 · API-045/046 Verifier requirements                                                                                | No `/verifiers/requirements` routes; sessions take free-form `requestedFields`                                          |
| FR-045 AC / BR-015 / NFR-010 Predicate-only outcome                                                                       | Outcome and `verification_results.verified_fields` hold raw values                                                      |
| FR-002 / BR-017 / CON-009 Android Keystore key                                                                            | apps/mobile is the RN template (`App.tsx` = NewAppScreen, no RN deps). Web WebCrypto key stands in                      |
| FR-019 / NFR-007 Push to phone                                                                                            | FCM code exists; nothing registers a push token (no runnable mobile)                                                    |
| FR-036 QR sign-in (purpose SIGN_IN)                                                                                       | Not built                                                                                                               |
| FR-037 Recovery · API-011 `/reverify` (all issuers) · API-028/029                                                         | No reverify route on any issuer; no `/recovery/*`                                                                       |
| API-021 `/users/challenge` · ALG-007                                                                                      | Missing. API-020 `/users/login` verifies a **client-supplied** challenge → a captured signature can be replayed forever |
| FR-017 / ALG-008 / API-041 Issuer-signed revocation                                                                       | Missing. Only user-initiated `/credentials/:id/revoke` exists (not in SRS)                                              |
| FR-018 / ALG-004 / API-014–016 credential-records                                                                         | Missing (wallet uses `/credentials` instead)                                                                            |
| FR-024 / ALG-005 Session-expiry cron                                                                                      | No job; expiry is checked lazily on access                                                                              |
| FR-025 / API-037 `/verification/fail/:id`                                                                                 | Missing (web shows "No matching credential" but never reports)                                                          |
| FR-030 / API-039/040 History delete                                                                                       | Missing                                                                                                                 |
| FR-009 Profile edit · FR-011 delete credential · FR-013/014 invalidate + re-issue · FR-015 in-app auth · FR-008 ID upload | Missing                                                                                                                 |
| NFR-019 SP rate limit (60/min)                                                                                            | Missing (only AU issuer is rate-limited)                                                                                |
| ML fraud scoring wired to issuers                                                                                         | ML :5001 healthy, never called                                                                                          |

Path drift (works, but not the SRS path): API-042 is `/verifiers/register`,
API-043/044 are `GET /verifiers/me` + `POST /verifiers/me/api-key`.

## 3. Empty, stubbed or unreferenced

- Unreferenced: `services/backend/src/services/zkp.service.ts` (225 lines), `fraud-detection.service.ts` (41 lines); `circuits/age_verification.circom` (ZKP not in SRS)
- Empty: `docs/SRS.md` (0 bytes, yet cited as source of truth), `apps/web/tsc-output.txt`, root file `NODE_OPTIONS=--experimental-vm-modules`
- Stub: `apps/mobile/App.tsx` (RN sample app)
- Strays: root `0`; tracked `tmp/` (copies of CLAUDE.md, REQUIREMENTS.md, rule files); `services/backend/*.mjs` ad-hoc scripts; `services/backend/src/db/schema.sql` (superseded by Prisma)
- No test script in `packages/sd-jwt` (CLAUDE.md lists `npm test --workspace=packages/sd-jwt`)

## 4. Open items — ranked by what blocks the defense demo

1. **Mobile app not runnable** — 3 of 6 "must work" demo items are mobile. Web stand-in covers the flow; say so up front (docs/DEMO_SCRIPT.md).
2. **FR-005 + FR-041 + BR-015 predicates** — the core privacy claim, and FR-041 is inside the portal demo item. ~1–2 days: issuer-signed predicate claims, requirements routes, outcome = predicate + VERIFIED/FAILED only.
3. **API-020 replayable device login** — add API-021 server challenge (60 s, single-use). Small; a panel security question waiting to happen.
4. **FR-017/ALG-008 issuer revocation** — the SRS model is issuer-revokes; ours is user-revokes. Be ready to explain or add API-041.
5. **FR-036 QR sign-in** — High-priority FR, reuses the pairing QR machinery (purpose SIGN_IN).
6. **FR-025/API-037 fail + FR-024/ALG-005 cron** — small backend items; lazy expiry already holds for the demo.
7. **FR-037 recovery + `/reverify`** (nice-to-have per CLAUDE.md).
8. **FR-030 history delete, FR-011/013/014, FR-009, FR-015, FR-008** — lower priority.
9. **ML wiring, NFR-019 rate limit, extension TS + chrome.alarms.**

## Doc corrections found

- Older snapshots below mislabel FRs: "FR-029/033/034 Provider accounts" are FR-035/039/040; "FR-017 Notify platform" is FR-023 + FR-034.
- CLAUDE.md: DB is `nexusid_db` (not `nexusid`); `prisma migrate status` only finds `DATABASE_URL` when run from `services/backend`; sd-jwt has no test script.

---

# NexusID — FYP Status Snapshot (2026-11-23, updated end of session)

Supersedes the 2026-11-22 /fyp-status snapshot below for everything touched
tonight. Stack is NOT persisted — everything is running as dev `tsx watch`
processes from this session (backend 4000, issuers 4001-4004, ML 5001, web
3000, Postgres/Redis in Docker). **Run `/boot-stack` first thing tomorrow**
before touching anything — nothing survives a reboot.

## Resume here (next session)

Last done: extension icons confirmed present and valid; extension verified
loading in Chrome 156 (load it via `chrome://extensions` → Load unpacked →
`apps/extension`; branded Chrome ignores `--load-extension`). Dead
`apps/web/lib/api.ts` removed. If `npx tsc --noEmit` in apps/web shows
`.next/types/.../pairing/[[...path]]` errors, they are stale build output —
run `next dev` once to regenerate.

Next, pick one (see "Open items" below):

- **Predicate-only outcomes (FR-045 AC6 / BR-015)** — recommended: ~1 day,
  core privacy claim the panel will probe.
- **Make the mobile app runnable** — biggest checklist gap (3 of 6 demo
  items), multi-day.

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

| FR                                       | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 Registration                      | Done (web + backend)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | auth.route.ts, users.route.ts, web-auth.controller.ts                                                                                                                                                                                               |
| FR-002 Device keys                       | Mobile: code only, not runnable. Web: workaround built tonight — browser-generated RSA keypair (`lib/webKeypair.ts`), not a fix for the mobile requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | apps/mobile/src/services/keystore.service.ts, apps/web/lib/webKeypair.ts                                                                                                                                                                            |
| FR-003 QR pairing                        | Done for demo (2026-11-23), on the SRS routes: API-023 `POST /qr-challenges` {purpose: PAIRING} (120 s QR window, BR-022), API-024 `GET /qr-challenges/:id` (x-pairing-token), API-025 `POST /qr-challenges/redeem` (ALG-006 single-use/expiry + ALG-007 device-key signature over `nexusid-qr:PAIRING:<id>:<code>`), API-026/027 `GET/DELETE /pairings`. Requests routed only to the paired user via the pairing token. Extension popup QR + "Copy code". **Web stand-in** for the phone (not in SRS): the QR is a portal link (`<PAIRING_WEB_URL>/pair#p=..&c=..`), so a phone camera opens `/dashboard/pair` → log in → Approve; the browser signs with its WebCrypto device key and calls the same API-025. Or Dashboard → Devices (paste code, list, revoke). Mobile scan screen signs via CryptoService and calls API-025 — written, not runnable (deps not installed). FR-036 QR sign-in (purpose SIGN_IN) not built                | services/backend/src/services/qr-challenge.service.ts, services/backend/src/services/pairing.service.ts, apps/extension/background.js, apps/web/lib/pairing.ts, apps/web/app/dashboard/pair/page.tsx, apps/mobile/src/screens/PairBrowserScreen.tsx |
| MOD-4/5 Approve (web stand-in)           | Done (2026-11-23): Dashboard → Requests lists requests routed via pairing; approve builds the SD-JWT presentation + KB-JWT in the browser (`lib/webHolder.ts`, mirrors `packages/sd-jwt` holder, cross-checked against `verifyProof`) from credentials kept in `lib/webWallet.ts`; decline supported. Verified live end-to-end (HEC issue → pair → extension request → approve/decline → extension result). Hardened same day: holder key is a non-extractable WebCrypto key and credentials are AES-GCM encrypted, both in IndexedDB (`lib/webVault.ts`); backend refuses proofs from revoked credentials via the stored SD-JWT `jti` (BR-006)                                                                                                                                                                                                                                                                                            | apps/web/app/dashboard/requests/page.tsx, apps/web/lib/webHolder.ts                                                                                                                                                                                 |
| FR-029/033/034 Provider accounts         | Done (2026-11-23): role selection at login, provider sign-up/login (separate `nexusid_verifier_token` cookie, `role: verifier` JWT refused on End User routes), API keys stored as SHA-256 only, shown once, rotation invalidates the old key immediately (BR-009). Portal pages (Overview, Analytics, API Keys, Integration, Create) on real data — no mocks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | services/backend/src/services/verifier-account.service.ts, apps/web/app/verifier/                                                                                                                                                                   |
| FR-017 Notify platform                   | Done (2026-11-23): extension fires `nexusid:result` (status + requestId = session ID) on the page; the site confirms server-side via API-031 `GET /verification/sessions/:id/outcome` + API key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | apps/extension/content.js, demo/sp-server.mjs                                                                                                                                                                                                       |
| FR-043/032/034/045 Verification sessions | Done (2026-11-23), on the SRS routes: API-030 `POST /verification/sessions` (SP server, API key; backend-generated single-use nonce; 120 s response window, FR-024/BR-022) → page carries only `data-session-id` + `data-nonce` → extension relays via API-032 `POST /verification/request` with the **pairing token only** (session + nonce checked, single relay, unknown/expired/invalid → nothing sent) → extension polls API-033 with a per-request **poll secret** → SP reads API-031. The SP API key never reaches the browser. Only the routed user can answer a request. Verified with the real extension in headless Chrome (pair → relay → decline → page + server-confirmed outcome). Demo SP: `node demo/sp-server.mjs` → http://localhost:5500 (replaces demo/test-verifier.html). Gap: outcome still carries disclosed field values (FR-045 AC6 / BR-015 want predicate-only outcomes — needs the FR-005 predicate catalog) | services/backend/src/services/verification.service.ts, services/backend/src/routes/verification.route.ts, apps/extension/background.js, apps/extension/content.js, demo/sp-server.mjs                                                               |
| MOD-6 User history                       | Done (2026-11-23): real history (platform, fields, outcome, response time) replaces the mock page; dashboard home counts are real                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | apps/web/app/dashboard/history/page.tsx                                                                                                                                                                                                             |
| FR-004 Issuer key registry               | Done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | services/backend/src/routes/issuers.route.ts                                                                                                                                                                                                        |
| FR-006 Attribute submission              | Done, all 4 issuers verified end-to-end tonight                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | services/issuers/*/src/routes.ts                                                                                                                                                                                                                    |
| FR-007 Issuance + storage                | **Done end-to-end via web** (all 4 issuers, Postgres metadata storage). Mobile on-device storage still not runnable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | services/backend/src/services/credentials.service.ts, Credential model                                                                                                                                                                              |

## Modules (updated)

| MOD                    | State                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MOD-1 Onboarding       | Partial — no mobile pairing; web registration + web keypair generation now works                                                                                                                                                                 |
| MOD-2 Wallet           | **Web: done tonight** — real listing, revocation, add-credential flow. Mobile: code only, not runnable                                                                                                                                           |
| MOD-3 Notifications    | Backend done; mobile not runnable                                                                                                                                                                                                                |
| MOD-4 Approve/Reject   | Backend done; mobile not runnable                                                                                                                                                                                                                |
| MOD-5 Proof generation | Library done; mobile not runnable                                                                                                                                                                                                                |
| MOD-6 History          | Done (2026-11-23) — real history (platform, fields, outcome, response time) replaces the mock page                                                                                                                                               |
| MOD-7 Extension        | **Loads now** (PNG icons generated from the SVGs). QR pairing, session detection + relay, poll-secret polling, result display all verified with the real extension (2026-11-23). Still plain JS with setInterval (rules want TS + chrome.alarms) |
| MOD-8 Web portal       | Verifier side done; **user credentials page done tonight** (was a copy, now real)                                                                                                                                                                |

## Open items (ranked by likely next-session impact)

Closed 2026-11-23: MOD-6 history (real data), extension icons (PNGs present,
extension verified loading in Chrome 156 via CDP `Extensions.loadUnpacked`),
dead `apps/web/lib/api.ts` deleted, mock-data fallbacks gone (catch blocks
render an empty state).

1. Mobile app still not runnable at all (FR-002/003, MOD-2/3/4/5 mobile side) — the web keypair workaround does NOT replace this; it's web-only.
2. FR-045 AC6 / BR-015: verification outcome still carries disclosed field values; needs predicate-only outcomes (FR-005 predicate catalog).
3. issuer-au has no Dockerfile at all (`infra/docker-compose.yml` expects `services/issuers/air-university/Dockerfile`; needs Puppeteer/Chromium deps) — moot while running via `npm run dev`.
4. Extension: plain JS + setInterval; rules want TS + chrome.alarms (MV3 workers get killed after ~30 s idle, so long polls can be cut off).
5. `zkp.service.ts` and `fraud-detection.service.ts` still unreferenced anywhere; ML service (:5001) still never actually called from the backend despite being up and healthy.
6. `docs/SRS.md` still empty on disk despite being cited as the source for `docs/REQUIREMENTS.md`.
7. In-memory-only state, two instances now: NADRA's OTP session store (pre-existing, flagged before) and tonight's new `pendingLinkedin` map in `credentials.service.ts`. Both are known, accepted single-process limitations — would need Redis for a real deployment, not needed for the FYP defense.

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
