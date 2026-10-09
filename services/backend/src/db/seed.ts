import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// Placeholder public key used before generate-issuer-keys.ts is run.
// The generate-issuer-keys script overwrites these with real RSA-2048 PEM keys.
const PLACEHOLDER_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAplaceholderKeyRunGenerate
IssuerKeysScriptToReplaceThisWithARealRSA2048PublicKeyAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AQAB
-----END PUBLIC KEY-----`;

async function seedIssuerRegistry(): Promise<void> {
  console.log('🔑 Seeding issuer_registry...');

  const issuers = [
    {
      issuer_id: 'nadra.gov.pk',
      name: 'NADRA Pakistan',
      jwks_url: 'http://localhost:4001/.well-known/jwks.json',
      public_key: PLACEHOLDER_PUBLIC_KEY,
      active: true,
    },
    {
      issuer_id: 'hec.gov.pk',
      name: 'Higher Education Commission',
      jwks_url: 'http://localhost:4002/.well-known/jwks.json',
      public_key: PLACEHOLDER_PUBLIC_KEY,
      active: true,
    },
    {
      issuer_id: 'au.edu.pk',
      name: 'Air University',
      jwks_url: 'http://localhost:4003/.well-known/jwks.json',
      public_key: PLACEHOLDER_PUBLIC_KEY,
      active: true,
    },
    {
      issuer_id: 'linkedin.com',
      name: 'LinkedIn',
      jwks_url: 'http://localhost:4004/.well-known/jwks.json',
      public_key: PLACEHOLDER_PUBLIC_KEY,
      active: true,
    },
  ] as const;

  for (const issuer of issuers) {
    await prisma.issuerRegistry.upsert({
      where: { issuerId: issuer.issuer_id },
      create: {
        id: randomUUID(),
        issuerId: issuer.issuer_id,
        name: issuer.name,
        jwksUrl: issuer.jwks_url,
        publicKey: issuer.public_key,
        active: issuer.active,
      },
      update: {
        name: issuer.name,
        jwksUrl: issuer.jwks_url,
        active: issuer.active,
        // NOTE: public_key is intentionally NOT updated here.
        // generate-issuer-keys.ts will write the real key.
        // Re-seeding must not overwrite a key already generated.
      },
    });
    console.log(`  ✓ Upserted issuer: ${issuer.name} (${issuer.issuer_id})`);
  }
}

async function seedVerifiers(): Promise<void> {
  console.log('🏢 Seeding verifiers...');

  await prisma.verifier.upsert({
    where: { domain: 'demo-jobportal.nexusid.com' },
    create: {
      id: randomUUID(),
      domain: 'demo-jobportal.nexusid.com',
      displayName: 'Demo Job Portal',
      logoUrl: null,
      apiKey: 'demo_api_key_12345',
      ownerUserId: '00000000-0000-0000-0000-000000000001',
      trusted: true,
    },
    update: {
      displayName: 'Demo Job Portal',
      ownerUserId: '00000000-0000-0000-0000-000000000001',
      trusted: true,
    },
  });

  console.log('  ✓ Upserted verifier: Demo Job Portal');
}

async function seedDemoUser(): Promise<void> {
  console.log('👤 Seeding demo user...');

  // Fixed UUID so re-seeding is idempotent and the demo user ID is predictable.
  const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

  // Placeholder RSA public key — the mobile app / test script registers its real key.
  const DEMO_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAdemoUserPublicKeyReplace
MeWithARealRSA2048PublicKeyFromTheMobileAppOrTestScriptAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AQAB
-----END PUBLIC KEY-----`;

  await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    create: {
      id: DEMO_USER_ID,
      publicKey: DEMO_PUBLIC_KEY,
      pushToken: null,
      deviceInfo: {
        platform: 'demo',
        model: 'Demo Device',
        os_version: '0.0',
      },
    },
    update: {
      // Keep existing push_token and public_key if already registered by the app.
      deviceInfo: {
        platform: 'demo',
        model: 'Demo Device',
        os_version: '0.0',
      },
    },
  });

  console.log(`  ✓ Upserted demo user (id: ${DEMO_USER_ID})`);
  console.log('  ℹ  Run the mobile app and register to replace the placeholder public key.');
}

async function main(): Promise<void> {
  console.log('\n🌱 NexusID database seeding started\n');

  try {
    await seedIssuerRegistry();
    await seedDemoUser();
    await seedVerifiers();

    console.log('\n✅ Seeding complete.\n');
    console.log('Next step: run `npx ts-node scripts/generate-issuer-keys.ts`');
    console.log('to generate real RSA-2048 key pairs for each issuer service.\n');
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
