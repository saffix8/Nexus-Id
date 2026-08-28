import { PrismaClient } from '@prisma/client';

// ── Singleton pattern ─────────────────────────────────────────────────────────
// In development, Next.js (and ts-node with --watch) hot-reload can cause
// multiple PrismaClient instances to be created, exhausting the connection pool.
// We store the instance on the global object to prevent this.

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
    errorFormat: process.env.NODE_ENV === 'development' ? 'pretty' : 'minimal',
  });
}

const prisma: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  // Only cache on global in non-production to avoid stale clients in prod
  globalThis.__prisma = prisma;
}

// Gracefully disconnect on process termination
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
