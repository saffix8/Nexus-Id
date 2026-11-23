---
paths:
  - "packages/sd-jwt/**/*.ts"
  - "services/issuers/**/*.ts"
---

# SD-JWT rules (RFC 9901)
SRS reference: CON-006, CON-007, MOD-5

- This package is the cryptographic core. A change here breaks all four issuer
  services, the backend verifier, the mobile holder and the extension at once.
  Propose the change, state every consumer it affects, then wait.
- issuer.ts / holder.ts / verifier.ts share one disclosure format. Any change to
  hashing, salting, or the ~ separator must be applied to all three in the same
  change, with the RFC section quoted in the commit message.
- The trailing ~ on sd_hash is correct per RFC 9901 §6.2. Do not "fix" it.
- Use the jose library for JWT/JWK work and Node crypto for RSA/SHA-256.
  Do not add another crypto dependency.
- Subpath exports: every entry point consumers import must be declared in the
  package exports map. After editing package.json, verify with:
      node -e "import('@nexusid/sd-jwt/issuer').then(m=>console.log(Object.keys(m)))"
- After any change here, run the integration suite:
      npm test -w services/backend
