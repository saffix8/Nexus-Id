---
paths:
  - "services/backend/**/*.ts"
---

# Backend rules
SRS reference: Chapter 5 REST API, Chapter 4 Architecture, MOD-8

- Routes parse with Zod and delegate. If you are writing an `if` in a route
  handler, it belongs in a service class.
- Services are singletons, exported as instances, constructed once.
- index.ts exposes `create_app()`. Never move port binding into it.
- Errors go through the typed error hierarchy and the error middleware. No bare
  `throw new Error(...)`, no `res.status(500).json({error: e})`.
- Responses go through the response helpers so shape stays consistent.
- Multi-table writes use `prisma.$transaction()`.
- Do not touch auth.controller.ts and web-auth.controller.ts in the same change
  unless I asked for both. They are separate flows by design.
- The in-memory session store in the NADRA issuer is a known production gap
  (Redis planned). Do not silently "fix" it mid-task; flag it.
