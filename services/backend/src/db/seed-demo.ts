/**
 * seed-demo.ts — `npm run seed:demo`
 *
 * Idempotent demo seed (docs/DEMO_BUILD.md):
 *   1. The 4 issuers in the issuer public key registry (FR-004). Each public
 *      key is read from the issuer's live `/.well-known/jwks.json`. If an
 *      issuer is not running, an existing registry key is kept; a new row gets
 *      a placeholder and a warning (re-run once the issuers are up).
 *   2. Service Provider "Shop A" with a known API key, a portal login and
 *      AGE_OVER_18 configured (FR-041). Only the API key's SHA-256 is stored.
 *
 * Never deletes data. Safe to run repeatedly.
 */

import "dotenv/config";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { importJWK, exportSPKI, type JWK } from "jose";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const SHOP_A = {
  displayName: "Shop A",
  domain: "shop-a.nexusid.demo",
  email: "shop-a@nexusid.demo",
  password: "ShopA-Demo-2026",
  /** Known demo key, used server-side by the Shop A demo site. */
  apiKey: "nxk_shop_a_demo_key_2026",
  requiredPredicates: ["AGE_OVER_18"],
} as const;

const ISSUERS = [
  { issuerId: "nadra.gov.pk", name: "NADRA Pakistan", port: 4001 },
  { issuerId: "hec.gov.pk", name: "Higher Education Commission", port: 4002 },
  { issuerId: "au.edu.pk", name: "Air University", port: 4003 },
  { issuerId: "linkedin.com", name: "LinkedIn", port: 4004 },
] as const;

const PLACEHOLDER_PUBLIC_KEY =
  "PLACEHOLDER — run `npm run seed:demo` while the issuer is running";

/** The issuer's RS256 signing key from its JWKS, as SPKI PEM. */
async function fetchIssuerKey(jwksUrl: string): Promise<string | null> {
  try {
    const res = await fetch(jwksUrl, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const { keys } = (await res.json()) as { keys?: JWK[] };
    const jwk =
      keys?.find((k) => k.kty === "RSA" && (!k.use || k.use === "sig")) ??
      keys?.[0];
    if (!jwk) return null;
    const key = await importJWK({ ...jwk, alg: jwk.alg ?? "RS256" }, "RS256", {
      extractable: true,
    });
    if (key instanceof Uint8Array) return null;
    return await exportSPKI(key);
  } catch {
    return null;
  }
}

async function seedIssuers(): Promise<void> {
  console.log("Issuer registry:");
  for (const issuer of ISSUERS) {
    const jwksUrl = `http://localhost:${issuer.port}/.well-known/jwks.json`;
    const liveKey = await fetchIssuerKey(jwksUrl);
    const existing = await prisma.issuerRegistry.findUnique({
      where: { issuerId: issuer.issuerId },
    });

    await prisma.issuerRegistry.upsert({
      where: { issuerId: issuer.issuerId },
      create: {
        issuerId: issuer.issuerId,
        name: issuer.name,
        jwksUrl,
        publicKey: liveKey ?? PLACEHOLDER_PUBLIC_KEY,
        active: true,
      },
      update: {
        name: issuer.name,
        jwksUrl,
        active: true,
        ...(liveKey ? { publicKey: liveKey } : {}),
      },
    });

    const keyNote = liveKey
      ? "key from live JWKS"
      : existing
        ? "issuer not reachable, kept existing key"
        : "issuer not reachable, PLACEHOLDER key (re-run with issuers up)";
    console.log(
      `  ✓ ${issuer.name.padEnd(28)} ${issuer.issuerId.padEnd(14)} ${keyNote}`,
    );
  }
}

async function seedShopA(): Promise<void> {
  const apiKeyHash = createHash("sha256")
    .update(SHOP_A.apiKey, "utf8")
    .digest("hex");
  const passwordHash = await bcrypt.hash(SHOP_A.password, 12);
  const data = {
    displayName: SHOP_A.displayName,
    email: SHOP_A.email,
    passwordHash,
    apiKey: apiKeyHash,
    apiKeyPrefix: SHOP_A.apiKey.slice(0, 8),
    apiKeyRotatedAt: new Date(),
    trusted: true,
    requiredPredicates: [...SHOP_A.requiredPredicates],
  };

  const shop = await prisma.verifier.upsert({
    where: { domain: SHOP_A.domain },
    create: { domain: SHOP_A.domain, ...data },
    update: data,
  });

  console.log("\nService Provider:");
  console.log(`  ✓ ${shop.displayName} (${shop.id})`);
  console.log(`    API key      : ${SHOP_A.apiKey}`);
  console.log(`    Portal login : ${SHOP_A.email} / ${SHOP_A.password}`);
  console.log(`    Predicates   : ${shop.requiredPredicates.join(", ")}`);
}

async function main(): Promise<void> {
  console.log("\nNexusID demo seed\n");
  await seedIssuers();
  await seedShopA();
  console.log("\nDone.\n");
}

main()
  .catch((err) => {
    console.error("seed:demo failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
