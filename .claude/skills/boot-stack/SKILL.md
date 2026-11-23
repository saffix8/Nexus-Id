---
name: boot-stack
description: Bring the whole NexusID stack up in dependency order and report what is healthy. Use at the start of a working session or before a demo.
disable-model-invocation: true
allowed-tools: Bash(docker compose *) Bash(docker ps *) Bash(npm run *) Bash(curl *) Bash(lsof *)
model: sonnet
---

Bring up NexusID from the repo root, in this order, reporting each step:

1. `docker ps -a` — list anything already holding 3000, 4000-4004, 5001, 5432.
2. `docker compose -f infra/docker-compose.yml up -d` — Postgres and infra.
3. Wait for Postgres, then `npx prisma migrate status`. Report drift; do not apply.
4. Backend: `npm run dev -w services/backend`. Confirm 4000 responds.
5. The four issuers in order (4001-4004). Confirm JWKS endpoint returns a key.
6. ML service on 5001.
7. Web app on 3000.

Finish with a table: service, port, up/down, first error line if down.
