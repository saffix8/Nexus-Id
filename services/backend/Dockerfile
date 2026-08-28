# ─────────────────────────────────────────────────────────────
# NexusID Backend — Development
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS development

WORKDIR /app

# Root monorepo manifests
COPY package*.json ./

# Workspace manifests
COPY services/backend/package.json ./services/backend/package.json
COPY packages/sd-jwt/package.json ./packages/sd-jwt/package.json
COPY packages/types/package.json ./packages/types/package.json

# Install the complete workspace dependency tree
RUN npm install

# TypeScript configuration
COPY services/backend/tsconfig.json ./services/backend/tsconfig.json

# Prisma
COPY services/backend/prisma ./services/backend/prisma

# Workspace source
COPY packages/sd-jwt ./packages/sd-jwt
COPY packages/types ./packages/types

# Backend source
COPY services/backend/src ./services/backend/src

# Generate Prisma client
RUN npx prisma generate --schema=services/backend/prisma/schema.prisma

EXPOSE 4000

WORKDIR /app/services/backend

CMD ["npm", "run", "dev"]


# ─────────────────────────────────────────────────────────────
# Production builder
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY services/backend/package.json ./services/backend/package.json
COPY packages/sd-jwt/package.json ./packages/sd-jwt/package.json
COPY packages/types/package.json ./packages/types/package.json

RUN npm install

COPY services/backend/tsconfig.json ./services/backend/tsconfig.json
COPY services/backend/prisma ./services/backend/prisma
COPY packages/sd-jwt ./packages/sd-jwt
COPY packages/types ./packages/types
COPY services/backend/src ./services/backend/src

RUN npx prisma generate --schema=services/backend/prisma/schema.prisma
RUN npm run build --workspace=services/backend


# ─────────────────────────────────────────────────────────────
# Production runtime
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/services/backend/package.json ./services/backend/package.json

RUN npm install --omit=dev --workspace=services/backend

COPY --from=builder /app/services/backend/dist ./services/backend/dist
COPY --from=builder /app/services/backend/prisma ./services/backend/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

WORKDIR /app/services/backend

EXPOSE 4000

CMD ["node", "dist/index.js"]
