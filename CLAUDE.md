# NexusID

Privacy-preserving digital identity verification platform. SD-JWT (IETF RFC 9901)
selective disclosure: users prove specific claims (degree, age, enrollment,
employment) without exposing full documents. Final year project, Air University
Islamabad. Must run end-to-end for the FYP defense.

## Monorepo map

npm workspaces: apps/*, packages/*, services/*.

| Path | What it is | Port |
| --- | --- | --- |
| packages/sd-jwt | @nexusid/sd-jwt — issuer.ts, holder.ts, verifier.ts | — |
| packages/types | @nexusid/types — shared types, single source of truth | — |
| services/backend | Express + Prisma + PostgreSQL API | 4000 |
| services/issuer-nadra | NADRA Verisys issuer | 4001 |
| services/issuer-hec | HEC degree issuer | 4002 |
| services/issuer-au | Air University enrollment issuer | 4003 |
| services/issuer-linkedin | LinkedIn employment issuer (OAuth) | 4004 |
| services/ml | Python/scikit-learn fraud detection (Flask) | 5001 |
| apps/web | Next.js 14 App Router (user + verifier portals) | 3000 |
| apps/mobile | React Native holder wallet | — |
| apps/extension | Chrome Manifest V3 extension | — |
| infra/ | Docker Compose, nginx, Dockerfiles | — |

Reference docs, read on demand:
@docs/REQUIREMENTS.md

## Commands

    npm run dev -w services/backend                   # tsx watch
    npm test -w services/backend                      # jest + ts-jest + supertest
    npx prisma migrate dev --name <name> -w services/backend
    npx prisma generate -w services/backend
    npx tsc --noEmit -p services/backend
    npm run dev -w apps/web                           # Next.js dev server

## How we work together

- Paste evidence first. If something fails, paste the exact terminal output or
  stack trace. Never describe it from memory.
- No writes without approval. Confirm the exact diff or complete replacement
  file before applying. If a patch has been tried three or more times, switch
  to /safe-replace.
- Never rewrite working code unnecessarily. Never duplicate authentication logic.
- One scoped change at a time. Backend auth and web auth are separate flows;
  do not touch both in the same change unless I explicitly asked.

## Code conventions

- TypeScript strict mode everywhere. No `any`, no `@ts-ignore`.
- Zod v4 for all validation. `.parse()` throws; `.safeParse()` returns a result.
  Never use `zodResolver` — @hookform/resolvers is incompatible with Zod v4.
- Prisma accessors are singular camelCase: `prisma.user`, `prisma.credential`.
- Multi-table writes use `prisma.$transaction()`.
- Errors go through the typed error hierarchy and middleware. No bare throws in route handlers.

## Hard-won knowledge (do not undo these)

- Zod v4: `.string().email()` not `.string().email({ message: ... })` — the
  object-arg overload does not exist in v4.
- `zodResolver` is incompatible with Zod v4. Use manual `safeParse` + `setError`.
- Prisma accessors are singular camelCase only. `prisma.users` will throw at runtime.
- `sd_hash` trailing `~` is correct per RFC 9901 §6.2. Do not remove it.
- Do not touch `auth.controller.ts` and `web-auth.controller.ts` in the same
  change — they are separate auth flows by design.
- The mobile private key never leaves Android Keystore. All signing through
  `CryptoService`. Never pass a PEM anywhere.
- `react-native-biometrics` returns the public key only once — cache it via
  `StorageService` in the same function that creates the key.
- Blockchain audit writes are fail-silent by design. Revocation check is
  fail-open by design. These are intentional, not bugs.
- zk-SNARK (Groth16) is non-fatal: if `snarkjs` is unavailable, skip and log.
- Always check for stale Docker containers squatting a port before assuming the
  service is broken: `lsof -i :4000`.

## Out of bounds

- NEVER run `prisma migrate reset` or `prisma db push --force-reset`.
- NEVER read, print or log `.env*`, `*.pem`, `*.jwk`, or `*.keystore` files.
- NEVER commit or push unless I explicitly ask.
- NEVER export a private key from Android Keystore.
