/**
 * scripts/generate-issuer-keys.ts
 *
 * Run ONCE on first setup (or when rotating keys):
 *   npx ts-node scripts/generate-issuer-keys.ts
 *
 * What it does:
 *  1. Generates an RSA-2048 key pair for each of the 4 issuer microservices.
 *  2. Writes the keys to services/issuers/{name}/.issuer-private-key.pem
 *     and services/issuers/{name}/.issuer-public-key.pem
 *  3. Updates the issuer_registry table in the database with the real public key.
 *
 * The private key files are gitignored. Never commit them.
 * The public keys are safe to commit and are also served via /.well-known/jwks.json.
 */

import { generateKeyPair, createPublicKey } from 'crypto';
import { promisify } from 'util';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const generateKeyPairAsync = promisify(generateKeyPair);
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Issuer configuration
// ---------------------------------------------------------------------------

interface IssuerConfig {
  /** Matches issuer_id in the issuer_registry table */
  issuerId: string;
  /** Human-readable name for logging */
  name: string;
  /** Directory under services/issuers/ */
  dir: string;
}

const ISSUERS: IssuerConfig[] = [
  { issuerId: 'nadra.gov.pk',  name: 'NADRA',          dir: 'nadra' },
  { issuerId: 'hec.gov.pk',    name: 'HEC',             dir: 'hec' },
  { issuerId: 'au.edu.pk',     name: 'Air University',  dir: 'air-university' },
  { issuerId: 'linkedin.com',  name: 'LinkedIn',        dir: 'linkedin' },
];

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

interface GeneratedKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
}

async function generateRSA2048KeyPair(): Promise<GeneratedKeyPair> {
  const { privateKey, publicKey } = await generateKeyPairAsync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    privateKeyPem: privateKey as unknown as string,
    publicKeyPem:  publicKey  as unknown as string,
  };
}

// ---------------------------------------------------------------------------
// JWKS helpers
// ---------------------------------------------------------------------------

/**
 * Returns the base directory of the monorepo, resolved relative to this script.
 * Assumes the script lives at <root>/scripts/generate-issuer-keys.ts.
 */
function repoRoot(): string {
  return path.resolve(__dirname, '..');
}

function issuerDir(issuer: IssuerConfig): string {
  return path.join(repoRoot(), 'services', 'issuers', issuer.dir);
}

// ---------------------------------------------------------------------------
// Database update
// ---------------------------------------------------------------------------

async function updateIssuerPublicKey(issuerId: string, publicKeyPem: string): Promise<void> {
  const updated = await prisma.issuerRegistry.updateMany({
  where: { issuerId: issuerId },
  data: { publicKey: publicKeyPem, updatedAt: new Date() },
});
  if (updated.count === 0) {
    throw new Error(
      `issuer_registry row not found for issuer_id="${issuerId}". ` +
      'Run `npx prisma db seed` first to create the row, then re-run this script.'
    );
  }
}

// ---------------------------------------------------------------------------
// Per-issuer processing
// ---------------------------------------------------------------------------

async function processIssuer(issuer: IssuerConfig): Promise<void> {
  const keysDir = path.join(issuerDir(issuer), '.keys');
  const privateKeyPath = path.join(keysDir, '.issuer-private-key.pem');
  const publicKeyPath  = path.join(keysDir, '.issuer-public-key.pem');

  // Safety: warn if keys already exist so the operator can make a conscious choice.
  if (existsSync(privateKeyPath)) {
    console.warn(
      `  ⚠️  Private key already exists at ${privateKeyPath}.\n` +
      '     Delete it manually if you want to rotate keys, then re-run this script.\n' +
      '     Skipping key generation for this issuer to avoid silent rotation.'
    );
    // Still update the DB with whatever public key is currently on disk.
    const { readFile } = await import('fs/promises');
    const existingPublicKey = await readFile(publicKeyPath, 'utf8');
    await updateIssuerPublicKey(issuer.issuerId, existingPublicKey);
    console.log(`  ✓ DB updated with existing public key for ${issuer.name}`);
    return;
  }

  // Create .keys directory (gitignored)
  await mkdir(keysDir, { recursive: true });

  // Generate key pair
  const { privateKeyPem, publicKeyPem } = await generateRSA2048KeyPair();

  // Write key files
  await writeFile(privateKeyPath, privateKeyPem, { mode: 0o600 });
  await writeFile(publicKeyPath,  publicKeyPem,  { mode: 0o644 });
  console.log(`  ✓ Keys written to ${keysDir}`);

  // Update issuer_registry
  await updateIssuerPublicKey(issuer.issuerId, publicKeyPem);
  console.log(`  ✓ issuer_registry updated for ${issuer.name} (${issuer.issuerId})`);
}

// ---------------------------------------------------------------------------
// Gitignore helper
// ---------------------------------------------------------------------------

async function ensureKeysGitignored(): Promise<void> {
  const gitignorePath = path.join(repoRoot(), '.gitignore');
  const { readFile, appendFile } = await import('fs/promises');

  let content = '';
  try {
    content = await readFile(gitignorePath, 'utf8');
  } catch {
    // .gitignore may not exist yet — we'll create the entry
  }

  const entries = [
    '# Issuer private keys — NEVER COMMIT',
    'services/issuers/**/.keys/',
    'services/issuers/**/.issuer-private-key.pem',
  ];

  const toAppend = entries.filter(e => !content.includes(e));

  if (toAppend.length > 0) {
    await appendFile(gitignorePath, '\n' + toAppend.join('\n') + '\n');
    console.log('  ✓ Added .keys/ entries to .gitignore');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n🔑 NexusID — Issuer key generation\n');

  // Ensure private key directories are gitignored before creating anything
  await ensureKeysGitignored();

  for (const issuer of ISSUERS) {
    console.log(`\nProcessing issuer: ${issuer.name} (${issuer.issuerId})`);
    try {
      await processIssuer(issuer);
    } catch (err) {
      console.error(`  ❌ Failed to process ${issuer.name}:`, err);
      // Continue with remaining issuers rather than aborting entirely
    }
  }

  console.log('\n✅ Key generation complete.\n');
  console.log('Each issuer service reads its private key from:');
  console.log('  services/issuers/{name}/.keys/.issuer-private-key.pem\n');
  console.log('JWKS endpoints are served at:');
  for (const issuer of ISSUERS) {
    const port = { nadra: 4001, hec: 4002, 'air-university': 4003, linkedin: 4004 }[issuer.dir];
    console.log(`  http://localhost:${port}/.well-known/jwks.json  →  ${issuer.name}`);
  }
  console.log('');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
