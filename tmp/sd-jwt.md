---
paths:
  - "packages/sd-jwt/**/*.ts"
  - "services/issuers/**/*.ts"
---

# SD-JWT Rules

## Specification
- **RFC:** SD-JWT RFC 9901 (CON-006)
- **Hash:** SHA-256 for selective disclosure digests (CON-007)
- **Signing:** RSA-2048 minimum (CON-008)
- **Package exports:** `@nexusid/sd-jwt/issuer`, `/holder`, `/verifier`

## Critical Rules
- Proof generation (ALG-001) MUST run on the holder's device — raw attribute values NEVER leave the device
- Backend verifier (ALG-002) stores ONLY: outcome, condition name, proof hash, issuer — NEVER claim values (BR-015)
- Every proof MUST include: credential ID, session ID, nonce, timestamp (BR-005)
- Nonce is single-use — ALG-003 marks it used immediately on receipt
- Proof age MUST be ≤ 60 seconds at verification time

## ALG-001: GenerateProof (mobile, packages/sd-jwt/holder)
Input: credential, session nonce, requested predicate code
Steps:
1. Check credential not revoked (ALG-004 result) and not expired
2. Check credential carries the requested predicate
3. Build SD-JWT: disclose only the requested predicate claim
4. Sign Key Binding JWT with device key via Android Keystore
5. Return: `<Issuer-Signed-JWT>~<Disclosure>~<KB-JWT>`

## ALG-002: VerifyProof (backend, services/backend)
Input: proof string, session, nonce
Steps:
1. Verify issuer signature on credential (issuer in registry)
2. Verify Key Binding JWT (device key not revoked)
3. Verify session ID and nonce match — call ALG-003
4. Verify proof age ≤ 60 s
5. Verify credential not expired, not revoked
6. Verify disclosed predicate matches session requirement
7. Store outcome only (VERIFIED/FAILED) — no claim values

## Issuer Implementation (services/issuers/*)
Each issuer MUST:
- Expose `GET /.well-known/jwks.json` with RSA public key
- Sign credential with issuer private key (RSA-2048, RS256)
- Include in credential: predicate claims, credential ID, issuer ID, expiry
- Expose `POST /reverify` for account recovery (FR-037)
- Register in backend issuer public key registry (FR-004)

| Issuer | Port | Category | Predicates Issued |
|--------|------|----------|-------------------|
| nadra | 4001 | National Identity | AGE_OVER_18, AGE_OVER_21, NATIONALITY_PAKISTANI |
| hec | 4002 | Education | DEGREE_BACHELOR_OR_HIGHER, CGPA_AT_LEAST_* |
| air-university | 4003 | Enrollment | ENROLLED_CURRENT |
| linkedin | 4004 | Employment | EMPLOYMENT_ACTIVE |

## Credential Validation Rules (ALG-002 / FR-025)
An invalidated or revoked credential MUST NOT produce a valid proof (BR-006).
Check order: issuer-valid → not revoked → not expired → predicate-match → nonce-fresh → proof-age-ok
