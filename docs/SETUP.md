# NexusID — Local Setup

See the "DEVELOPMENT SETUP" section of NEXUSID_PROJECT.md for the canonical
step list. Quick version:

1. `npm install` at repo root
2. `docker-compose -f infra/docker-compose.yml up -d postgres redis`
3. `cd services/backend && npx prisma migrate dev`
4. `npx ts-node scripts/generate-issuer-keys.ts`
5. `npx prisma db seed`
6. Start each service (see README run commands) or `docker-compose up`
