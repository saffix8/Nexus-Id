import fs from 'fs';
import { SignJWT, importPKCS8 } from 'jose';
import crypto from 'crypto';

const userId = crypto.randomUUID();
const challenge = "test-challenge-123";

async function run() {
  try {
    const privateKeyPem = fs.readFileSync('/tmp/nexusid-test/private.pem', 'utf8');
    const publicKeyPem = fs.readFileSync('/tmp/nexusid-test/public.pem', 'utf8');
    
    console.log(`Registering user: ${userId}`);
    const regRes = await fetch('http://localhost:4000/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        user_id: userId, 
        public_key: publicKeyPem, 
        push_token: "test-token" 
      })
    });
    console.log("Register status:", regRes.status);

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
    
    const data = await loginRes.json();
    console.log("Login status:", loginRes.status);
    
    if (data.success) {
      console.log("\nCopy these commands into your terminal:");
      console.log(`export TEST_USER="${userId}"`);
      console.log(`export TOKEN="${data.data.token}"`);
    } else {
      console.log("Login failed:", data);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
