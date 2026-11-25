// End-to-end credential lifecycle check against the running NexusID stack.
// Usage: node scripts/verify-flow.mjs   (run /boot-stack first; all issuers must be up)
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const holder = await import(`${ROOT}/packages/sd-jwt/dist/holder.js`);
const verifier = await import(`${ROOT}/packages/sd-jwt/dist/verifier.js`);

const API = "http://localhost:4000/api/v1";
const results = [];
const rec = (step, name, pass, detail = "") => {
  results.push({ step, name, pass, detail });
  console.log(
    `${pass === true ? "PASS" : pass === false ? "FAIL" : "N/A "}  [${step}] ${name}${detail ? "  — " + detail : ""}`,
  );
};

async function call(method, path, { body, headers = {} } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j;
  try {
    j = await r.json();
  } catch {
    j = null;
  }
  return { status: r.status, body: j };
}
const b64u = (b) => Buffer.from(b).toString("base64url");
const decodeDisc = (d) => JSON.parse(Buffer.from(d, "base64url").toString());
function psql(sql) {
  return execFileSync("docker", [
    "exec",
    "nexusid-postgres",
    "sh",
    "-c",
    `psql -U "$POSTGRES_USER" -d nexusid_db -At -c "${sql.replace(/"/g, '\\"')}"`,
  ])
    .toString()
    .trim();
}
// Hand-rolled KB-JWT so we can forge bad ones (stale iat, wrong key, ...)
function signKb(payload, privPem) {
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "kb+jwt" }));
  const p = b64u(JSON.stringify(payload));
  const s = crypto
    .sign("sha256", Buffer.from(`${h}.${p}`), privPem)
    .toString("base64url");
  return `${h}.${p}.${s}`;
}
const sdHash = (pres) =>
  crypto
    .createHash("sha256")
    .update(`${pres.sd_jwt}~${pres.disclosures.join("~")}~`)
    .digest("base64url");

const run = Date.now();
const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

// ── Setup: holder account + device key ────────────────────────────────────
const email = `verifyflow+${run}@example.test`;
const reg = await call("POST", "/auth/register", {
  body: { name: "Verify Flow", email, password: "Passw0rd!x" },
});
const userJwt = reg.body?.data?.token;
const auth = { authorization: `Bearer ${userJwt}` };
const pk = await call("PUT", "/users/me/public-key", {
  body: { public_key: pub },
  headers: auth,
});
rec(
  "setup",
  "Register holder + device public key",
  reg.status === 201 && pk.status === 200,
  `register ${reg.status}, key ${pk.status}`,
);

// ── 1. Issue ───────────────────────────────────────────────────────────────
const t0 = new Date().toISOString();
const iss = await call("POST", "/credentials/hec/verify", {
  body: {
    degree_number: `DEG-${run}`,
    university: "Air University",
    student_name: "Verify Flow",
  },
  headers: auth,
});
const cred = iss.body?.data?.credential;
rec(
  1,
  "HEC issues SD-JWT credential via backend proxy",
  iss.status === 200 && !!cred?.sd_jwt,
  `HTTP ${iss.status}${cred ? `, ${cred.disclosures.length} disclosures` : ", " + JSON.stringify(iss.body)}`,
);
if (!cred) {
  console.log(JSON.stringify(results));
  process.exit(1);
}
const claims = Object.fromEntries(
  cred.disclosures.map((d) => {
    const [, k, v] = decodeDisc(d);
    return [k, v];
  }),
);
console.log("      claims in credential:", Object.keys(claims).join(", "));
const issuerId = JSON.parse(
  Buffer.from(cred.sd_jwt.split(".")[1], "base64url"),
).iss;
const issPub = await call(
  "GET",
  `/issuers/${encodeURIComponent(issuerId)}/public-key`,
);
const issPem = issPub.body?.data?.public_key ?? issPub.body?.data?.publicKey;
const sig = issPem
  ? await verifier.verifyIssuerSignature(cred.sd_jwt, issPem)
  : { valid: false, error: `registry ${issPub.status}` };
rec(
  1,
  "Issuer signature verifies against registry key",
  sig.valid,
  sig.error ?? `iss=${issuerId}`,
);
const wallet = await call("GET", "/credentials", { headers: auth });
const walletList = wallet.body?.data?.credentials ?? wallet.body?.data ?? [];
rec(
  1,
  "Credential recorded in wallet (metadata only)",
  Array.isArray(walletList) && walletList.length >= 1,
  `${walletList.length} row(s)`,
);

// ── Setup: verifier + pairing ─────────────────────────────────────────────
const vreg = await call("POST", "/verifiers/register", {
  body: {
    email: `sp+${run}@example.test`,
    password: "Passw0rd!x",
    displayName: "VerifyFlow SP",
    domain: `vf${run}.example`,
  },
});
const apiKey = vreg.body?.data?.apiKey;
const verifierId = vreg.body?.data?.verifier?.id ?? vreg.body?.data?.id;
rec(
  "setup",
  "Register service provider + API key",
  !!apiKey && !!verifierId,
  `HTTP ${vreg.status}`,
);
if (!apiKey || !verifierId) {
  console.log("Setup failed: " + JSON.stringify(vreg.body));
  process.exit(1);
}

const qr = await call("POST", "/qr-challenges", {
  body: { purpose: "PAIRING" },
});
const { challengeId, code, pairingToken } = qr.body?.data ?? {};
const signature = crypto
  .sign(
    "sha256",
    Buffer.from(`nexusid-qr:PAIRING:${challengeId}:${code}`),
    priv,
  )
  .toString("base64");
const redeem = await call("POST", "/qr-challenges/redeem", {
  body: { challengeId, code, signature },
  headers: auth,
});
rec(
  "setup",
  "Pair extension via QR challenge (device-key signature)",
  redeem.status === 200,
  `create ${qr.status}, redeem ${redeem.status}`,
);

const field =
  "degree_title" in claims ? "degree_title" : Object.keys(claims)[0];
const others = Object.keys(claims).filter((k) => k !== field);
// FR-041 / FR-043 AC3: sessions are only accepted for predicates the SP configured.
const reqs = await call("PUT", "/verifiers/requirements", {
  body: { predicates: [field] },
  headers: { authorization: `Bearer ${vreg.body?.data?.token}` },
});
rec(
  "setup",
  `SP configures predicate '${field}'`,
  reqs.status === 200,
  `HTTP ${reqs.status} ${reqs.body?.error ?? ""}`,
);
// API-030 takes one catalog predicate per session (BR-021).
async function newRequest(predicate = field) {
  const s = await call("POST", "/verification/sessions", {
    body: { predicate },
    headers: { "x-api-key": apiKey },
  });
  const { sessionId, nonce } = s.body?.data ?? {};
  const r = await call("POST", "/verification/request", {
    body: { sessionId, nonce, pageUrl: "http://localhost:5500/" },
    headers: { "x-pairing-token": pairingToken },
  });
  return { s, r, sessionId, nonce, pollSecret: r.body?.data?.pollSecret };
}
const submit = (id, proof) =>
  call("POST", "/verification/submit-proof", {
    body: { verification_requestId: id, proof },
    headers: auth,
  });

// ── 2. Request for a single claim ─────────────────────────────────────────
const main = await newRequest();
rec(
  2,
  `SP session for ONE claim ('${field}') + extension relay`,
  main.s.status === 201 && main.r.status === 200,
  `session ${main.s.status}, relay ${main.r.status}, predicate=${main.r.body?.data?.predicate ?? JSON.stringify(main.s.body?.error)}`,
);
const pend = await call("GET", "/verification/pending", { headers: auth });
const pendList = pend.body?.data?.requests ?? pend.body?.data ?? [];
rec(
  2,
  "Request routed to the paired holder (pending list)",
  Array.isArray(pendList) &&
    pendList.some((p) => (p.id ?? p.requestId) === main.sessionId),
  `HTTP ${pend.status}`,
);

// ── 3. Holder presentation ────────────────────────────────────────────────
const proof = await holder.generateProof({
  credential: cred,
  requestedFields: [field],
  verifierId,
  nonce: main.nonce,
  userPrivateKey: priv,
});
const discFields = proof.presentation.disclosures.map((d) => decodeDisc(d)[1]);
rec(
  3,
  "Presentation discloses exactly the requested claim",
  discFields.length === 1 && discFields[0] === field,
  `disclosed=${JSON.stringify(discFields)} of ${Object.keys(claims).length}`,
);

// ── 4. Verify (happy path + one negative per check) ───────────────────────
const ok = await submit(main.sessionId, proof);
rec(
  4,
  "Valid proof accepted",
  ok.status === 200 && ok.body?.data?.status === "verified",
  `HTTP ${ok.status} ${ok.body?.data?.status ?? ok.body?.error}`,
);
const replay = await submit(main.sessionId, proof);
rec(
  4,
  "Replay of same proof rejected",
  replay.status >= 400,
  `HTTP ${replay.status} ${replay.body?.error ?? ""}`,
);

async function negative(label, mutate, expectReject = true) {
  const r = await newRequest();
  const p = await mutate(r);
  const res = await submit(r.sessionId, p);
  // 422 = request-shape validation: the proof never reached the verifier, so
  // it says nothing about the check under test.
  const rejected = res.status >= 400 && res.status !== 422;
  rec(
    4,
    label,
    rejected === expectReject,
    `HTTP ${res.status} ${res.body?.error ?? res.body?.data?.status ?? ""}`,
  );
}
const fresh = (r, extra = {}) =>
  holder.generateProof({
    credential: cred,
    requestedFields: [field],
    verifierId,
    nonce: r.nonce,
    userPrivateKey: priv,
    ...extra,
  });

await negative("Signature: tampered issuer JWT payload rejected", async (r) => {
  const p = await fresh(r);
  const [h, pl, s] = p.presentation.sd_jwt.split(".");
  const obj = JSON.parse(Buffer.from(pl, "base64url"));
  obj.iss_tampered = true;
  p.presentation.sd_jwt = `${h}.${b64u(JSON.stringify(obj))}.${s}`;
  p.key_binding = signKb(
    {
      iat: Math.floor(Date.now() / 1000),
      aud: verifierId,
      nonce: r.nonce,
      sd_hash: sdHash(p.presentation),
    },
    priv,
  );
  return p;
});
await negative(
  "Signature: forged disclosure (value changed) rejected",
  async (r) => {
    const p = await fresh(r);
    const [salt, k] = decodeDisc(p.presentation.disclosures[0]);
    p.presentation.disclosures = [b64u(JSON.stringify([salt, k, "FORGED"]))];
    p.key_binding = signKb(
      {
        iat: Math.floor(Date.now() / 1000),
        aud: verifierId,
        nonce: r.nonce,
        sd_hash: sdHash(p.presentation),
      },
      priv,
    );
    return p;
  },
);
await negative(
  "Key binding: KB-JWT signed by a different key rejected",
  async (r) => {
    const other = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    return fresh(r, { userPrivateKey: other.privateKey });
  },
);
if (others.length === 0) {
  rec(
    4,
    "Key binding: disclosures swapped after signing (sd_hash) rejected",
    null,
    "credential has a single claim — no other disclosure to swap in",
  );
} else {
  await negative(
    "Key binding: disclosures swapped after signing (sd_hash) rejected",
    async (r) => {
      const p = await fresh(r);
      p.presentation.disclosures = [
        cred.disclosures.find((d) => decodeDisc(d)[1] === others[0]),
      ];
      return p;
    },
  );
}
await negative("Nonce: proof bound to a different nonce rejected", async (r) =>
  fresh(r, { nonce: "not-the-nonce" }),
);
await negative(
  "Audience: proof bound to another verifier rejected",
  async (r) => fresh(r, { verifierId: crypto.randomUUID() }),
);
await negative(
  "Expiry: KB-JWT issued 24h ago rejected (proof age limit)",
  async (r) => {
    const p = await fresh(r);
    p.key_binding = signKb(
      {
        iat: Math.floor(Date.now() / 1000) - 86400,
        aud: verifierId,
        nonce: r.nonce,
        sd_hash: sdHash(p.presentation),
      },
      priv,
    );
    return p;
  },
);
await negative(
  "Policy: proof with ZERO disclosures for a 1-claim request rejected",
  async (r) =>
    holder.generateProof({
      credential: cred,
      requestedFields: [],
      verifierId,
      nonce: r.nonce,
      userPrivateKey: priv,
    }),
);
if (others.length === 0) {
  rec(
    4,
    "Policy: proof disclosing an UNREQUESTED claim instead rejected",
    null,
    "credential has a single claim — nothing else to disclose",
  );
} else {
  await negative(
    "Policy: proof disclosing an UNREQUESTED claim instead rejected",
    async (r) =>
      holder.generateProof({
        credential: cred,
        requestedFields: [others[0]],
        verifierId,
        nonce: r.nonce,
        userPrivateKey: priv,
      }),
  );
}
// Expired session: force expiresAt into the past
{
  const r = await newRequest();
  psql(
    `UPDATE verification_requests SET expires_at = now() - interval '1 minute' WHERE id = '${r.sessionId}'`,
  );
  const res = await submit(r.sessionId, await fresh(r));
  rec(
    4,
    "Expiry: proof for an expired session rejected",
    res.status >= 400,
    `HTTP ${res.status} ${res.body?.error ?? ""}`,
  );
}
const credExp = JSON.parse(
  Buffer.from(cred.sd_jwt.split(".")[1], "base64url"),
).exp;
rec(
  4,
  "Credential carries an exp claim",
  typeof credExp === "number",
  credExp ? new Date(credExp * 1000).toISOString() : "no exp in issuer JWT",
);

// ── 5. Undisclosed claims not recoverable ────────────────────────────────
const presentationStr = `${proof.presentation.sd_jwt}~${proof.presentation.disclosures.join("~")}~${proof.key_binding}`;
const decodedParts = presentationStr
  .split(/[~.]/)
  .map((s) => {
    try {
      return Buffer.from(s, "base64url").toString();
    } catch {
      return "";
    }
  })
  .join(" ");
const leaked = others.filter((k) => {
  const v = String(claims[k]);
  return (
    v.length > 2 && (presentationStr.includes(v) || decodedParts.includes(v))
  );
});
rec(
  5,
  "Undisclosed claim values absent from presentation (raw + base64-decoded)",
  leaked.length === 0,
  leaked.length
    ? `LEAKED: ${leaked.join(", ")}`
    : `${others.length} undisclosed claims checked`,
);
const payload = JSON.parse(
  Buffer.from(proof.presentation.sd_jwt.split(".")[1], "base64url"),
);
const plainKeys = Object.keys(payload).filter((k) => others.includes(k));
rec(
  5,
  "Issuer JWT payload holds digests, not plaintext claims",
  plainKeys.length === 0 && Array.isArray(payload._sd),
  `_sd=${payload._sd?.length ?? 0} digests; plaintext overlap=${JSON.stringify(plainKeys)}`,
);
const outcome = await call(
  "GET",
  `/verification/sessions/${main.sessionId}/outcome`,
  { headers: { "x-api-key": apiKey } },
);
const outStr = JSON.stringify(outcome.body?.data ?? {});
const outLeak = others.filter(
  (k) => String(claims[k]).length > 2 && outStr.includes(String(claims[k])),
);
rec(
  5,
  "SP outcome (API-031) contains no undisclosed claims",
  outcome.status === 200 && outLeak.length === 0,
  `HTTP ${outcome.status}${outLeak.length ? ", LEAKED " + outLeak : ""}`,
);
rec(
  5,
  "SP outcome is predicate-only (no raw disclosed value, BR-015)",
  !outStr.includes(String(claims[field])),
  `outcome=${outStr.slice(0, 160)}`,
);
const dbVal = psql(
  `SELECT row_to_json(v)::text FROM verification_results v WHERE request_id = '${main.sessionId}'`,
);
// BR-015: only outcome, condition name, proof hash and issuer may be stored.
const dbLeak = Object.entries(claims)
  .filter(([, v]) => typeof v !== "boolean")
  .filter(([, v]) => dbVal.includes(String(v)))
  .map(([k]) => k);
rec(
  5,
  "Backend DB stores no claim values (BR-015)",
  dbVal !== "" && dbLeak.length === 0,
  `verification_results=${dbVal.slice(0, 200)}${dbLeak.length ? ", LEAKED " + dbLeak : ""}`,
);

// ── 6. Audit + blockchain unavailable ────────────────────────────────────
const events = psql(
  `SELECT string_agg(event_type, ',' ORDER BY created_at) FROM audit_logs WHERE request_id = '${main.sessionId}'`,
);
rec(
  6,
  "Audit records written for the verified session",
  /proof_verified/.test(events),
  events,
);
const neg = psql(
  `SELECT count(*) FROM audit_logs WHERE event_type = 'proof_verification_failed' AND created_at > '${t0}'`,
);
rec(
  6,
  "Failed proofs audited",
  Number(neg) >= 1,
  `${neg} proof_verification_failed rows this run`,
);
// Holder binding (cnf): the account's key changes, the credential is still
// bound to the old one. A KB-JWT signed with the new key must be refused —
// otherwise anyone holding a copy of a credential could present it.
{
  const other = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  await call("PUT", "/users/me/public-key", {
    body: { public_key: other.publicKey },
    headers: auth,
  });
  const r = await newRequest();
  const res = await submit(
    r.sessionId,
    await fresh(r, { userPrivateKey: other.privateKey }),
  );
  rec(
    4,
    "Holder binding: credential presented with a key it wasn't issued to rejected",
    res.status >= 400,
    `HTTP ${res.status} ${res.body?.error ?? res.body?.data?.status ?? ""}`,
  );
  await call("PUT", "/users/me/public-key", {
    body: { public_key: pub },
    headers: auth,
  });
}
const cnf = JSON.parse(Buffer.from(cred.sd_jwt.split(".")[1], "base64url")).cnf;
rec(
  1,
  "Credential carries cnf.jwk as an RSA JWK (RFC 7800)",
  cnf?.jwk?.kty === "RSA" && typeof cnf?.jwk?.n === "string",
  JSON.stringify(cnf).slice(0, 60),
);
for (const port of [4001, 4002, 4003, 4004]) {
  let k;
  try {
    k = (
      await (
        await fetch(`http://localhost:${port}/.well-known/jwks.json`)
      ).json()
    ).keys?.[0];
  } catch {}
  rec(
    1,
    `Issuer :${port} JWKS serves an n/e RSA JWK`,
    k?.kty === "RSA" && !!k?.n && !!k?.e && !k?.x5c,
    k ? `kid=${k.kid}` : "unreachable",
  );
}

const credId = walletList[0]?.id;
const rv = await call("POST", `/credentials/${credId}/revoke`, {
  body: { reason: "verify-flow test" },
  headers: auth,
});
const rs = await call("GET", `/credentials/${credId}/revocation`, {
  headers: auth,
});
rec(
  6,
  "Revoke succeeds with Fabric down (fail-silent chain write)",
  rv.status === 200,
  `HTTP ${rv.status} ${rv.body?.error ?? ""}`,
);
rec(
  6,
  "Revocation check answers with Fabric down (fail-open)",
  rs.status === 200,
  `HTTP ${rs.status} ${JSON.stringify(rs.body?.data ?? rs.body?.error)}`,
);
rec(
  6,
  "Revocation reason stored and returned",
  rs.body?.data?.reason === "verify-flow test",
  `reason=${JSON.stringify(rs.body?.data?.reason)}`,
);
await negative("Revoked credential refused at proof time (BR-006)", async (r) =>
  fresh(r),
);
rec(
  6,
  "Verification path itself independent of blockchain",
  null,
  "submitProof never calls blockchain.service — nothing to fail",
);

// ── 7. ML fraud check ─────────────────────────────────────────────────────
const fraudRows = psql(
  `SELECT count(*) FROM fraud_flags WHERE created_at > '${t0}'`,
);
rec(
  7,
  "ML fraud check ran during issuance",
  Number(fraudRows) > 0,
  `${fraudRows} fraud_flags rows this run; see ml.log for inbound calls`,
);
rec(
  7,
  "ML result did not block issuance",
  iss.status === 200 ? true : false,
  "issuance returned 200",
);

console.log("\nJSON:" + JSON.stringify({ sessionId: main.sessionId, results }));
