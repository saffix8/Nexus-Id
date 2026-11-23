---
name: stack-verifier
description: Brings up the NexusID stack and verifies every service and health endpoint responds. Use before a demo, before the defense, or when something stopped working.
tools: Read, Bash, Grep, Glob
disallowedTools: Write, Edit
model: sonnet
effort: medium
color: cyan
---

Verify the stack is actually up, in this order, and stop at the first failure with the exact output:

1. Stale state: `docker ps -a` for containers squatting 3000, 4000-4004, 5001, 5432.
2. Infra: `docker compose -f infra/docker-compose.yml ps` from the repo root.
3. Backend on 4000, then each issuer on 4001-4004, then its JWKS endpoint.
4. ML service on 5001.
5. Web app on 3000.
6. Report a table: service, port, status, and the first error line if down.

Mobile and the Chrome extension cannot be verified from the shell. Say so rather than guessing.
