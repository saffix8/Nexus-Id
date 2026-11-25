# NexusID API Reference

> Written from the route code at commit `0dc5dd4` (26 Nov 2026), not from the SRS. Where the two disagree, this file follows the code and says so.
> SRS IDs (`API-xxx`) are from `docs/REQUIREMENTS.md`. Features that are designed but not built are in `docs/DESIGNED_FEATURES.md`.

**Totals:**

- 54 backend endpoints
- 16 issuer endpoints (some reachable on two paths, as noted)
- 3 ML-service endpoints
- 8 web-portal auth actions

The four issuers are **simulated** stand-ins for NADRA Verisys, HEC, the AU student portal and LinkedIn (SRS §1.5).

---

## 1. Conventions

### Base URLs and mounting

Backend base: `http://localhost:4000`. All routers are mounted under `/api/v1` in `services/backend/src/index.ts`:

| Prefix                  | Router file                                          |
| ----------------------- | ---------------------------------------------------- |
| `/api/v1/auth`          | `services/backend/src/routes/auth.route.ts`          |
| `/api/v1/users`         | `services/backend/src/routes/users.route.ts`         |
| `/api/v1/credentials`   | `services/backend/src/routes/credentials.route.ts`   |
| `/api/v1/verification`  | `services/backend/src/routes/verification.route.ts`  |
| `/api/v1/issuers`       | `services/backend/src/routes/issuers.route.ts`       |
| `/api/v1/analytics`     | `services/backend/src/routes/analytics.route.ts`     |
| `/api/v1/admin`         | `services/backend/src/routes/admin.route.ts`         |
| `/api/v1/qr-challenges` | `services/backend/src/routes/qr-challenges.route.ts` |
| `/api/v1/pairings`      | `services/backend/src/routes/pairings.route.ts`      |
| `/api/v1/verifiers`     | `services/backend/src/routes/verifiers.route.ts`     |

`GET /health` is mounted at the root, outside `/api/v1`.

### Response envelope

Helpers are in `services/backend/src/lib/response.ts`.

```jsonc
// success
{ "success": true, "data": <payload>, "timestamp": "<ISO-8601>" }
// error
{ "success": false, "error": "<message>", "details"?: {...}, "timestamp": "<ISO-8601>" }
```

- Verification routes add `details: { code, ...}` to errors. `code` is the machine-readable reason, e.g. `NONCE_REPLAYED` (`verification.route.ts` `handleServiceError`).
- `GET /verification/history` adds `page`, `limit` and `total` next to `data`. It has no `has_more`.
- Validation status codes are not uniform across the code:
  - **400**: auth, users, qr-challenges, pairings, verifiers, analytics.
  - **422**: verification and the credential proxies.

  `.claude/rules/backend.md` asks for 422 on IF-009 (verifiers) as well. The code returns 400 there.

- Global errors (`services/backend/src/middleware/error.middleware.ts`):

  | Status | Cause                                                        |
  | ------ | ------------------------------------------------------------ |
  | 404    | `Route not found` (no route matched)                         |
  | 409    | Prisma `P2002` (unique violation)                            |
  | 404    | Prisma `P2025` (record not found)                            |
  | 400    | Prisma `P2003` (related record missing)                      |
  | 500    | anything else. The message is shown only outside production. |

### Authentication types

| Name used below       | How it is sent                                                                   | Checked by                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **None**              | nothing                                                                          | none                                                                                                                  |
| **User JWT**          | `Authorization: Bearer <HS256 JWT>`, `sub` = user ID                             | `verifyJWT` in `services/backend/src/middleware/auth.middleware.ts`. Tokens with `role: "verifier"` are refused.      |
| **SP JWT**            | `Authorization: Bearer <HS256 JWT>` with `role: "verifier"`, `sub` = verifier ID | `requireVerifierJWT` (same file)                                                                                      |
| **API key**           | `x-api-key: nxk_...`                                                             | `requireApiKey` in `services/backend/src/middleware/api-key.middleware.ts`. The key is looked up by its SHA-256 hash. |
| **API key or SP JWT** | either of the above                                                              | `requireVerifierAuth` (same file). A present but bad `x-api-key` is refused and is not retried as a JWT.              |
| **Pairing token**     | `x-pairing-token`                                                                | `pairing.service.ts` `resolvePairedUser` (SHA-256 lookup on `device_pairings.secret_hash`)                            |
| **Poll secret**       | `x-poll-secret`                                                                  | `verification.service.ts` `pollForExtension`                                                                          |
| **Challenge token**   | `x-challenge-token`                                                              | `qr-challenge.service.ts` `getStatus`                                                                                 |
| **Internal secret**   | `x-internal-secret`                                                              | inline in `credentials.route.ts`. Falls back to `"dev-internal-secret"` when `INTERNAL_SERVICE_SECRET` is unset.      |
| **Admin**             | User JWT whose `email` is in `ADMIN_EMAILS`                                      | `requireAdmin` (`auth.middleware.ts`). An unset list denies everyone.                                                 |

The SRS's "Device JWT" and "Portal JWT" are the **same token type** in code: HS256, `sub` = user ID, default lifetime `JWT_EXPIRES_IN` = 7 days. `verifyJWT` does not tell them apart.

The common 401 messages come from `auth.middleware.ts`:

- `Missing or malformed Authorization header`
- `Token has expired`
- `Invalid token signature`
- `Service Provider tokens cannot access End User routes`
- `A Service Provider login is required`

For API keys: `Missing x-api-key header`, `Invalid API key`.

CORS `allowedHeaders` (`index.ts`) lists only `Content-Type`, `Authorization` and `X-API-Key`. The custom `x-pairing-token` and `x-poll-secret` headers still work because every caller is either:

- server-side (the Next.js proxies), or
- the extension background worker with `host_permissions` (`apps/extension/manifest.json`, `apps/extension/src/background/index.ts`).

---

## 2. Health

### `GET /health`: API-001

- **Auth:** None
- **Response 200 (not enveloped):** `{ status: "ok", timestamp, environment, version }`

---

## 3. Auth and users

### `POST /api/v1/auth/register`: API-017

- **Auth:** None. The web portal calls it through API-050.
- **Body:** `{ name: string (min 1), email: email, password: string (min 8) }`
- **201:** `{ token, expires_at }`. The JWT carries `sub`, `email`, `name`.
- **Errors:**
  - 400: validation messages joined with `; `
  - 409: `An account with this email already exists`
- **Note:** End Users only. SRS API-017 also covers FR-039 (SP sign-up), which is implemented separately as `POST /verifiers/register`.
- **Source:** `controllers/web-auth.controller.ts` `webRegister`

### `POST /api/v1/auth/login`: API-018

- **Auth:** None. The web portal calls it through API-049, and the wallet calls it from `SignInScreen.tsx`.
- **Body:** `{ email, password }`
- **200:** `{ token, expires_at }`
- **Errors:**
  - 400: validation
  - 401: `Invalid email or password`
- **Note:** the SRS says API-018 is also "first step of account recovery". That branch is not built (see DESIGNED_FEATURES (a)).

### `POST /api/v1/users/register`: API-019

- **Auth:** None
- **Body:** `{ user_id: string, public_key: PEM "BEGIN PUBLIC KEY", push_token: string, device_info?: object }`
- **201:** `{ user_id, registered_at }`. It upserts the `User` by `user_id`.
- **Errors:** 400 validation
- **Note:** the route is unauthenticated and upserts by a caller-supplied ID, so anyone who knows a user ID could replace that account's key. No client in `apps/` calls it today: `api.service.ts` defines `register()`, but nothing uses it. The wallet uses `PUT /users/me/public-key` instead.
- **Source:** `controllers/auth.controller.ts` `register`

### `POST /api/v1/users/login`: API-020 (partial)

- **Auth:** None
- **Body:** `{ user_id, signature, challenge }`. The signature is over `challenge`, made with the registered device key.
- **200:** `{ token, expires_at }`. The JWT has `sub` only.
- **Errors:**
  - 400: validation
  - 401: `User not found` or `Signature verification failed`
- **Note:** ALG-007 expects a server-issued, single-use challenge (API-021). API-021 does not exist, so the client picks the challenge and a captured pair can be replayed. No client in `apps/` calls this route.

### `GET /api/v1/users/me`

- **Auth:** User JWT
- **200:** `{ id, email, name, publicKey, createdAt, deviceName }`. `deviceName` is taken only from `device_info.model`.
- **Errors:** 404 `User not found`
- **SRS:** none (portal helper)

### `PUT /api/v1/users/me/public-key`

- **Auth:** User JWT
- **Body:** `{ public_key: PEM }`
- **200:** `data: null`
- **Errors:**
  - 400: validation
  - 401: the account behind the token no longer exists
- **Note:** this overwrites any existing key without issuer re-verification. The wallet calls it on every sign-in (`apps/mobile/src/lib/device.ts` `ensureDeviceKey`), and so does the web stand-in key (`apps/web/lib/webKeypair.ts`). See DESIGNED_FEATURES (a).
- **SRS:** none

### `PUT /api/v1/users/:id/push-token`: API-022

- **Auth:** User JWT, and `:id` must equal the token's `sub` (`requireSelf`)
- **Body:** `{ push_token }`
- **200:** `data: null`
- **Errors:**
  - 400: validation
  - 403: `Access denied: you can only access your own resources`
  - 404: user not found

### `PUT /api/v1/users/:id/public-key`

- **Auth:** User JWT plus `requireSelf`
- **Body:** `{ public_key: PEM }`
- **200:** `data: null`
- **Errors:** 400, 403, 404
- **SRS:** none

### `GET /api/v1/users/:id/profile`

- **Auth:** User JWT plus `requireSelf`
- **200:** `{ id, publicKey, createdAt, updatedAt }`
- **Errors:** 403, 404
- **SRS:** none

---

## 4. Credentials and issuer proxies (backend :4000)

All routes need a **User JWT** except `/linkedin/_internal/complete`.

The NADRA, HEC, AU and LinkedIn routes are **proxies**. The backend adds `user_public_key` from the account and forwards the request to the issuer. On success it writes a `Credential` metadata row with `jti`, issuer, type, expiry and field labels, but no claim values (`services/backend/src/services/credentials.service.ts` `recordCredential`). It then returns the **issuer's body unchanged**, e.g. `{ success, data: { credential }, timestamp }`.

Because these are proxies, the attribute values the user types (CNIC, degree number, AU portal password) pass through the backend in transit. FR-006 AC2 says the backend never receives them. See DESIGNED_FEATURES (c), API-014.

Proxy errors (`CredentialsError`):

- the issuer's own status code with its `error` (`ISSUER_ERROR`);
- 502 `Issuer service is unreachable`;
- 400 `No public key on file for this account...` (`NO_PUBLIC_KEY`);
- 422 for backend-side validation.

| Method and path                             | SRS                     | Body / query                                  | Success                                                                                                                                                                            |
| ------------------------------------------- | ----------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/credentials`                   | none                    | none                                          | `CredentialListItem[]`: `{ id, issuerCredentialId, issuerDid, issuerName, credentialType, status: active\|expired\|revoked (computed), metadata, issuedAt, expiresAt, revokedAt }` |
| `POST /api/v1/credentials/nadra/verify`     | proxy of API-003        | `{ cnic, phone }`                             | issuer body `{ session_id, status: "otp_sent" }`. Needs no device key.                                                                                                             |
| `POST /api/v1/credentials/nadra/verify-otp` | proxy of API-004        | `{ session_id: uuid, otp: 6 chars }`          | issuer body `{ credential }`, and the row is recorded                                                                                                                              |
| `POST /api/v1/credentials/hec/verify`       | proxy of API-005        | `{ degree_number, university, student_name }` | issuer body `{ credential }`                                                                                                                                                       |
| `POST /api/v1/credentials/au/scrape`        | proxy of API-006        | `{ username, password, otp?: 6 chars }`       | issuer body `{ credential }`. Note: the AU rate limit (5/min per IP) now sees the backend's IP, so all users share one budget.                                                     |
| `GET /api/v1/credentials/linkedin/auth-url` | proxy of API-007        | none                                          | issuer body `{ auth_url }`, with `user_public_key` appended to the URL. The OAuth `state` is tracked in memory.                                                                    |
| `GET /api/v1/credentials/linkedin/status`   | none                    | none                                          | `{ status: pending\|completed\|failed, credential?, error? }`. A finished entry is removed once read.                                                                              |
| `POST /api/v1/credentials/linkedin/issue`   | proxy of API-009        | `{ code, state: uuid }`                       | issuer body `{ credential }`. The issuer returns 201 but the backend replies 200.                                                                                                  |
| `GET /api/v1/credentials/:id/revocation`    | none (closest: API-015) | `:id` = backend `Credential.id`               | `{ revoked, revokedAt, reason }`. Also checks Fabric, which fails open. 404 `Credential not found`.                                                                                |
| `POST /api/v1/credentials/:id/revoke`       | none (closest: API-016) | `{ reason }`                                  | `{ revoked: true }`. 404, 422. End User self-revocation is not in the SRS, and BR-019 reserves revocation for issuers.                                                             |

**Known bug.** The wallet calls `/credentials/:id/revocation` with `SDJWTCredential.id` (`apps/mobile/src/store/credentials.store.ts`). That is not `Credential.id`, so the call always returns 404, and the error is swallowed.

### `POST /api/v1/credentials/linkedin/_internal/complete`

- **Auth:** Internal secret (`x-internal-secret`). This is a server-to-server call from the LinkedIn issuer's `/callback`.
- **Body:** `{ success: true, state: uuid, credential }` or `{ success: false, state: uuid, error }`
- **200:** `{ acknowledged: true }`
- **Errors:**
  - 401: `Invalid internal service secret`
  - 422: validation
- **SRS:** none

---

## 5. Issuer registry

### `GET /api/v1/issuers`: API-012

- **Auth:** None
- **200:** active `IssuerRegistry` rows `{ id, issuerId, name, jwksUrl, publicKey, active, addedAt, updatedAt }`

### `GET /api/v1/issuers/:id/public-key`: API-013

- **Auth:** None
- `:id` is the `issuerId`, e.g. `nadra.gov.pk`
- **200:** `{ public_key }`. 404 `Issuer not found`.

---

## 6. QR challenges and pairing

Source: `services/backend/src/services/qr-challenge.service.ts` and `pairing.service.ts`. QR validity is 120 s (`QR_VALIDITY_MS`). Only SHA-256 hashes of the code and the token are stored.

### `POST /api/v1/qr-challenges`: API-023

- **Auth:** None. Optional `x-forwarded-user-agent` gives the browser label.
- **Body:** `{ purpose: "PAIRING" | "SIGN_IN" }`
- **201:** `{ challengeId, purpose, code, pairingToken (PAIRING) | pollToken (SIGN_IN), expiresAt, qrPayload }`
  - `qrPayload` = `<PAIRING_WEB_URL>/pair#p=<id>&c=<code>[&t=SIGN_IN]`
- **Errors:** 400 `purpose must be PAIRING or SIGN_IN`

### `GET /api/v1/qr-challenges/:id`: API-024

- **Auth:** Challenge token (`x-challenge-token`, portal SIGN_IN) or Pairing token (`x-pairing-token`, extension)
- **200:** `{ challengeId, purpose, state: PENDING|REDEEMED|EXPIRED, expiresAt, redeemedAt, active, deviceName, sessionToken?, sessionExpiresAt? }`
  - `sessionToken` (a User JWT) appears only in the **first** poll after a SIGN_IN is approved, and only within 60 s of the approval (FR-036).
- **Errors:**
  - 400: bad ID or missing token
  - 404: `QR challenge not found` (a wrong token looks the same as a missing challenge)

### `POST /api/v1/qr-challenges/redeem`: API-025 (ALG-006, ALG-007)

- **Auth:** User JWT (the phone)
- **Body:** `{ challengeId: uuid, code: string, signature: string }`
  - The signature is over `nexusid-qr:<PURPOSE>:<challengeId>:<code>` with the account's registered key (`qrChallengeSigningInput`).
- **200:** challenge status object as above, `state: "REDEEMED"`
- **Errors:**
  - 400: `This QR code could not be verified`
  - 409: already used
  - 410: expired
  - 401: no device key on the account, or bad signature

### `GET /api/v1/pairings`: API-026

- **Auth:** User JWT
- **200:** `[{ pairingId, status: paired|revoked, browser, pairedAt, revokedAt }]`

### `DELETE /api/v1/pairings/self`

- **Auth:** Pairing token. The extension unpairs itself.
- **200:** `data: null`. Idempotent: an unknown or already revoked token does nothing.
- **Errors:** 400 missing header
- **SRS:** none (browser side of FR-038)

### `DELETE /api/v1/pairings/:id`: API-027

- **Auth:** User JWT
- **200:** `data: null`
- **Errors:**
  - 400: invalid ID
  - 404: `Pairing not found`

---

## 7. Verification sessions, relay and proofs

Source: `services/backend/src/services/verification.service.ts`.

- The response window is 120 s from session creation (`RESPONSE_WINDOW_MS`).
- ALG-005 sweeps every 5 s, and sessions are also expired lazily on read.
- Each `status` value maps to an `outcome`:

  | status      | outcome    |
  | ----------- | ---------- |
  | `pending`   | `PENDING`  |
  | `completed` | `VERIFIED` |
  | `failed`    | `FAILED`   |
  | `rejected`  | `DECLINED` |
  | `expired`   | `EXPIRED`  |

### `POST /api/v1/verification/sessions`: API-030 (FR-043)

- **Auth:** API key. The verifier comes from the key, never from the body.
- **Body:** `{ predicate: catalog code, callbackUrl?: url }`
- **201:** `{ sessionId, nonce, predicate, predicateLabel, requestedFields: [predicate], expiresAt }`
- **Errors:**
  - 401: missing or invalid key
  - 422: validation, or `UNKNOWN_PREDICATE`
  - 403: `PREDICATE_NOT_CONFIGURED`

### `GET /api/v1/verification/sessions/:id/outcome`: API-031 (FR-045)

- **Auth:** API key
- **200:** `OutcomeResult` = `{ status, outcome, predicate, predicateLabel, expiresAt? (pending), decidedAt?, rejected_at? (rejected), issuer?, callbackUrl? (completed/failed) }`. It holds no claim values.
- **Errors:**
  - 422: invalid ID
  - 404: `NOT_FOUND`. Another SP's session also returns 404.

### `POST /api/v1/verification/request`: API-032 (FR-032, FR-019)

- **Auth:** Pairing token (`x-pairing-token`)
- **Body:** `{ sessionId: uuid, nonce: string, pageUrl: string }`
- **200:** `{ requestId, pollSecret, verifierName, predicate, predicateLabel, requestedFields, notification_sent, expiresAt }`
  - `pollSecret` is returned once, and only its hash is stored.
  - FCM failure never fails the relay.
- **Errors:**

  | Status | Code                      | Meaning                                                 |
  | ------ | ------------------------- | ------------------------------------------------------- |
  | 409    | `NOT_PAIRED`              | missing, unknown or revoked token; note this is not 401 |
  | 404    | `INVALID_SESSION`         | unknown session, or wrong nonce                         |
  | 410    | `SESSION_EXPIRED`         |                                                         |
  | 409    | `SESSION_ALREADY_RELAYED` |                                                         |
  | 422    |                           | validation                                              |

### `GET /api/v1/verification/request/:id`: API-033 (FR-034)

- **Auth:** Poll secret (`x-poll-secret`)
- **200:** `OutcomeResult` (as API-031)
- **Errors:**
  - 401: missing header
  - 404: wrong secret or unknown ID
  - 422: invalid ID

### `GET /api/v1/verification/pending`: API-034

- **Auth:** User JWT
- **200:** `[{ requestId, verifierId, verifierName, verifierDomain, predicate, predicateLabel, requestedFields, nonce, pageUrl, createdAt, expiresAt }]`. Only routed, pending and unexpired requests are listed, newest first.

### `POST /api/v1/verification/submit-proof`: API-035 (FR-044, ALG-002, ALG-003)

- **Auth:** User JWT
- **Body:**
  ```jsonc
  {
    "verification_requestId": "<uuid>",
    "proof": {
      "presentation": { "sd_jwt": "...", "disclosures": ["..."] },
      "key_binding": "<KB-JWT>",
      "timestamp": "...",
      "verifier_id": "...",
    },
  }
  ```
- **200:** `{ status: "verified", outcome: "VERIFIED", predicate, issuer, verifiedAt }`
- **Errors before any check** (the session stays open):
  - 404 `NOT_FOUND`
  - 422 validation
  - 400 `SESSION_CLOSED`
  - 400 `REQUEST_EXPIRED`
- **The nonce is consumed on receipt.** A second proof gets 400 `NONCE_REPLAYED`.
- **ALG-002 failures:** 400. The session is closed as FAILED, with `details.outcome = "FAILED"` and `details.reason = <code>`. The codes are:
  - `INVALID_JWT`
  - `UNTRUSTED_ISSUER`
  - `WRONG_ISSUER`
  - `CREDENTIAL_REVOKED`
  - `MISSING_PUBLIC_KEY`
  - `CREDENTIAL_EXPIRED`
  - `PROOF_TOO_OLD` (KB-JWT older than 60 s)
  - `NONCE_MISMATCH`
  - `PREDICATE_MISMATCH`
  - `HOLDER_BINDING_FAILED`
  - `INVALID_SIGNATURE`
  - `PROOF_INVALID`
  - `CONDITION_NOT_MET`

### `POST /api/v1/verification/reject/:id`: API-036 (FR-023)

- **Auth:** User JWT
- **Body:** none
- **200:** `{ status: "rejected", outcome: "DECLINED" }`. This also uses up the nonce.
- **Errors:** 404 `NOT_FOUND`, 400 `SESSION_CLOSED` / `REQUEST_EXPIRED`, 422 invalid ID

### `POST /api/v1/verification/fail/:id`: API-037 (FR-025)

- **Auth:** User JWT
- **Body:** none
- **200:** `{ status: "failed", outcome: "FAILED" }`. No proof hash or issuer is stored.
- **Errors:** as API-036

---

## 8. History

### `GET /api/v1/verification/history`: API-038 (FR-028, FR-029)

- **Auth:** User JWT
- **Query:** `page` (default 1), `limit` (default 20, max 100)
- **200:** `{ success, data: HistoryRecord[], page, limit, total, timestamp }`
  - `HistoryRecord` = `{ requestId, verifierId, verifierName, predicate, predicateLabel, requestedFields, decidedAt, outcome, issuer, status, created_at }`
  - Non-pending entries only, newest first. Entries the user deleted are hidden.
- **Errors:** 422 bad query

### `DELETE /api/v1/verification/history/:id`: API-039 (FR-030)

- **Auth:** User JWT
- **200:** `{ deleted: 1 }`. This is a soft delete (`userDeletedAt`); the SP log and the audit log keep the entry (BR-023).
- **Errors:** 404 `NOT_FOUND`, 422

### `DELETE /api/v1/verification/history`: API-040 (FR-030)

- **Auth:** User JWT
- **200:** `{ deleted: <n> }` (soft delete)

---

## 9. Service Provider (verifiers and analytics)

Source: `services/backend/src/services/verifier-account.service.ts`.

- API keys look like `nxk_<base64url>`.
- Only the SHA-256 of a key is stored.
- Rotation replaces the hash in one write, so the old key stops working at once (BR-009).

| Method and path                             | SRS                                                       | Auth              | Body / query                                                                        | Success                                                                                                                                            | Errors                                    |
| ------------------------------------------- | --------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `POST /api/v1/verifiers/register`           | **API-042 path mismatch** (SRS: `POST /api/v1/verifiers`) | None              | `{ email, password (min 8), displayName (1-120), domain (e.g. example.com) }`       | 201 `{ token, expiresAt, verifier: VerifierProfile, apiKey }`. The key is shown once.                                                              | 400 validation; 409 email or domain taken |
| `POST /api/v1/verifiers/login`              | none (SRS routes SP login through API-018)                | None              | `{ email, password }`                                                               | `{ token, expiresAt, verifier }`                                                                                                                   | 400; 401 `Invalid email or password`      |
| `GET /api/v1/verifiers/me`                  | none                                                      | SP JWT            | none                                                                                | `VerifierProfile` = `{ id, displayName, domain, email, apiKeyPrefix, apiKeyRotatedAt, createdAt }`                                                 | 404                                       |
| `GET /api/v1/verifiers/api-key`             | API-043                                                   | SP JWT            | none                                                                                | `{ apiKeyPrefix, apiKeyRotatedAt, createdAt }`. The key itself is never returned.                                                                  | 404                                       |
| `POST /api/v1/verifiers/api-key/regenerate` | API-044 (ALG-009)                                         | SP JWT            | none                                                                                | `{ apiKey, apiKeyPrefix, apiKeyRotatedAt }`                                                                                                        | 404                                       |
| `POST /api/v1/verifiers/me/api-key`         | legacy alias of API-044                                   | SP JWT            | none                                                                                | same as API-044                                                                                                                                    | 404                                       |
| `GET /api/v1/verifiers/me/requests`         | none                                                      | SP JWT            | `from`, `to`: ISO datetimes with offset; default is the last 30 days; max 1000 rows | `[{ id, predicate, predicateLabel, requestedFields, status, outcome, responseTimeSec, createdAt }]`                                                | 400                                       |
| `GET /api/v1/verifiers/requirements`        | API-045                                                   | SP JWT            | none                                                                                | `{ predicates: string[], catalog: [{ code, category, label, issuer }] }`                                                                           | 404                                       |
| `PUT /api/v1/verifiers/requirements`        | API-046                                                   | SP JWT            | `{ predicates: string[] (max 20) }`                                                 | same shape as API-045                                                                                                                              | 400 `Not in the predicate catalog: ...`   |
| `GET /api/v1/analytics/verifications`       | API-047                                                   | API key or SP JWT | `tzOffset` (-840 to 840 min, default 0)                                             | `{ total, verified, failed, declined, expired, pending, successRate (0-100 or null), daily: [7 x { date, verified, failed, declined, expired }] }` | 400; 401                                  |
| `GET /api/v1/analytics/recent`              | API-048                                                   | API key or SP JWT | `limit` (1-100, default 20)                                                         | `[{ id, sessionId, createdAt, predicate, predicateLabel, outcome, issuer, proofHash, decidedAt }]`. Nothing identifies the End User.               | 400; 401                                  |

---

## 10. Admin (operator only)

None of these routes are in the SRS. All need **Admin** auth. Source: `services/backend/src/routes/admin.route.ts`.

| Method and path                     | Body / query                            | Success                                | Notes                                                                                                                                                                   |
| ----------------------------------- | --------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/admin/fraud-flags`     | none                                    | pending `FraudFlag` rows, newest first | Nothing creates flags yet (DESIGNED_FEATURES (d)).                                                                                                                      |
| `PUT /api/v1/admin/fraud-flags/:id` | `{ status: "reviewed" \| "dismissed" }` | the updated `FraudFlag`                | `status` is cast, not validated. 404 via Prisma P2025.                                                                                                                  |
| `GET /api/v1/admin/audit-logs`      | `limit` (default 50, no upper cap)      | `AuditLog[]`                           | `AuditLog.id` is a Postgres `BigInt` and no BigInt JSON serializer exists in `services/backend/src`, so `res.json` should throw a 500 once rows exist. Not tested here. |

---

## 11. Issuer services (simulated)

Each issuer is its own Express app. The responses use the same `{ success, data | error, timestamp }` envelope, **except** `/health` and the JWKS responses. **No issuer implements `/reverify` (API-011).**

### NADRA: `:4001`

Source: `services/issuers/nadra/src/index.ts`, `routes.ts`.

| Method and path                                                                          | SRS     | Body                                                        | Success                                                                                                                      | Errors                                                      |
| ---------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `GET /health`                                                                            | API-002 | none                                                        | `{ status, service: "nadra-issuer", sandbox, timestamp }`                                                                    | none                                                        |
| `GET /.well-known/jwks.json`, also `GET /api/v1/credentials/nadra/.well-known/jwks.json` | API-010 | none                                                        | `{ keys: [{ kty, n, e, use: "sig", alg: "RS256", kid: "nadra-key-v1" }] }`                                                   | 503 key not configured; 500 malformed                       |
| `POST /api/v1/credentials/nadra/verify`                                                  | API-003 | `{ cnic: "12345-1234567-1", phone: 10-15 chars }`           | `{ session_id, status: "otp_sent" }`. The session is in memory for 5 min. In sandbox mode the OTP is printed to the console. | 400 validation; 422 Verisys error (with `code`); 500        |
| `POST /api/v1/credentials/nadra/verify-otp`                                              | API-004 | `{ session_id: uuid, otp: 6 digits, user_public_key: PEM }` | `{ credential: SDJWTCredential }`. The OTP is single use.                                                                    | 400; 404 session not found; 410 expired; 401 wrong OTP; 500 |

### HEC: `:4002`

The router is mounted at both `/` and `/api/v1/credentials/hec`, so every route below works on both paths. Source: `services/issuers/hec/src/index.ts`, `routes.ts`.

| Method and path                                            | SRS     | Body                                                                | Success                                              | Errors                                               |
| ---------------------------------------------------------- | ------- | ------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `GET /health`                                              | API-002 | none                                                                | `{ status, service: "hec-issuer", timestamp }`       | none                                                 |
| `POST /api/v1/credentials/hec/verify`, also `POST /verify` | API-005 | `{ degree_number, university, student_name, user_public_key: PEM }` | `{ credential }`. Credentials are valid for 5 years. | 400; 404 degree not found; 502 HEC client error; 500 |
| `GET /.well-known/jwks.json` (both paths)                  | API-010 | none                                                                | JWKS, `kid: "hec-issuer-key-v1"`                     | 503 key not generated                                |

### Air University: `:4003`

Source: `services/issuers/air-university/src/index.ts`, `routes.ts`.

| Method and path                                                  | SRS     | Body                                                          | Success                                                               | Errors                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | ------- | ------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`                                                    | API-002 | none                                                          | `{ status, service: "au-issuer", timestamp }`                         | none                                                                                                                                                                                                                                                                                 |
| `POST /api/v1/credentials/au/scrape`                             | API-006 | `{ username, password, otp?: 6 chars, user_public_key: PEM }` | `{ credential }`. The username and password are not logged or stored. | 429 after 5 req/min per IP (`express-rate-limit`, applied to the whole `/api/v1/credentials/au` prefix); 400 validation or scraper failure with `error_code` = `LOGIN_FAILED` \| `OTP_REQUIRED` \| `OTP_FAILED` \| `DATA_EXTRACTION_FAILED` \| `NAVIGATION_FAILED` \| `TIMEOUT`; 500 |
| `GET /.well-known/jwks.json`, also under the rate-limited prefix | API-010 | none                                                          | JWKS, `kid: "au-issuer-key-v1"`                                       | 503 key not provisioned                                                                                                                                                                                                                                                              |

### LinkedIn: `:4004`

The router is mounted at both `/api/v1/credentials/linkedin` and `/`. In sandbox mode the OAuth flow goes to a mock consent page, not to linkedin.com. Source: `services/issuers/linkedin/src/index.ts`, `routes.ts`.

| Method and path                                 | SRS                 | Input                                               | Success                                                                                                                                                                     | Errors                                     |
| ----------------------------------------------- | ------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `GET /health`                                   | API-002             | none                                                | `{ status, service: "linkedin-issuer", timestamp }`                                                                                                                         | none                                       |
| `GET /api/v1/credentials/linkedin/auth-url`     | API-007             | none                                                | `{ auth_url }`                                                                                                                                                              | 500                                        |
| `GET /api/v1/credentials/linkedin/mock-consent` | none (sandbox only) | query `state`, `redirect_uri`, `user_public_key?`   | an HTML page with Authorize and Deny buttons                                                                                                                                | 404 when `LINKEDIN_USE_SANDBOX=false`; 400 |
| `GET /api/v1/credentials/linkedin/callback`     | API-008             | query `code`, `state`, `error?`, `user_public_key?` | an HTML page that tries a `nexusid://credential-added?...` deep link and closes itself. It also posts the result to the backend `/credentials/linkedin/_internal/complete`. | errors are shown on the page               |
| `POST /api/v1/credentials/linkedin/issue`       | API-009             | `{ code, state: uuid, user_public_key }`            | **201** `{ credential }`                                                                                                                                                    | 400 OAuth or validation error; 500         |
| `GET /.well-known/jwks.json` (both paths)       | API-010             | none                                                | JWKS, `kid: "linkedin-issuer-key-v1"`                                                                                                                                       | 503 (enveloped)                            |

---

## 12. ML fraud service: `:5001` (built, not called)

Source: `services/ml/app.py`. Not in the SRS. The backend client `services/backend/src/services/fraud-detection.service.ts` is imported nowhere.

| Method and path            | Body                                                                                                                                           | Success                                                                                                                | Errors                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `POST /predict-fraud-risk` | `{ verification_event: { user_id, credential_id, verifier_id, timestamp, requested_fields: [], device_fingerprint?, credential_issued_at? } }` | `{ success: true, risk_score (0-100), risk_level: LOW\|MEDIUM\|HIGH, is_anomaly, features, latency_ms, processed_at }` | 400 `{ success: false, errors: [] }`; 503 model not trained; 500 |
| `GET /health`              | none                                                                                                                                           | `{ status, model_loaded, model_path, timestamp }`                                                                      | none                                                             |
| `GET /model/features`      | none                                                                                                                                           | `{ feature_columns }`                                                                                                  | none                                                             |

---

## 13. Web portal server routes (Next.js :3000)

### `POST /api/auth?action=<action>`

Source: `apps/web/app/api/auth/route.ts`. Errors are `{ success: false, error }` with no timestamp:

- 400: unknown action or bad body
- 503: backend unreachable (`qr-start` only)
- 500: anything else
- otherwise the backend's status code is passed through

| Action              | SRS                  | What it does                                                                                                                                                                               |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `login`             | API-049              | Forwards to `POST /api/v1/auth/login` and sets the End User session cookie. Returns `{ success: true }`.                                                                                   |
| `register`          | API-050              | Forwards to `POST /api/v1/auth/register` and sets the cookie if a token comes back. Returns `{ success, autoLogin }`.                                                                      |
| `logout`            | API-051              | Clears the End User cookie.                                                                                                                                                                |
| `verifier-login`    | none                 | Forwards to `POST /api/v1/verifiers/login` and sets the separate SP cookie.                                                                                                                |
| `verifier-register` | none                 | Forwards to `POST /api/v1/verifiers/register`, sets the SP cookie, and returns `{ success, apiKey }` (shown once).                                                                         |
| `verifier-logout`   | none                 | Clears the SP cookie.                                                                                                                                                                      |
| `qr-start`          | none (wraps API-023) | Creates a SIGN_IN challenge. Keeps `challengeId.pollToken` in the httpOnly cookie `nexusid_qr_signin` (180 s) and returns `{ challengeId, qrPayload, expiresAt }`.                         |
| `qr-status`         | none (wraps API-024) | Body `{ challengeId }`. Polls with `x-challenge-token`. On approval it swaps the `sessionToken` into the End User cookie. Returns `{ state, signedIn }`. 409 if the cookie does not match. |

### Pass-through proxies

These files forward any method to the matching backend prefix, adding the session cookie as `Authorization: Bearer` (`apps/web/lib/backendProxy.ts`). They return 401 `Not authenticated` when there is no cookie.

- `apps/web/app/api/v1/{credentials,users,qr-challenges,pairings,analytics,verifiers,verification}/[[...path]]/route.ts`

---

## 14. SRS API IDs with no implementation

| SRS ID  | SRS route                                                   | Status in code                                                                                                                                 |
| ------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| API-011 | `POST /api/v1/credentials/{nadra,hec,au,linkedin}/reverify` | Not on any issuer. Designed in DESIGNED_FEATURES (a).                                                                                          |
| API-014 | `POST /api/v1/credential-records`                           | Not built. Metadata is recorded as a side effect of the issuer proxies instead (`credentials.service.ts` `recordCredential`). Designed in (c). |
| API-015 | `POST /api/v1/credential-records/revocation-status`         | Not built. The nearest is `GET /api/v1/credentials/:id/revocation` (one ID at a time, by backend row ID). Designed in (b).                     |
| API-016 | `POST /api/v1/credential-records/:id/invalidate`            | Not built. The nearest is the End User `POST /api/v1/credentials/:id/revoke`. Designed in (c).                                                 |
| API-021 | `POST /api/v1/users/challenge`                              | Not built. `POST /users/login` accepts a client-chosen challenge.                                                                              |
| API-028 | `POST /api/v1/recovery/confirm`                             | Not built. Designed in (a).                                                                                                                    |
| API-029 | `POST /api/v1/recovery/devices`                             | Not built. Designed in (a).                                                                                                                    |
| API-041 | `POST /api/v1/revocations`                                  | Not built. Designed in (b).                                                                                                                    |

**Built with a different path or scope:**

- **API-042** is built as `POST /api/v1/verifiers/register`, not `POST /api/v1/verifiers`.
- **API-017** registers End Users only; SPs register through `POST /verifiers/register`.
- **API-018** has no recovery branch.
- **API-020** has no server-issued challenge.

**Built but not in the SRS:**

- `/users/me`, `/users/me/public-key`, `/users/:id/public-key`, `/users/:id/profile`
- `GET /credentials`, `/credentials/linkedin/status`, `/credentials/linkedin/_internal/complete`, `/credentials/:id/revocation`, `/credentials/:id/revoke`
- `DELETE /pairings/self`
- `/verifiers/login`, `/verifiers/me`, `/verifiers/me/api-key`, `/verifiers/me/requests`
- all of `/admin/*`
- the LinkedIn `mock-consent` page
- the ML service
