import fs from 'fs';
import { SignJWT, importPKCS8 } from 'jose';
import crypto from 'crypto';

const userId = crypto.randomUUID();
const challenge = "test-challenge-123";

async function run() {
  try {
    const privateKeyPem = fs.readFileSync('/tmp/nexusid-test/private.pem', 'utf8');
    const publicKeyPem = fs.readFileSync('/tmp/nexusid-test/public.pem', 'utf8');
    
    console.log(`1. Registering user: ${userId}`);
    await fetch('http://localhost:4000/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, public_key: publicKeyPem, push_token: "test-token" })
    });

    console.log(`2. Logging in...`);
    const privateKey = await importPKCS8(privateKeyPem, 'RS256');
    const signature = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setAudience(challenge)
      .sign(privateKey);
      
    const loginRes = await fetch('http://localhost:4000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, signature, challenge })
    });
    
    const loginData = await loginRes.json();
    const token = loginData.data.token;
    console.log(`3. Login successful. Token obtained.`);

    console.log(`4. Fetching profile for user ${userId}...`);
    const profileRes = await fetch(`http://localhost:4000/api/v1/users/${userId}/profile`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const profileData = await profileRes.json();
    console.log("\n--- PROFILE RESPONSE ---");
    console.log(JSON.stringify(profileData, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
