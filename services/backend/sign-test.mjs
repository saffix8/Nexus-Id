import { readFileSync } from 'fs';
import { importPKCS8, SignJWT } from 'jose';

const privateKeyPem = readFileSync('/tmp/nexusid-test/private.pem', 'utf8');
const privateKey = await importPKCS8(privateKeyPem, 'RS256');

const challenge = process.argv[2];

if (!challenge) {
  console.error('Usage: node sign-test.mjs <challenge>');
  process.exit(1);
}

const token = await new SignJWT({})
  .setProtectedHeader({ alg: 'RS256' })
  .setAudience(challenge)
  .setIssuedAt()
  .setExpirationTime('5m')
  .sign(privateKey);

console.log(token);
