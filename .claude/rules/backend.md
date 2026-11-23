---
paths:
  - "services/backend/**/*.ts"
---

# Backend Rules (services/backend — Express :4000)

## Stack
- Express + TypeScript
- Prisma ORM → PostgreSQL 16 (Docker `nexusid-postgres`)
- Schema: `services/backend/prisma/schema.prisma` — ALWAYS pass `--schema` flag

## Response Conventions (SRS §5.3)
```ts
// Success
{ success: true, data: <payload>, timestamp: <ISO> }

// Error
{ success: false, error: <message>, timestamp: <ISO> }

// Validation error → 400 (account/user/issuer routes) or 422 (all others)
// No route match → 404 "Route not found"
// Unexpected error → 500
```

## Authentication Types by Route Group

| Auth Type | Used By |
|-----------|---------|
| None | Health checks, issuer JWKS |
| Device JWT | Mobile app routes (IF-002, IF-003, IF-006, IF-007) |
| Portal JWT | Web portal routes (IF-003, IF-007) |
| API key | Service Provider routes (IF-004, IF-009) |
| Pairing token | Extension relay routes (IF-005) |
| Poll secret | Extension poll routes (IF-005) |
| Issuer signature | Revocation routes (IF-008) |

## Critical Route Groups

### IF-003: Account, Device & Pairing
- `POST /api/v1/auth/register` (API-017) — creates account, returns token
- `POST /api/v1/auth/login` (API-018) — returns token or starts recovery
- `POST /api/v1/users/register` (API-019) — registers device public key (FR-002)
- `POST /api/v1/users/login` (API-020) — device challenge-response login (ALG-007)
- `POST /api/v1/users/challenge` (API-021) — single-use 60s challenge
- `POST /api/v1/qr-challenges` (API-023) — creates QR (FR-031, FR-036)
- `POST /api/v1/qr-challenges/redeem` (API-025) — completes pairing/sign-in (ALG-006, ALG-007)

### IF-004: Session & Outcome (Service Provider)
- `POST /api/v1/verification/sessions` (API-030) — SP creates session, backend generates nonce (FR-043)
- `GET /api/v1/verification/sessions/:id/outcome` (API-031) — SP reads result (FR-045)

### IF-005: Relay & Poll (Extension)
- `POST /api/v1/verification/request` (API-032) — extension relays detected request (FR-032, FR-019)
- `GET /api/v1/verification/request/:id` (API-033) — extension polls outcome (FR-034, FR-045)

### IF-006: Response & Proof (Mobile)
- `GET /api/v1/verification/pending` (API-034) — mobile fetches pending requests (FR-020)
- `POST /api/v1/verification/submit-proof` (API-035) — mobile submits SD-JWT proof (ALG-002, FR-044)
- `POST /api/v1/verification/reject/:id` (API-036) — mobile declines (FR-023)
- `POST /api/v1/verification/fail/:id` (API-037) — no valid credential (FR-025)

### IF-009: Service Provider Portal
- `POST /api/v1/verifiers` (API-042) — SP registration
- `POST /api/v1/verifiers/api-key/regenerate` (API-044) — rotate key (ALG-009)
- `GET /api/v1/verifiers/requirements` (API-045) — read configured predicates
- `PUT /api/v1/verifiers/requirements` (API-046) — configure predicates (FR-041)

## Security Rules
- API keys stored HASHED (Argon2 or bcrypt) — API-043 shows key data only once at creation
- Nonce is single-use — consumed via ALG-003 on first use (BR-005)
- Device key revocation registry checked on EVERY proof (BR-006, BR-007)
- Session expires after 120s PENDING (ALG-005 cron)
- Backend NEVER stores claim values — only outcome, condition name, proof hash, issuer (BR-015)

## Prisma Notes
- Always pass `--schema=services/backend/prisma/schema.prisma`
- Use `$transaction` for multi-table writes (device registration, nonce consume, session close)
- Deliberate schema denormalizations: `credential_records.category` repeats issuer category; `history_entries.platform_name` repeats SP name; `device_info` and `audit_logs.metadata` are JSONB
