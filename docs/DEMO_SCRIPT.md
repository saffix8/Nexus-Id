# NexusID — FYP Evaluation Demo Script

Target length: **12–15 minutes** of clicking, then Q&A.
Story: _"A graduate applies for a job. The job portal needs proof of their
degree — and nothing else. NexusID proves it without the portal ever seeing
their name, registration number, or the rest of the credential."_

> **Honest framing for the panel:** the Android wallet is not runnable yet. In
> this demo the **web dashboard plays the phone** (holder wallet). It holds a
> non-extractable WebCrypto RSA-2048 key and AES-GCM-encrypted credentials in
> IndexedDB, and builds the SD-JWT presentation + key-binding JWT in the
> browser using the same algorithm as `packages/sd-jwt` (ALG-001). Say this
> up front — don't let them discover it.

---

## 0. Before the panel walks in (T-30 min)

| #   | Do                                                                                                                                            | Check                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | `/boot-stack` (or `bash dev-start.sh`)                                                                                                        | All of 4000–4004, 5001, 3000 up                                      |
| 2   | `node demo/sp-server.mjs` (separate terminal)                                                                                                 | Prints `Demo Job Portal (Service Provider) on http://localhost:5500` |
| 3   | `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension`                                                                 | NexusID icon in toolbar, popup shows **Idle**                        |
| 4   | Run the e2e check: `node scripts/verify-flow.mjs`                                                                                             | Steps 1–4 all PASS (see "Known gaps" for the expected FAILs)         |
| 5   | Open these tabs **in one Chrome window, in this order**:                                                                                      |                                                                      |
|     | Tab A `http://localhost:3000/auth/register` (holder)                                                                                          |                                                                      |
|     | Tab B `http://localhost:3000/auth/provider-register` (SP portal) — _use a second Chrome profile or incognito so the two logins don't collide_ |                                                                      |
|     | Tab C `http://localhost:5500` — **do not load until Scene 5** (session nonce lives 120 s)                                                     |                                                                      |
| 6   | Zoom browser to 125 %, close unrelated tabs, mute notifications                                                                               |                                                                      |
| 7   | Have a fresh email ready, e.g. `demo.<date>@example.test`                                                                                     | Never reuse — registration is unique per email                       |

**Rule of thumb:** the holder's credential lives in _that browser's_
IndexedDB. Add the credential, pair, and approve **all in the same Chrome
profile** (Tab A + extension). Clearing site data = empty wallet.

---

## Scene 1 — Holder registration & device key (FR-001, FR-002) · ~1.5 min

| Click                                                    | Evaluators see                                                                              | Say                                                                                                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab A → fill **Full name / Email / Password** → Register | Redirect to **Dashboard**: _Total Credentials 0_, _Recent Activity — No verifications yet._ | "Account created. In the background the browser just generated an RSA-2048 key pair. The private key is a **non-extractable** WebCrypto key — even our own JavaScript can't read it out. Only the public key went to the server." |
| _(optional)_ DevTools → Application → IndexedDB          | Encrypted vault entries, no PEM private key                                                 | "On Android this is the Keystore; on web it's a non-extractable CryptoKey."                                                                                                                                                       |

---

## Scene 2 — Get a credential from an issuer (FR-006, FR-007) · ~2 min

| Click                                                                                                    | Evaluators see                                                                                              | Say                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar → **My Credentials**                                                                             | Empty state _No credentials yet_                                                                            |                                                                                                                                                                              |
| **Add a Credential** → **Higher Education Commission**                                                   | Form: _Full Name (as on degree)_, _Degree / Roll Number_, _University Name_                                 | "HEC is one of four issuers — NADRA, HEC, Air University, LinkedIn. Each is its own microservice with its own signing key."                                                  |
| Fill e.g. `Muhammad Safi Ur Rehman` / `HEC/2024/123456` / `Air University Islamabad` → **Verify Degree** | _Verifying…_ → **Credential Added**                                                                         | "HEC validated the attributes and issued an **SD-JWT**: every claim is salted and hashed; the signed token holds only the hashes. The raw values went to this browser only." |
| Close modal                                                                                              | Card **Higher Education Commission**, badge **Active**, fields _Degree Title, University, Graduation Year…_ | "The server stores _metadata only_ — issuer, type, status, field labels. Never values."                                                                                      |

> Backup if HEC hiccups: **NADRA Pakistan** (CNIC + mobile → **Send
> Verification Code**; the OTP is printed in the NADRA terminal as
> `[SANDBOX] OTP for session …`). HEC stays the main path because the demo portal requests degree fields.

---

## Scene 3 — Service Provider onboarding (FR-039–FR-042) · ~2 min

| Click                                                                                        | Evaluators see                                                             | Say                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab B → register org: _email, password, Organisation name, domain_ (e.g. `jobs.example.com`) | Verifier **Dashboard**                                                     | "This is the relying party — a job portal."                                                                                                   |
| Sidebar → **API Keys**                                                                       | **Active API key** with prefix `nxk_…`, full key shown **once**            | "Stored as SHA-256 only. If I rotate, the old key dies immediately (BR-009). The key lives on the SP's _server_; it never reaches a browser." |
| Sidebar → **Create** (verification builder)                                                  | _Choose What to Request_ checklist, **Widget Preview**, **Generated Code** | "The SP picks exactly which fields it needs. Here's the snippet they'd embed."                                                                |
| Sidebar → **Analytics**                                                                      | Real counts (no mock data)                                                 | Keep this tab — come back in Scene 7.                                                                                                         |

> The live demo site (Tab C) uses the seeded **Demo Job Portal** SP, not the one
> you just created. Say: "for the next part I'll use a pre-registered portal."

---

## Scene 4 — Pair the browser extension (FR-003, FR-031) · ~1.5 min

| Click                                                                                                      | Evaluators see                                   | Say                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolbar → NexusID popup → **Pair device**                                                                  | QR code + countdown (120 s, BR-022)              | "The extension is untrusted on its own. It has to be paired to a holder device."                                                                                                                                          |
| **Copy code**                                                                                              |                                                  |                                                                                                                                                                                                                           |
| Tab A → sidebar **Devices** → paste into the box (`http://…/pair#p=…&c=…`) → **Pair device** → **Approve** | **Browser paired.** and a row in the device list | "The holder's device **signs** the challenge `nexusid-qr:PAIRING:<id>:<code>` with its private key. The backend checks the signature against the registered public key — single-use, expires in 2 minutes (ALG-006/007)." |
| Popup                                                                                                      | Status flips to **Paired**                       |                                                                                                                                                                                                                           |

> If the QR is reachable from a real phone on the LAN, scanning it opens
> `/dashboard/pair` on the phone — nicer visually, but the copy-code path is
> the reliable one.

---

## Scene 5 — The verification (core flow, FR-019–FR-027, FR-032–FR-034, FR-043–FR-045) · ~3 min

**Start the clock: from loading Tab C you have 120 s to approve.**

| Click                                | Evaluators see                                                                                                   | Say                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tab C → load `http://localhost:5500` | **Demo Job Portal — Apply — Software Engineer**, _Verify your degree with NexusID_                               | "The portal's server just opened a session with its API key and got a one-time **nonce**. The page only contains the session ID and nonce."                                                                                                                                          |
| Popup                                | **Requesting** → **Waiting for phone approval…**                                                                 | "The extension spotted the request and relayed it with its pairing token — so it goes to _this_ holder only."                                                                                                                                                                        |
| Tab A → sidebar **Requests**         | Request from **Demo Job Portal** asking for **degree_title, university** — _not_ name, _not_ registration number | "Selective disclosure: the holder sees exactly what's asked."                                                                                                                                                                                                                        |
| **Approve & share**                  | Request leaves the list                                                                                          | "Right now the browser picked 2 of 5 disclosures, built a key-binding JWT over them with the nonce and the verifier's ID as audience, and signed it with the device key. The backend checked: issuer signature, each disclosure hash, key binding, that the credential was issued to this very device key, nonce, audience, proof age under 60 s, that exactly the requested fields were disclosed, and revocation." |
| Popup                                | **Verified!**                                                                                                    |                                                                                                                                                                                                                                                                                      |
| Tab C                                | **Server-confirmed outcome:** verified — `{"degree_title":"BS Computer Science","university":"…"}`               | "The page didn't trust the extension event — it asked its own server, which asked NexusID with the API key (API-031). Note what's **not** here: name, registration number, graduation year."                                                                                         |

---

## Scene 6 — The "what if" moments · ~2 min (pick 1–2)

**a) Decline (FR-023)** — reload Tab C → Tab A **Requests** → **Decline** →
popup shows **Rejected**, Tab C shows rejected outcome. _"The user is always in control."_

**b) Revocation (BR-006)** — Tab A → **My Credentials** → revoke the HEC
card → card turns dimmed with red **Revoked** badge → reload Tab C →
**Approve & share** → refused (_credential has been revoked_).
_"Revocation is checked on every proof. Postgres is the source of truth; the
blockchain audit write is best-effort and fails silent, so the system keeps
working even when Fabric is down."_
⚠ Do this **last** — after it the HEC credential is unusable for the rest of the demo.

**c) Replay** — not clickable. Say: _"Each nonce is single-use; submitting the
same proof twice is rejected — our automated check proves it."_ (verify-flow step 4).

---

## Scene 7 — History & analytics (FR-028–FR-030) · ~1 min

| Click                 | Evaluators see                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Tab A → **History**   | Demo Job Portal · fields shared · outcome · response time                                      |
| Tab B → **Analytics** | Request counts updated (from the seeded portal, if same SP; otherwise show via Tab B overview) |

Close: _"Issuer → holder → verifier, with the verifier learning only what was
asked, bound to this session, this verifier, and this device."_

---

## If something breaks mid-demo

| Symptom                                                  | Fix (≤ 30 s)                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Popup stuck on _Requesting_ / Tab C says session expired | > 120 s passed. Reload Tab C, approve faster.                                            |
| _No matching credential in this browser._ on Approve     | Credential was added in a different profile/browser. Add HEC again in Tab A.             |
| Popup shows **Idle** after pairing                       | MV3 worker went to sleep. Click the popup again; if still unpaired, re-pair (Scene 4).   |
| `Unknown verification session`                           | Tab C was loaded twice. Reload once more.                                                |
| Any service down                                         | `curl localhost:4000/health`; restart that one service — logs are in the scratchpad dir. |

---

## Known gaps — avoid on stage, be ready if asked

From `node scripts/verify-flow.mjs` on 2026-11-24 after fixes
(42 checks: 38 PASS, 3 FAIL, 1 N/A). Expected FAILs are exactly 1–2 below.

1. **Outcome isn't predicate-only (BR-015 / FR-045 AC6).** The SP outcome and
   `verification_results.verified_fields` contain the disclosed raw value
   (`"BS Computer Science"`). If asked: "predicate claims such as
   `DEGREE_BACHELOR_OR_HIGHER` are designed (FR-005) but not yet issued; today
   the SP receives only the fields it requested, nothing else."
2. **ML fraud service is up but never called.** No issuer or backend path hits
   :5001. Don't claim fraud detection in the live flow.
3. **Mobile app not runnable.** The web dashboard stands in (see top).
4. **Credentials issued before 2026-11-24 no longer verify.** They lack the
   `cnf.jwk` holder binding. Use a fresh account (the script already does).

### Fixed 2026-11-24, safe to show if probed

- **No identifier in the always-visible payload.** Credentials no longer carry
  `sub` (it used to hold the CNIC / registration number). LinkedIn
  `profile_id` is now selectively disclosable. Decode a credential on jwt.io:
  only issuer metadata, `jti`, `exp`, `_sd` digests and `cnf` are visible.
- **Holder binding (RFC 7800).** Every credential carries the holder's device
  key as `cnf.jwk`. The backend refuses a proof whose key-binding JWT was
  signed by any other key, so a copied credential is useless to anyone else.
- **Proof must answer the request exactly.** Missing or unrequested fields are
  rejected (ALG-002 step 6).
- **Proof age ≤ 60 s** (ALG-002 step 4) and session expiry both enforced.
- JWKS on all four issuers serve standard `n`/`e` JWKs; revocation reason is
  stored; admin audit routes need an `ADMIN_EMAILS` allowlist.
