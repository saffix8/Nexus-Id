# NexusID — Core Project Context
### Paste this whole file as your first message to any AI assistant (ChatGPT, Gemini, Copilot Chat, Cursor, etc.) before asking it to work on NexusID.

> **How to use this file:** This is a portable, self-contained context document — it doesn't depend on any Claude-specific feature. Paste it in full at the start of a new chat/session on whatever AI tool you're using, then describe the specific file or task you need help with. Re-paste it (or at least the "Current Build Status" section) whenever you start a new session, because the AI has no memory between sessions unless you give it this.
>
> **Keep this file and the repo in sync.** If something below is wrong because the code has moved on since this was written, trust the repo and `NEXUSID_PROJECT.md`, and tell whoever maintains this file so it gets updated for everyone.

---

## 1. Project identity

- **Name:** NexusID
- **Type:** Final Year Project (FYP) — Computer Science / Software Engineering
- **University:** Air University, Islamabad
- **Tagline:** Privacy-preserving digital identity verification using Selective Disclosure JWT (SD-JWT)
- **Goal:** Let users prove specific identity claims (degree, age, enrollment, employment) to websites **without** sharing full documents.

**The problem it solves:** When a job portal asks "Do you have a degree?", the normal flow makes you upload your entire transcript, exposing your name, CGPA, every course, everything. NexusID lets you prove only what's asked:
- "I have a CS degree" → proves it, hides CGPA, CNIC, name
- "I'm over 18" → proves it, hides exact birth date
- "I'm enrolled at Air University" → proves it, hides everything else

**How:** SD-JWT (IETF RFC 9901) + RSA cryptography, so the proof is mathematically verifiable without revealing extra data.

---

## 2. System architecture

```
NEXUSID ECOSYSTEM
├── [1] CREDENTIAL SOURCES (real integrations)
│     ├── NADRA Verisys API      → issues national identity credential
│     ├── HEC API                → issues degree/education credential
│     ├── Air University scraper → issues enrollment credential (Puppeteer)
│     └── LinkedIn OAuth         → issues employment credential
│
├── [2] MOBILE APP (React Native — Android + iOS)
│     ├── Credential Wallet (encrypted SD-JWT storage)
│     ├── Proof Generator (selective disclosure)
│     ├── Push Notification Handler (approve/reject)
│     └── Verification History
│
├── [3] WEB APP (Next.js 14 App Router)
│     ├── User Dashboard
│     ├── Add Credentials (all 4 sources)
│     ├── QR Code Generator (offline verification)
│     ├── Verifier Portal (for companies)
│     └── Analytics Dashboard
│
├── [4] BROWSER EXTENSION (Chrome, Manifest V3)
│     ├── Detects <div id="nexusid-verify"> on any webpage
│     ├── Sends request to backend, polls for result
│     └── Shows inline verification status on the page
│
├── [5] BACKEND API (Node.js + Express + PostgreSQL)
│     ├── User & key registry
│     ├── Verification request routing
│     ├── Push delivery (FCM)
│     ├── Proof validation & storage
│     └── Fraud detection integration
│
├── [6] CREDENTIAL ISSUERS (Node.js microservices, one per source)
│
└── [7] ADVANCED FEATURES
      ├── ZK-Proofs (snarkjs/Circom) — age verification without revealing DOB
      ├── Hyperledger Fabric — audit trail (not core protocol)
      └── ML Fraud Detection (Python/scikit-learn)
```

---

## 3. Monorepo folder structure

```
nexusid/
├── apps/
│   ├── mobile/                 React Native app
│   │   └── src/{screens,components,services,store,types}/
│   ├── web/                    Next.js app
│   │   ├── app/{page.tsx, dashboard/, verifier/, api/}
│   │   ├── components/{ui/, CredentialCard.tsx, AddCredentialModal.tsx, QRGenerator.tsx}
│   │   └── lib/{crypto.ts, api.ts, auth.ts}
│   └── extension/               Chrome extension (manifest.json, content.js, background.js, popup.*)
│
├── packages/
│   ├── sd-jwt/                  Shared SD-JWT crypto library (used by every app/service)
│   │   └── src/{issuer.ts, holder.ts, verifier.ts, types.ts}
│   └── types/                   Shared TypeScript types (single source of truth)
│
├── services/
│   ├── backend/                 Main Node.js API
│   │   └── src/{routes/, controllers/, services/, db/, middleware/, lib/, index.ts}
│   ├── issuers/
│   │   ├── nadra/                NADRA Verisys wrapper → services/issuers/nadra/src/{verisys-client.ts, credential-builder.ts, routes.ts}
│   │   ├── hec/                  HEC degree wrapper
│   │   ├── air-university/       Puppeteer portal scraper
│   │   └── linkedin/             OAuth2 employment
│   └── ml/                       Python Flask fraud detection (app.py, model.py, features.py, train.py)
│
├── blockchain/                   Hyperledger Fabric chaincode + network
├── circuits/                     ZK-Proof circuits (snarkjs/Circom)
├── infra/                        Docker Compose (dev + prod), nginx.conf
└── docs/                         API.md, SETUP.md, ARCHITECTURE.md
```

---

## 4. Technology stack

### Mobile app
| Layer | Technology |
|---|---|
| Framework | React Native 0.73, TypeScript |
| Navigation | React Navigation v6 |
| State | Zustand (with `persist` middleware) |
| Crypto | `jose` + `@sphereon/sd-jwt` |
| Secure storage | `react-native-keychain` (Android Keystore / iOS Keychain) |
| Biometrics | `react-native-biometrics` |
| Local DB | `react-native-sqlite-storage` (encrypted) |
| Push | `@react-native-firebase/messaging` (FCM) |
| UI | `react-native-paper` (Material Design 3) |

### Web app
| Layer | Technology |
|---|---|
| Framework | Next.js 14, App Router, TypeScript |
| Styling | Tailwind CSS |
| State/data | Zustand + `@tanstack/react-query` |
| Forms | `react-hook-form` + Zod — **but see Section 7: `zodResolver` is broken with Zod v4, use manual `safeParse`** |
| Charts | Recharts |
| QR | `qrcode.react` + `html5-qrcode` |
| Auth | NextAuth.js (web flow only — mobile uses a separate RSA-challenge flow, see Section 7) |
| Modals | `@headlessui/react` |

### Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js 20 LTS, Express.js, TypeScript |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| Push | Firebase Admin SDK |
| Validation | Zod (every route boundary) |
| Auth | JWT via `jose` |

### Issuer services
| Service | Technology |
|---|---|
| NADRA / HEC | Node.js + axios REST wrappers |
| Air University | Puppeteer + Cheerio (portal scraper) |
| LinkedIn | Node.js + OAuth2 (passport.js) |

### Advanced features
| Feature | Technology |
|---|---|
| ZK-Proofs | snarkjs + Circom 2.0 |
| Blockchain | Hyperledger Fabric 2.5 |
| Fraud detection | Python 3.11, scikit-learn, Flask |
| Containers | Docker + Docker Compose |

---

## 5. Database schema (PostgreSQL 16)

```sql
-- Users (mobile app users)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key    TEXT NOT NULL,           -- RSA public key (PEM)
  push_token    TEXT,                    -- FCM device token
  device_info   JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Registered verifiers (job portals, universities, etc.)
CREATE TABLE verifiers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain        TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  logo_url      TEXT,
  api_key       TEXT UNIQUE NOT NULL,
  trusted       BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Verification requests (from browser extension)
CREATE TABLE verification_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id     UUID REFERENCES verifiers(id),
  requested_fields TEXT[] NOT NULL,
  nonce           TEXT NOT NULL UNIQUE,  -- replay prevention
  callback_url    TEXT,
  page_url        TEXT,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','rejected','expired')),
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  rejected_at     TIMESTAMPTZ
);

-- Verification results (proofs received from mobile)
CREATE TABLE verification_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID UNIQUE REFERENCES verification_requests(id),
  verified_fields JSONB NOT NULL,
  issuer          TEXT NOT NULL,
  proof_hash      TEXT NOT NULL,         -- SHA-256 of proof, for audit
  verified_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Issuer public key registry
CREATE TABLE issuer_registry (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id   TEXT UNIQUE NOT NULL,      -- e.g. "nadra.gov.pk"
  name        TEXT NOT NULL,
  jwks_url    TEXT NOT NULL,
  public_key  TEXT NOT NULL,
  active      BOOLEAN DEFAULT TRUE,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log (metadata only, no personal data)
CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,
  request_id  UUID,
  verifier_id UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Fraud review queue
CREATE TABLE fraud_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID REFERENCES verification_requests(id),
  risk_score      NUMERIC(5,2),
  risk_level      TEXT CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
  features        JSONB,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Used nonces (replay attack prevention)
CREATE TABLE used_nonces (
  nonce       TEXT PRIMARY KEY,
  used_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON used_nonces (used_at);

-- Indexes
CREATE INDEX ON verification_requests (status);
CREATE INDEX ON verification_requests (verifier_id);
CREATE INDEX ON audit_logs (event_type, created_at);
```

> **Prisma note:** `services/backend/prisma/schema.prisma` mirrors this exactly. Prisma model names are **singular and camelCase** (`prisma.user`, `prisma.auditLog`) even though the SQL table names above are plural/snake_case — this has caused bugs before (see Section 7).

---

## 6. API reference

**Base URL:** `http://localhost:4000/api/v1` (dev) / `https://api.nexusid.com/api/v1` (prod)

```
AUTH
POST   /auth/register              Register new user
POST   /auth/login                 Login
POST   /auth/refresh               Refresh JWT

USERS  (mobile RSA-challenge flow — see Section 7)
PUT    /users/:id/push-token
PUT    /users/:id/public-key
GET    /users/:id/profile

CREDENTIALS (proxied to issuer services)
POST   /credentials/nadra/verify
POST   /credentials/hec/verify
POST   /credentials/au/scrape
GET    /credentials/linkedin/auth-url
POST   /credentials/linkedin/callback

VERIFICATION
POST   /verification/request           Create request (called by browser extension)
GET    /verification/request/:id       Poll for result (extension polls every 5s)
POST   /verification/submit-proof      Submit proof (called by mobile app)
POST   /verification/reject/:id        Reject (mobile app)
GET    /verification/history           User's verification history

VERIFIERS
POST   /verifiers/register
GET    /verifiers/:id
GET    /verifiers/:domain

ISSUERS
GET    /issuers
GET    /issuers/:id/public-key
GET    /issuers/:id/revocation

ANALYTICS (verifier only)
GET    /analytics/verifications
GET    /analytics/recent

ADMIN
GET    /admin/fraud-flags
PUT    /admin/fraud-flags/:id
GET    /admin/audit-logs
```

### Key payload shapes

```typescript
// POST /verification/request  (browser extension → backend)
Request:  { verifier_id, requested_fields: string[], nonce, callback_url?, page_url }
Response: { request_id, status: "queued", notification_sent: boolean, expires_at }

// POST /verification/submit-proof  (mobile → backend)
Request: {
  verification_request_id: string,
  proof: {
    presentation: { sd_jwt: string, disclosures: string[] },
    key_binding: string,     // signed by user's private key
    timestamp: string
  }
}
Response: { status: "verified", verified_fields: {...}, issuer: string, verified_at: string }

// GET /verification/request/:id  (extension polls every 5s)
pending:   { status: "pending", expires_at }
completed: { status: "completed", verified_fields: {...}, callback_url? }
rejected:  { status: "rejected", rejected_at }
```

---

## 7. Hard-won knowledge and conventions — apply these everywhere

These are not optional style preferences; several come from real bugs already fixed once. Re-breaking them wastes everyone's time.

**Code conventions**
- Strict TypeScript throughout — **no `any`**, typed error hierarchies, full exports.
- **Zod validates every route input.** No exceptions.
- **Route handlers are thin.** All business logic lives in service classes; a route only parses input and calls a service method.
- **Singleton service pattern** across backend and mobile services.
- Lazy `await import(...)` inside Zustand store actions, to dodge circular-dependency issues at module init.
- `create_app()` factory pattern in `services/backend/src/index.ts`, so integration tests can get an Express instance without binding a real port.

**Known gotchas (already debugged once — don't reintroduce)**
- **Prisma model names are singular/camelCase**: `prisma.user`, `prisma.auditLog` — not `prisma.users` / `prisma.audit_logs`.
- **Zod v4 breaking changes**: use `.issues`, not `.errors`; `z.record()` takes **two** type arguments now.
- **`@hookform/resolvers` is incompatible with Zod v4.** Every form uses manual `safeParse()` + `setError()` instead of `zodResolver`. Do not reintroduce `zodResolver`.
- **SD-JWT `sd_hash` must include a trailing `~`** per RFC 9901 §6.2 — `holder.ts` (generates) and `verifier.ts` (checks) must agree on this exact format, or every proof fails verification.
- **Auth is split into two separate flows — do not merge them:**
  - Mobile: RSA-challenge flow under `/api/v1/users/*` (`auth.controller.ts`)
  - Web: email/password flow under `/api/v1/auth/*` (`web-auth.controller.ts`)
- **The private key never leaves Android Keystore.** Mobile signing must go through `CryptoService`, never pass a raw PEM private key around.
- **`react-native-biometrics` only returns the public key at key-creation time** — cache it immediately via `StorageService`, or it's unrecoverable later.
- **Blockchain writes are fail-silent; revocation checks are fail-open.** A Hyperledger Fabric outage must never block a credential operation — this is intentional, not a bug to "fix."
- **ZKP generation at issuance is non-fatal.** If ZK-proof generation fails, the SD-JWT credential is still issued.
- **`packages/sd-jwt` needs a subpath `exports` map** in its `package.json` for `await import('@nexusid/sd-jwt/issuer')` (etc.) to resolve from the issuer services. **Verify this is actually in place in the repo before assuming it works** — it was a known open bug as of the last recorded session. If you hit `Cannot find module '@nexusid/sd-jwt/issuer'`, this is why.

**Architectural decisions (don't relitigate these without discussing as a team)**
1. **SD-JWT over ZKP for the main flow** — SD-JWT proof generation is <500ms vs. 2–5s for ZKP on mobile. ZKP is used *only* for age-threshold proofs where even DOB must stay hidden.
2. **Centralized relay backend, not blockchain, for routing** — blockchain confirmation (12–300s) is too slow for a live verification flow. The backend relays encrypted proofs; it routes but cannot read contents.
3. **React Native over Flutter** — JS ecosystem consistency with the backend/web stack.
4. **Monorepo with npm workspaces** — `packages/sd-jwt` and `packages/types` are shared across every app/service.
5. **Each issuer is its own microservice** — different auth flows, rate limits, and failure modes per issuer; one failing issuer must not take down the others.
6. **PostgreSQL over MongoDB** — verification requests are inherently relational (request → result → audit log), and ACID matters for an audit trail.
7. **Air University integration is a consented scraper, not an official API** — no official API exists; the user's portal credentials are used once to scrape and are *never stored*.

---

## 8. Environment variables (names only — real values are private, never commit them)

```bash
# services/backend/.env
DATABASE_URL=postgresql://nexusid:password@localhost:5432/nexusid_db
JWT_SECRET=
JWT_EXPIRES_IN=7d
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
NADRA_CLIENT_ID=
NADRA_CLIENT_SECRET=
NADRA_FRANCHISE_CODE=
NADRA_USE_SANDBOX=true
HEC_API_KEY=
HEC_BASE_URL=https://api.hec.gov.pk/degree-verification/v2
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=http://localhost:4000/api/v1/credentials/linkedin/callback
ML_SERVICE_URL=http://localhost:5001
FABRIC_CHANNEL=nexusid-channel
FABRIC_CHAINCODE=credential-audit
PORT=4000
NODE_ENV=development

# apps/web/.env.local
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_APP_NAME=NexusID

# apps/mobile/.env
API_URL=http://10.0.2.2:4000/api/v1    # Android emulator → host localhost
FIREBASE_WEB_API_KEY=
```

---

## 9. Current build status

> ⚠️ **This section reflects the state as of the last recorded working session. Code moves fast — confirm against the actual repo and `NEXUSID_PROJECT.md`'s Progress Tracker before assuming anything below is still accurate. If you fix or change something, update this file for the rest of the team.**

### Completed and considered working
- `@nexusid/sd-jwt`: `issuer.ts`, `holder.ts`, `verifier.ts` — implemented, smoke-tested
- `@nexusid/types`: complete shared type definitions
- Backend core: entry point, auth middleware, error middleware, Prisma singleton, response helpers, verification service/routes, notification service (FCM), users routes
- Both auth flows (mobile RSA-challenge, web email/password) working end-to-end
- All four issuer microservices (NADRA, HEC, Air University, LinkedIn): JWKS discovery, key generation, credential building
- Web app: landing page, auth pages, user dashboard (layout/overview/credentials/history), verifier portal (dashboard/create/analytics), `AddCredentialModal`, `QRGenerator`, middleware
- Mobile app: storage service (SQLite + keychain), crypto service, keystore service, API service, FCM notification service, Zustand stores, screens (CredentialList, AddCredential, VerificationApproval, History)
- Chrome extension: manifest, config, content script, background service worker, popup
- ML service: feature extraction, IsolationForest + RandomForest two-stage model, Flask API, training script — live-tested end to end
- Blockchain: Fabric chaincode, `BlockchainService` wrapper, Docker Compose network, setup scripts
- ZKP: Circom age-verification circuit, Groth16 compile script, `ZKPService` + `MobileZKPService`
- Infra: full Docker Compose (dev + prod), nginx config, Dockerfiles for all services, seed script, issuer key generation script, demo shell script
- Tests: integration suite (`verification-flow.test.ts`) was passing 26/26 at last check

### Open bug — needs verification before you build on top of it
- `packages/sd-jwt/package.json` was missing a subpath `exports` map, causing `await import('@nexusid/sd-jwt/issuer')` (and the `/holder`, `/verifier` equivalents) to fail in all four issuer services. A fix was in progress but **its application was never confirmed** — check `packages/sd-jwt/package.json` yourself before assuming this works.

### Recently resolved (context for why the code looks the way it does)
- All `prisma.users.*` → `prisma.user.*` and `prisma.audit_logs.*` → `prisma.auditLog.*` corrected
- Zod v4 breaking changes fixed across the codebase
- `@hookform/resolvers` + Zod v4 incompatibility resolved by switching to manual `safeParse` + `setError`
- A stale Docker container squatting port 4000 was identified and stopped
- `verification.service.ts` was once corrupted by bracketed-paste-mode escape sequences from a terminal paste, and was repaired — **when pasting code into a file, use an editor, not a raw terminal `cat > file`**

### Not yet built / missing
- `/dashboard/settings` page (web)
- `apps/mobile/package.json` may not have every real React Native dependency finalized — verify before a fresh `npm install` on mobile
- Blockchain chaincode `package.json` location needs confirming
- ML service Python dependencies installation/verification

---

## 10. What NexusID explicitly is NOT (keep the team aligned)

- **Not** blockchain-first — blockchain is audit-trail only, never the core verification path
- **Not** replacing NADRA/HEC — the system *uses* their APIs, doesn't compete with them
- **Not** storing user personal data server-side — credentials live on-device; the backend only relays and routes
- **Not** a password manager
- **Not** requiring the end user to understand cryptography — UX must stay simple
- **Not** using smart contracts for verification routing — too slow for a live flow

---

*This is the Core context file. See `NEXUSID_CONTEXT_EXTENDED.md` for the full design system, build-order roadmap, debugging protocol, and team conventions.*
