/**
 * demo-reset.ts — `npm run demo:reset` (docs/DEMO_BUILD.md §5, Phase 8)
 *
 * Puts the dev database back into a clean demo state:
 *   1. Re-seeds the issuer registry and Service Provider "Shop A" (seed-demo.ts).
 *   2. Deletes every verification session of Shop A and of the demo End User
 *      (results cascade; their fraud flags go first). Clears the user's portal
 *      QR sign-in sessions.
 *   3. Backfills ~24 past Shop A verifications over the last 7 days, not linked
 *      to any user, so the SP dashboard chart and log aren't empty (DESIGN.md §10).
 *
 * Keeps: users, credentials, device keys, browser pairings, other providers'
 * data, audit logs. Never touches the schema (no migrate reset).
 *
 *   npm run demo:reset                      # demo user admin@nexusid.com
 *   npm run demo:reset -- --email you@x.pk  # another End User
 *   npm run demo:reset -- --dry-run         # show what would change
 */

import "dotenv/config";
import { createHash, randomBytes } from "crypto";
import {
  seedIssuers,
  seedShopA,
  seedPrisma as prisma,
  SHOP_A,
} from "./seed-demo.js";

const DEFAULT_DEMO_EMAIL = "admin@nexusid.com";
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 120_000; // BR-002 / ALG-005
const PREDICATE = SHOP_A.requiredPredicates[0];
const ISSUER = "nadra.gov.pk";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Small seeded PRNG so every reset produces the same-looking history. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Outcome = "VERIFIED" | "FAILED" | "DECLINED" | "EXPIRED";

// 24 sessions: mostly verified, a few of each negative outcome (realistic success rate ≈ 71%).
const MIX: Outcome[] = [
  ...Array<Outcome>(17).fill("VERIFIED"),
  "FAILED",
  "FAILED",
  "DECLINED",
  "DECLINED",
  "DECLINED",
  "EXPIRED",
  "EXPIRED",
];

const STATUS: Record<Outcome, string> = {
  VERIFIED: "completed",
  FAILED: "failed",
  DECLINED: "rejected",
  EXPIRED: "expired",
};

function backfillRows(now: Date) {
  const rand = mulberry32(2026);
  // Shuffle the outcome mix deterministically.
  const mix = [...MIX];
  for (let i = mix.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [mix[i], mix[j]] = [mix[j], mix[i]];
  }
  // Spread over the last 7 days, 09:00–22:00 server time, ending at least 2 h ago
  // so today's live demo row is clearly the newest.
  const latest = now.getTime() - 2 * 60 * 60 * 1000;
  return mix
    .map((outcome) => {
      const day = Math.floor(rand() * 7);
      const base = new Date(now.getTime() - day * DAY_MS);
      base.setHours(
        9 + Math.floor(rand() * 13),
        Math.floor(rand() * 60),
        Math.floor(rand() * 60),
        0,
      );
      const createdAt = new Date(
        Math.min(base.getTime(), latest - Math.floor(rand() * 3_600_000)),
      );
      return { outcome, createdAt };
    })
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const email = (
    arg("--email") ??
    process.env.DEMO_USER_EMAIL ??
    DEFAULT_DEMO_EMAIL
  ).toLowerCase();

  if (process.env.NODE_ENV === "production") {
    throw new Error("demo:reset refuses to run with NODE_ENV=production");
  }

  console.log(
    `\nNexusID demo reset${dryRun ? " (dry run, nothing is written)" : ""}\n`,
  );

  // 1. Re-seed Shop A + issuers (idempotent upserts).
  let shopId: string;
  if (dryRun) {
    const shop = await prisma.verifier.findUnique({
      where: { domain: SHOP_A.domain },
      select: { id: true },
    });
    if (!shop)
      throw new Error(
        "Shop A is not seeded yet. Run `npm run seed:demo` first.",
      );
    shopId = shop.id;
  } else {
    await seedIssuers();
    shopId = (await seedShopA()).id;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user)
    console.warn(`\n⚠ No End User with email ${email}. Only Shop A is reset.`);

  // 2. Sessions to clear: Shop A's and the demo user's (any provider).
  const where = {
    OR: [{ verifierId: shopId }, ...(user ? [{ userId: user.id }] : [])],
  };
  const requests = await prisma.verificationRequest.findMany({
    where,
    select: { id: true },
  });
  const ids = requests.map((r) => r.id);

  const [credentials, pairings, signIns] = user
    ? await Promise.all([
        prisma.credential.count({ where: { userId: user.id } }),
        prisma.devicePairing.count({
          where: { userId: user.id, status: "paired" },
        }),
        prisma.portalSignIn.count({ where: { userId: user.id } }),
      ])
    : [0, 0, 0];

  console.log("\nClearing:");
  console.log(
    `  verification sessions (Shop A + ${user ? user.email : "no user"}) : ${ids.length}`,
  );
  console.log(
    `  portal QR sign-in sessions                                : ${signIns}`,
  );
  console.log("Keeping:");
  console.log(`  credentials : ${credentials}`);
  console.log(`  paired browsers : ${pairings}`);

  const now = new Date();
  const rows = backfillRows(now);

  if (dryRun) {
    console.log(`\nWould backfill ${rows.length} past Shop A verifications.\n`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (ids.length) {
      await tx.fraudFlag.deleteMany({ where: { requestId: { in: ids } } });
      await tx.verificationRequest.deleteMany({ where: { id: { in: ids } } }); // results cascade
    }
    if (user) await tx.portalSignIn.deleteMany({ where: { userId: user.id } });

    // 3. Backfill. BR-015: outcome, condition, issuer, proof hash only.
    for (const { outcome, createdAt } of rows) {
      const decidedAt = new Date(
        createdAt.getTime() + 6_000 + Math.floor(Math.random() * 20_000),
      );
      const hasProof = outcome === "VERIFIED" || outcome === "FAILED";
      await tx.verificationRequest.create({
        data: {
          verifierId: shopId,
          userId: null,
          predicate: PREDICATE,
          requestedFields: [PREDICATE],
          nonce: randomBytes(32).toString("base64url"),
          pageUrl: "http://localhost:3001/",
          status: STATUS[outcome],
          createdAt,
          expiresAt: new Date(createdAt.getTime() + SESSION_TTL_MS),
          relayedAt: new Date(createdAt.getTime() + 800),
          completedAt: hasProof ? decidedAt : null,
          rejectedAt: outcome === "DECLINED" ? decidedAt : null,
          ...(hasProof
            ? {
                result: {
                  create: {
                    outcome,
                    condition: PREDICATE,
                    issuer: ISSUER,
                    proofHash: createHash("sha256")
                      .update(randomBytes(32))
                      .digest("hex"),
                    verifiedAt: decidedAt,
                  },
                },
              }
            : {}),
        },
      });
    }
  });

  const tally = rows.reduce<Record<string, number>>(
    (t, r) => ((t[r.outcome] = (t[r.outcome] ?? 0) + 1), t),
    {},
  );
  console.log(
    `\nBackfilled ${rows.length} Shop A verifications over 7 days: ` +
      Object.entries(tally)
        .map(([k, v]) => `${v} ${k}`)
        .join(", "),
  );
  console.log("\nDone. Reload the SP dashboard and the history pages.\n");
}

main()
  .catch((err) => {
    console.error(
      "demo:reset failed:",
      err instanceof Error ? err.message : err,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
