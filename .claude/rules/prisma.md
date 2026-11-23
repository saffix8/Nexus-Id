---
paths:
  - "services/backend/prisma/**"
  - "**/schema.prisma"
---

# Prisma rules

- Accessors are singular camelCase: prisma.user, prisma.auditLog,
  prisma.credential. Never the plural/snake_case table names.
- Schema change workflow, in this order: edit schema.prisma, show me the diff,
  then `npx prisma migrate dev --name <descriptive_name>`, then
  `npx prisma generate`. Never `migrate reset`, never `db push --force-reset`.
- A migration that would drop a column or table stops and asks first.
- After generate, re-run the backend type check before declaring success:
      npx tsc --noEmit -p services/backend
