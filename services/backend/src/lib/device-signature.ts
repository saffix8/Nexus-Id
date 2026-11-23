// services/backend/src/lib/device-signature.ts
//
// Core check of ALG-007 (AuthenticateDeviceChallenge): did the End User's
// registered device key sign this exact data? RSA with SHA-256 (CON-007),
// i.e. what Android Keystore's SHA256withRSA and WebCrypto's
// RSASSA-PKCS1-v1_5/SHA-256 both produce. Shared by mobile login (API-020)
// and QR-challenge redemption (API-025) so the logic lives in one place.

import { createVerify } from "crypto";

/**
 * True when `signature` (base64 or base64url) is a valid RSA-SHA256 signature
 * over the UTF-8 bytes of `data` by `publicKeyPem`. Never throws.
 */
export function verifyDeviceSignature(
  publicKeyPem: string,
  data: string,
  signature: string,
): boolean {
  try {
    const verifier = createVerify("SHA256");
    verifier.update(data, "utf8");
    // Node's base64 decoder accepts the base64url alphabet too.
    return verifier.verify(publicKeyPem, signature, "base64");
  } catch {
    return false;
  }
}
