---
name: issuer-check
description: Verify all four issuer services can import the SD-JWT package, expose JWKS, and issue a credential the backend verifier accepts.
disable-model-invocation: true
allowed-tools: Bash(npm *) Bash(npx *) Bash(node *) Bash(curl *)
model: sonnet
---

For each of services/issuer-nadra, issuer-hec, issuer-au, issuer-linkedin:

1. Confirm its `await import('@nexusid/sd-jwt/...')` calls resolve. If any fails,
   the subpath `exports` map in packages/sd-jwt/package.json is the first suspect.
2. Confirm key generation ran and the JWKS endpoint returns a usable public key.
3. Issue one test credential and verify it with the real verifier from @nexusid/sd-jwt.

Report a four-row table: issuer, imports, JWKS, issue+verify. Then name the highest-priority failure.
