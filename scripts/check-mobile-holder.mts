// Cross-check: the mobile on-device holder (apps/mobile/src/crypto/holder.ts)
// must produce proofs the backend verifier (@nexusid/sd-jwt verifyProof) accepts.
//
//   npx tsx scripts/check-mobile-holder.mts
//
// The signer here is Node's RSA-SHA256 — the same algorithm (SHA256withRSA,
// base64 output) the Android Keystore uses via react-native-biometrics.
import { createSign, generateKeyPairSync, createHash } from "node:crypto";
import {
  createCredential,
  generateIssuerKeyPair,
} from "@nexusid/sd-jwt/issuer";
import { verifyProof } from "@nexusid/sd-jwt/verifier";
import { selectDisclosures as pkgSelect } from "@nexusid/sd-jwt/holder";
import {
  generateProof,
  sha256Base64url,
  decodeDisclosure,
  disclosableFields,
  base64urlDecodeBytes,
  base64urlEncodeBytes,
  utf8Decode,
  utf8Encode,
} from "../apps/mobile/src/crypto/holder.ts";

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  → ${JSON.stringify(detail)}`}`,
  );
  if (!ok) failures++;
}

// 1. Primitives vs Node
for (const s of [
  "",
  "a",
  "ab",
  "abc",
  "hello world",
  "محمد صفی",
  "🙂 emoji ✓",
  "x".repeat(1000),
]) {
  const node = createHash("sha256").update(s, "utf8").digest("base64url");
  check(
    `sha256Base64url(${JSON.stringify(s.slice(0, 12))})`,
    sha256Base64url(s) === node,
  );
  check(
    `utf8 round-trip ${JSON.stringify(s.slice(0, 12))}`,
    utf8Decode(utf8Encode(s)) === s &&
      Buffer.from(utf8Encode(s)).equals(Buffer.from(s, "utf8")),
  );
  const b = Buffer.from(s, "utf8");
  check(
    `base64url ${JSON.stringify(s.slice(0, 12))}`,
    base64urlEncodeBytes(new Uint8Array(b)) === b.toString("base64url") &&
      Buffer.from(base64urlDecodeBytes(b.toString("base64url"))).equals(b),
  );
}

// 2. End-to-end proof against the real verifier
const issuer = await generateIssuerKeyPair();
const holder = generateKeyPairSync("rsa", { modulusLength: 2048 });
const holderPub = holder.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const sign = async (input: string) =>
  createSign("RSA-SHA256")
    .update(input, "utf8")
    .sign(holder.privateKey, "base64");

const cred = await createCredential({
  claims: [
    { field: "full_name", value: "محمد صفی" },
    { field: "date_of_birth", value: "2000-01-15" },
    { field: "AGE_OVER_18", value: true },
    { field: "AGE_OVER_21", value: true },
  ],
  alwaysVisibleClaims: { credential_type: "identity" },
  issuerDID: "nadra.gov.pk",
  holderPublicKey: holderPub,
  issuerPrivateKey: issuer.privateKey,
  keyId: "test",
});

check(
  "disclosableFields",
  JSON.stringify(disclosableFields(cred as never).sort()) ===
    JSON.stringify([
      "AGE_OVER_18",
      "AGE_OVER_21",
      "date_of_birth",
      "full_name",
    ]),
);
check(
  "decodeDisclosure (non-ASCII value)",
  cred.disclosures.some((d) => decodeDisclosure(d).value === "محمد صفی"),
);

const nonce = "nonce-" + Date.now();
const proof = await generateProof({
  credential: cred as never,
  requestedFields: ["AGE_OVER_18"],
  verifierId: "verifier-123",
  nonce,
  sign,
});
check(
  "selectDisclosures matches package",
  JSON.stringify(proof.presentation.disclosures) ===
    JSON.stringify(pkgSelect(cred as never, ["AGE_OVER_18"])),
);
check(
  "only the requested disclosure is sent",
  proof.presentation.disclosures.length === 1,
);

const ok = await verifyProof(proof, {
  issuerPublicKey: issuer.publicKey,
  userPublicKey: holderPub,
  expectedNonce: nonce,
  verifierId: "verifier-123",
  expectedFields: ["AGE_OVER_18"],
});
check("verifyProof accepts the mobile proof", ok.valid === true, ok);

const wrongNonce = await verifyProof(proof, {
  issuerPublicKey: issuer.publicKey,
  userPublicKey: holderPub,
  expectedNonce: "other",
  verifierId: "verifier-123",
});
check("verifyProof rejects a wrong nonce", wrongNonce.valid === false);

const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherPub = other.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const wrongKey = await verifyProof(proof, {
  issuerPublicKey: issuer.publicKey,
  userPublicKey: otherPub,
  expectedNonce: nonce,
  verifierId: "verifier-123",
});
check("verifyProof rejects a different holder key", wrongKey.valid === false);

console.log(failures ? `\n${failures} FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
