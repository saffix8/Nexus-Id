# NexusID — Claude Code Project Context

> Privacy-preserving SD-JWT digital identity platform. FYP — Air University Islamabad.
> Student: Muhammad Safi Ur Rehman (231987)

---

## Quick Reference

| What | Value |
|------|-------|
| Backend | `http://localhost:4000` |
| Web portal | `http://localhost:3000` |
| Postgres | Docker container `nexusid-postgres`, port 5432 |
| DB name | `nexusid` |

---

## Monorepo Structure

```
nexusid/                          ← npm workspace root
├── apps/
│   ├── web/                      ← Next.js 14 App Router (:3000)
│   ├── mobile/                   ← React Native Android wallet
│   └── extension/                ← Chrome MV3 extension
├── packages/
│   ├── sd-jwt/                   ← @nexusid/sd-jwt (issuer/holder/verifier exports)
│   └── types/                    ← @nexusid/types (shared TypeScript types)
├── services/
│   ├── backend/                  ← Express API (:4000)
│   │   └── prisma/
│   │       └── schema.prisma     ← ALWAYS pass --schema=services/backend/prisma/schema.prisma
│   ├── issuers/
│   │   ├── nadra/                ← NADRA Verisys issuer (:4001)
│   │   ├── hec/                  ← HEC degree issuer (:4002)
│   │   ├── air-university/       ← Air University enrollment issuer (:4003)
│   │   └── linkedin/             ← LinkedIn employment issuer OAuth (:4004)
│   └── ml/                       ← Python/Flask ML service (:5001)
├── infra/
│   └── docker-compose.yml        ← All services + postgres + nginx
├── docs/
│   ├── SRS.md                    ← Full SRS Version 2.0 (source of truth)
│   ├── REQUIREMENTS.md           ← Condensed FR/API/algorithm reference ← IMPORT THIS
│   ├── DESIGN.md                 ← Design System v2 (tokens, components, screens) ← read before any UI work
│   ├── DEMO_BUILD.md             ← Demo plan + ordered build phases with prompts
│   └── STATUS.md                 ← Current state (written by Phase 0 audit)
└── CLAUDE.md                     ← This file
```

---

## Context Files — Always Read

```
@docs/REQUIREMENTS.md
```

The REQUIREMENTS.md file contains:
- All 45 FRs (FR-001–FR-045) with acceptance criteria
- All 51 API routes (API-001–API-051) with methods and paths
- 9 algorithms (ALG-001–ALG-009)
- 9 predicate claim codes (AGE_OVER_18 … EMPLOYMENT_ACTIVE)
- Business rules (BR-001–BR-024)
- Timing constants (QR TTL, challenge TTL, proof age limit)

For deep detail on any requirement, refer to `docs/SRS.md` (full 200-page SRS).

**UI work:** read `docs/DESIGN.md` before touching any screen (web, mobile or extension).
**Demo work:** the current goal and phase order is in `docs/DEMO_BUILD.md`; current state is in `docs/STATUS.md`.

---

## Common Commands

```bash
# Install all workspace packages
npm install

# Start all services (run from repo root)
bash dev-start.sh

# Individual services
npm run dev --workspace=services/backend
npm run dev --workspace=apps/web
npm run dev --workspace=services/issuers/nadra

# TypeScript check
npx tsc --noEmit

# Tests
npm test --workspace=services/backend
npm test --workspace=packages/sd-jwt

# Prisma (ALWAYS use --schema flag)
npx prisma generate --schema=services/backend/prisma/schema.prisma
npx prisma migrate status --schema=services/backend/prisma/schema.prisma
npx prisma migrate dev --schema=services/backend/prisma/schema.prisma --name <migration_name>
npx prisma studio --schema=services/backend/prisma/schema.prisma

# Docker
docker ps
docker start nexusid-postgres
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml ps
```

---

## Hard-Won Knowledge

### Postgres
- Runs in Docker container named `nexusid-postgres` on port 5432
- Check health: `docker ps --filter name=nexusid-postgres --format "{{.Status}}"`
- NOT a system postgresql service — do not use `pg_isready` or `postgresql.service`
- If container is stopped: `docker start nexusid-postgres`

### Prisma
- Schema is at `services/backend/prisma/schema.prisma` — NOT at repo root
- Every prisma CLI command MUST include `--schema=services/backend/prisma/schema.prisma`
- Running without `--schema` will silently use a wrong path

### SD-JWT Package
- Three named exports: `@nexusid/sd-jwt/issuer`, `@nexusid/sd-jwt/holder`, `@nexusid/sd-jwt/verifier`
- Uses SHA-256 digests and RSA-2048 signatures (CON-007, CON-008)
- Proof generation (ALG-001) MUST happen on device — private key never leaves Android Keystore

### Issuer Services
- Each issuer exposes `GET /.well-known/jwks.json` for public key
- Each issuer exposes `POST /api/v1/credentials/{type}/reverify` for account recovery
- NADRA uses 2-step: `POST /verify` → OTP → `POST /verify-otp`
- AU issuer rate-limited: 5 requests/minute per IP

### Next.js / Web Portal
- App Router (Next.js 14) — no Pages Router
- Tailwind **3.4** → shadcn/ui via **`npx shadcn@2.3.0`** only (latest CLI targets Tailwind v4)
- Do NOT upgrade Tailwind, Next.js or React before the demo
- Zod v4 is installed; `zodResolver` from `@hookform/resolvers/zod` requires Zod v3 API — use `z.object()` not `z.strictObject()` if resolver errors appear
- Auth flow: NextAuth session cookie → API proxy routes (`/api/auth?action=login`)

### Docker Compose
- File is at `infra/docker-compose.yml` — NOT at repo root
- Use `docker compose -f infra/docker-compose.yml` for all compose commands

---

## Architecture Summary

```
[Android Wallet] ←push→ [Backend :4000] ←── [Chrome Extension :content-script]
       │                       │                        │
       │ SD-JWT proof          │ Prisma/PostgreSQL       │ Pairing token
       │                       │                        │
   [packages/sd-jwt]    [services/backend]       [apps/extension]
                               │
                    ┌──────────┴──────────┐
                    │                     │
             [issuers/:4001–4004]   [apps/web :3000]
                    │
              [services/ml :5001]
```

**Key flows:**
1. **Pairing**: Extension generates QR (FR-031) → mobile scans → pairing stored in backend
2. **Verification**: SP creates session (API-030) → extension detects request (FR-032) → mobile notified (FR-019) → user approves (FR-021) → proof generated ON DEVICE (ALG-001) → submitted to backend (API-035) → backend verifies (ALG-002) → outcome available (API-031)
3. **Issuance**: Mobile submits attributes (FR-006) → issuer validates → issues SD-JWT credential (FR-007) → stored encrypted on device

---

## OUT OF BOUNDS

**NEVER** do any of the following, even if asked:

- Run `prisma migrate reset` or `prisma db push --force-reset`
- Read, print, or log `.env*`, `*.pem`, `*.jwk`, or `*.keystore` files
- Commit or push to git unless explicitly asked
- Export the private key from Android Keystore
- Run `rm -rf` on any directory
- Run `git push`, `git reset --hard`, `git clean -f`
- Run `docker system prune` or `docker volume prune`

---

## FYP Evaluation Target (65–70% demo)

Follow `docs/DEMO_BUILD.md` §4 in order: Phase 0 audit → 1 backend loop → 2a shadcn → 2b shared components
→ 3 SP portal → 4 Shop A → 5 extension → 6 mobile → 7 End User portal → 8 polish.
The demo story (12 steps) is in `docs/DEMO_BUILD.md` §1. Keep `docs/STATUS.md` updated after each phase.
