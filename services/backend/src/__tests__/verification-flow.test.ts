import { jest } from "@jest/globals";

const sendVerificationRequest = jest.fn<
  (args: unknown) => Promise<{
    success: boolean;
    message_id: string;
  }>
>();

const sendVerificationComplete = jest.fn<(args: unknown) => Promise<void>>();

const sendBatchNotifications = jest.fn<
  (args: unknown) => Promise<{
    success: number;
    failure: number;
  }>
>();

const notificationService = {
  sendVerificationRequest,
  sendVerificationComplete,
  sendBatchNotifications,
};

jest.unstable_mockModule("../services/notification.service.js", () => ({
  notificationService,

  NotificationService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    sendVerificationRequest,
    sendVerificationComplete,
    sendBatchNotifications,
  })),
}));
const { createApp } = await import("../index.js");
import request from "supertest";
import { PrismaClient } from "@prisma/client";

import {
  generateTestKeyPair,
  generateTestCredential,
  generateTestProof,
  generateNonce,
  TestKeyPair,
} from "./helpers.js";

import type { SDJWTCredential } from "@nexusid/types";
import { SignJWT, importPKCS8 } from "jose";
import { createHash, randomUUID } from "crypto";

/** Same hashing the backend applies to stored API keys (FR-034). */
const hashApiKey = (key: string) => createHash("sha256").update(key, "utf8").digest("hex");

// ─── FCM mock ────────────────────────────────────────────────────────────────

// ─── Test database ───────────────────────────────────────────────────────────

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL,
    },
  },
});

// ─── Shared state across tests ────────────────────────────────────────────────

let app: ReturnType<typeof createApp>;

// Issuer key pair — signs credentials (stands in for hec.gov.pk)
let issuerKeys: TestKeyPair;

// User (holder) key pair — signs key-binding JWTs
let userKeys: TestKeyPair;

// Seeded IDs
let testUserId: string;
let testVerifierId: string;
let testIssuerId: string;
let authToken: string; // JWT returned by /auth/login

// Live credential + proof
let testCredential: SDJWTCredential;
let verificationRequestId: string;
let testNonce: string;

let pairingSecret: string; // extension secret of the test user's device pairing

const TEST_API_KEY = "integration-test-api-key";
const OTHER_API_KEY = "integration-test-other-api-key";

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Generate key material once for the entire suite
  [issuerKeys, userKeys] = await Promise.all([
    generateTestKeyPair(),
    generateTestKeyPair(),
  ]);

  // Build the Express app (without starting a server)
  app = createApp();

  // Wipe test-relevant tables in dependency order
  await prisma.$transaction([
    prisma.usedNonce.deleteMany(),
    prisma.verificationResult.deleteMany(),
    prisma.verificationRequest.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.fraudFlag.deleteMany(),
    prisma.credential.deleteMany(),
    prisma.devicePairing.deleteMany(),
    prisma.user.deleteMany(),
    prisma.verifier.deleteMany(),
    prisma.issuerRegistry.deleteMany(),
  ]);

  // Seed: issuer registry
  const issuerRow = await prisma.issuerRegistry.create({
    data: {
      issuerId: "hec.gov.pk",
      name: "Higher Education Commission Pakistan",
      jwksUrl: "http://localhost:4002/.well-known/jwks.json",
      publicKey: issuerKeys.publicKey,
      active: true,
    },
  });
  testIssuerId = issuerRow.id;

  // Seed: verifier
  const verifierRow = await prisma.verifier.create({
    data: {
      domain: "test-company.nexusid.com",
      displayName: "NexusID Test Verifier",
      apiKey: hashApiKey(TEST_API_KEY),
      trusted: true,
    },
  });
  testVerifierId = verifierRow.id;

  // Generate a real credential with the issuer key
  testCredential = await generateTestCredential(issuerKeys.privateKey);
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Helper to get the FCM spy
function getFCMSpy() {
  return notificationService.sendVerificationRequest as jest.Mock;
}

// ─── Test 1: User Registration ────────────────────────────────────────────────

describe("Test 1 — User registration", () => {
  it("registers a new user and returns 201 with user_id", async () => {
    testUserId = randomUUID();
    const res = await request(app)
      .post("/api/v1/users/register")
      .send({
        user_id: testUserId,
        public_key: userKeys.publicKey,
        push_token: "test-fcm-token-abc123",
        device_info: { os: "android", version: "14", model: "Pixel 8" },
      })
      .expect("Content-Type", /json/)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user_id).toBe(testUserId);

    // Verify in DB
    const dbUser = await prisma.user.findFirst({ where: { id: testUserId } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.publicKey).toBe(userKeys.publicKey);
    expect(dbUser!.pushToken).toBe("test-fcm-token-abc123");
  });

  it("allows re-registration (upsert) and returns 201", async () => {
    const res = await request(app)
      .post("/api/v1/users/register")
      .send({
        user_id: testUserId,
        public_key: userKeys.publicKey,
        push_token: "test-fcm-token-abc123",
        device_info: { os: "android", version: "14", model: "Pixel 8" },
      })
      .expect(201);

    expect(res.body.success).toBe(true);

    // Still only one row
    const count = await prisma.user.count({ where: { id: testUserId } });
    expect(count).toBe(1);
  });

  it("rejects registration with missing publicKey — 400", async () => {
    await request(app)
      .post("/api/v1/users/register")
      .send({ user_id: "bad-user", pushToken: "token" })
      .expect(400);
  });

  // Obtain a JWT for subsequent authenticated requests
  it("logs in the test user and returns a JWT token", async () => {
    // The login endpoint verifies a signature over a challenge.
    // We sign the challenge with the user private key directly.
    const challenge = "nexusid-test-challenge-" + Date.now();
    const privKey = await importPKCS8(userKeys.privateKey, "RS256");

    // Build a raw RS256 signature over the challenge string
    const { createSign } = await import("crypto");
    const signer = createSign("SHA256");
    signer.update(challenge);
    const signature = signer.sign(userKeys.privateKey, "base64");

    const res = await request(app)
      .post("/api/v1/users/login")
      .send({ user_id: testUserId, signature, challenge })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe("string");
    authToken = res.body.data.token;
  });
});

// ─── Test 1b: Device pairing (SRS UC-002, FR-003) ────────────────────────────

describe("Test 1b — Device pairing", () => {
  let pairingId: string;
  let code: string;

  it("creates a pending pairing session with a QR payload", async () => {
    const res = await request(app).post("/api/v1/pairing/sessions").expect(201);

    expect(res.body.success).toBe(true);
    pairingId = res.body.data.pairingId;
    code = res.body.data.code;
    pairingSecret = res.body.data.secret;

    expect(JSON.parse(res.body.data.qrPayload)).toEqual({
      v: 1,
      type: "nexusid-pair",
      pairingId,
      code,
    });
    // Only hashes are persisted.
    const row = await prisma.devicePairing.findUnique({ where: { id: pairingId } });
    expect(row!.codeHash).not.toBe(code);
    expect(row!.secretHash).not.toBe(pairingSecret);
  });

  it("reports pending to the extension holding the secret", async () => {
    const res = await request(app)
      .get(`/api/v1/pairing/sessions/${pairingId}`)
      .set("x-pairing-secret", pairingSecret)
      .expect(200);
    expect(res.body.data.status).toBe("pending");
  });

  it("hides the session from a wrong secret — 404", async () => {
    await request(app)
      .get(`/api/v1/pairing/sessions/${pairingId}`)
      .set("x-pairing-secret", "wrong-secret")
      .expect(404);
  });

  it("refuses an unpaired browser's verification request — 409", async () => {
    const res = await request(app)
      .post("/api/v1/verification/request")
      .set("x-api-key", TEST_API_KEY)
      .set("x-pairing-secret", pairingSecret)
      .send({
        requestedFields: ["degree_title"],
        nonce: generateNonce(),
        pageUrl: "https://test-company.nexusid.com/apply",
      })
      .expect(409);
    expect(res.body.error).toMatch(/not paired/i);
  });

  it("requires a signed-in user to claim — 401", async () => {
    await request(app)
      .post("/api/v1/pairing/claim")
      .send({ pairingId, code })
      .expect(401);
  });

  it("rejects a wrong code — 400", async () => {
    await request(app)
      .post("/api/v1/pairing/claim")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ pairingId, code: "not-the-code" })
      .expect(400);
  });

  it("pairs the device when the mobile app claims the code", async () => {
    const res = await request(app)
      .post("/api/v1/pairing/claim")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ pairingId, code })
      .expect(200);
    expect(res.body.data.status).toBe("paired");

    const poll = await request(app)
      .get(`/api/v1/pairing/sessions/${pairingId}`)
      .set("x-pairing-secret", pairingSecret)
      .expect(200);
    expect(poll.body.data.status).toBe("paired");
  });

  it("refuses to reuse a claimed code — 409", async () => {
    await request(app)
      .post("/api/v1/pairing/claim")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ pairingId, code })
      .expect(409);
  });

  it("refuses an expired code — 410 (BR-002)", async () => {
    const created = await request(app).post("/api/v1/pairing/sessions").expect(201);
    await prisma.devicePairing.update({
      where: { id: created.body.data.pairingId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await request(app)
      .post("/api/v1/pairing/claim")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ pairingId: created.body.data.pairingId, code: created.body.data.code })
      .expect(410);

    const poll = await request(app)
      .get(`/api/v1/pairing/sessions/${created.body.data.pairingId}`)
      .set("x-pairing-secret", created.body.data.secret)
      .expect(200);
    expect(poll.body.data.status).toBe("expired");
  });

  it("lists the paired browser for the user", async () => {
    const res = await request(app)
      .get("/api/v1/pairing/devices")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ pairingId, status: "paired" }),
    ]);
  });
});

// ─── Test 2: Verification Request Creation ────────────────────────────────────

describe("Test 2 — Verification request creation", () => {
  beforeAll(() => {
    // Reset FCM spy call count before this block
    getFCMSpy().mockClear();
  });

  it("creates a pending verification request and returns requestId", async () => {
    testNonce = generateNonce();

    const res = await request(app)
      .post("/api/v1/verification/request")
      .set("x-api-key", TEST_API_KEY)
      .set("x-pairing-secret", pairingSecret)
      .send({
        requestedFields: ["degree_title", "university"],
        nonce: testNonce,
        pageUrl: "https://test-company.nexusid.com/apply",
        callbackUrl: "https://test-company.nexusid.com/verify/callback",
      })
      .expect("Content-Type", /json/)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.requestId).toBe("string");
    expect(res.body.data.status).toBe("queued");

    verificationRequestId = res.body.data.requestId;
  });

  it("stores the request in the DB with status = pending", async () => {
    const dbReq = await prisma.verificationRequest.findUnique({
      where: { id: verificationRequestId },
    });

    expect(dbReq).not.toBeNull();
    expect(dbReq!.status).toBe("pending");
    expect(dbReq!.nonce).toBe(testNonce);
    expect(dbReq!.userId).toBe(testUserId);
    expect(dbReq!.requestedFields).toContain("degree_title");
    expect(dbReq!.requestedFields).toContain("university");
    expect(new Date(dbReq!.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("called the FCM notification service at least once", () => {
    expect(getFCMSpy()).toHaveBeenCalledTimes(1);

    const call = getFCMSpy().mock.calls[0][0] as {
      push_token: string;
      verification_request_id: string;
      verifier_id: string;
      verifier_name: string;
      requested_fields: string[];
      nonce: string;
      expires_at: string;
    };

    expect(call.verification_request_id).toBe(verificationRequestId);
    expect(call.nonce).toBe(testNonce);
    expect(call.push_token).toBe("test-fcm-token-abc123");
  });

  it("rejects duplicate nonce — 400", async () => {
    await request(app)
      .post("/api/v1/verification/request")
      .set("x-api-key", TEST_API_KEY)
      .set("x-pairing-secret", pairingSecret)
      .send({
        requestedFields: ["degree_title"],
        nonce: testNonce, // same nonce
        pageUrl: "https://test-company.nexusid.com/apply",
      })
      .expect(400);
  });
});

// ─── Test 3: Proof Submission ─────────────────────────────────────────────────

describe("Test 3 — Valid proof submission", () => {
  it("accepts a valid SD-JWT proof and marks the request as completed", async () => {
    // Generate a REAL proof using holder pipeline + user private key
    const proof = await generateTestProof(testCredential, userKeys.privateKey, {
      requestedFields: ["degree_title", "university"],
      verifierId: testVerifierId,
      nonce: testNonce,
    });

    const res = await request(app)
      .post("/api/v1/verification/submit-proof")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        verification_requestId: verificationRequestId,
        proof,
      })
      .expect("Content-Type", /json/)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("verified");
    expect(res.body.data.verifiedFields).toMatchObject({
      degree_title: "BS Computer Science",
      university: "Air University Islamabad",
    });

    // Confirmed in DB
    const dbReq = await prisma.verificationRequest.findUnique({
      where: { id: verificationRequestId },
    });
    expect(dbReq!.status).toBe("completed");

    const dbResult = await prisma.verificationResult.findUnique({
      where: { requestId: verificationRequestId },
    });
    expect(dbResult).not.toBeNull();
    expect(dbResult!.issuer).toBe("hec.gov.pk");
    expect(dbResult!.proofHash).toBeTruthy();
  });
});

// ─── Test 4: Extension Polling ────────────────────────────────────────────────

describe("Test 4 — Extension polling for completed result", () => {
  it("returns completed status with verifiedFields when polled", async () => {
    const res = await request(app)
      .get(`/api/v1/verification/request/${verificationRequestId}`)
      .set("x-api-key", TEST_API_KEY)
      .expect("Content-Type", /json/)
      .expect(200);

    expect(res.body.data.status).toBe("completed");
    expect(res.body.data.verifiedFields).toMatchObject({
      degree_title: "BS Computer Science",
      university: "Air University Islamabad",
    });
    expect(res.body.data.callbackUrl).toBe(
      "https://test-company.nexusid.com/verify/callback",
    );
  });

  it("returns 404 for a non-existent request id", async () => {
    await request(app)
      .get("/api/v1/verification/request/00000000-0000-0000-0000-000000000000")
      .set("x-api-key", TEST_API_KEY)
      .expect(404);
  });
});

// ─── Test 5: Replay Attack Prevention ─────────────────────────────────────────

describe("Test 5 — Replay attack rejected", () => {
  let replayRequestId: string;
  let replayNonce: string;
  let replayProof: Awaited<ReturnType<typeof generateTestProof>>;

  beforeAll(async () => {
    // Create a fresh request for the replay scenario
    replayNonce = generateNonce();

    const createRes = await request(app)
      .post("/api/v1/verification/request")
      .set("x-api-key", TEST_API_KEY)
      .set("x-pairing-secret", pairingSecret)
      .send({
        requestedFields: ["degree_title"],
        nonce: replayNonce,
        pageUrl: "https://test-company.nexusid.com/replay-test",
      })
      .expect(200);

    replayRequestId = createRes.body.data.requestId;

    // Build the proof once
    replayProof = await generateTestProof(testCredential, userKeys.privateKey, {
      requestedFields: ["degree_title"],
      verifierId: testVerifierId,
      nonce: replayNonce,
    });

    // First submission — must succeed
    await request(app)
      .post("/api/v1/verification/submit-proof")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ verification_requestId: replayRequestId, proof: replayProof })
      .expect(200);
  });

  it("rejects a replayed proof (same nonce) with 400", async () => {
    const res = await request(app)
      .post("/api/v1/verification/submit-proof")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ verification_requestId: replayRequestId, proof: replayProof })
      .expect(400);

    expect(res.body.success).toBe(false);
    // Should mention nonce reuse or request already completed
    const errMsg: string = (res.body.error ?? "").toLowerCase();
    const mentionsReplay =
      errMsg.includes("nonce") ||
      errMsg.includes("already") ||
      errMsg.includes("completed") ||
      errMsg.includes("replay");
    expect(mentionsReplay).toBe(true);
  });

  it("confirms nonce appears in used_nonces table", async () => {
    const row = await prisma.usedNonce.findUnique({
      where: { nonce: replayNonce },
    });
    expect(row).not.toBeNull();
  });
});

// ─── Test 6: Tampered Proof Rejected ─────────────────────────────────────────

describe("Test 6 — Tampered proof rejected", () => {
  let tamperedRequestId: string;
  let tamperedNonce: string;

  beforeAll(async () => {
    tamperedNonce = generateNonce();

    const createRes = await request(app)
      .post("/api/v1/verification/request")
      .set("x-api-key", TEST_API_KEY)
      .set("x-pairing-secret", pairingSecret)
      .send({
        requestedFields: ["degree_title", "university"],
        nonce: tamperedNonce,
        pageUrl: "https://test-company.nexusid.com/tamper-test",
      })
      .expect(200);

    tamperedRequestId = createRes.body.data.requestId;
  });

  it("rejects a proof with a corrupted sd_jwt (signature verification fails)", async () => {
    const validProof = await generateTestProof(
      testCredential,
      userKeys.privateKey,
      {
        requestedFields: ["degree_title", "university"],
        verifierId: testVerifierId,
        nonce: tamperedNonce,
      },
    );

    // Corrupt the sd_jwt: flip a few characters in the signature section
    const sdJwtParts = validProof.presentation.sd_jwt.split(".");
    const tamperedSig = sdJwtParts[2]
      .split("")
      .map((c, i) => (i < 5 ? String.fromCharCode(c.charCodeAt(0) ^ 0x01) : c))
      .join("");
    const tamperedSdJwt = `${sdJwtParts[0]}.${sdJwtParts[1]}.${tamperedSig}`;

    const tamperedProof = {
      ...validProof,
      presentation: {
        ...validProof.presentation,
        sd_jwt: tamperedSdJwt,
      },
    };

    const res = await request(app)
      .post("/api/v1/verification/submit-proof")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ verification_requestId: tamperedRequestId, proof: tamperedProof })
      .expect(400);

    expect(res.body.success).toBe(false);
    const errMsg: string = (res.body.error ?? "").toLowerCase();
    const mentionsSig =
      errMsg.includes("signature") ||
      errMsg.includes("invalid") ||
      errMsg.includes("verification failed") ||
      errMsg.includes("tamper");
    expect(mentionsSig).toBe(true);
  });

  it("rejects a proof with a disclosure that does not match _sd hash", async () => {
    const validProof = await generateTestProof(
      testCredential,
      userKeys.privateKey,
      {
        requestedFields: ["degree_title"],
        verifierId: testVerifierId,
        nonce: tamperedNonce,
      },
    );

    // Replace one disclosure with a crafted but invalid one
    const fakeDisclosure = Buffer.from(
      JSON.stringify([
        "fake-salt-000000000000",
        "degree_title",
        "FORGED DEGREE",
      ]),
    ).toString("base64url");

    const tamperedProof = {
      ...validProof,
      presentation: {
        ...validProof.presentation,
        disclosures: [fakeDisclosure],
      },
    };

    await request(app)
      .post("/api/v1/verification/submit-proof")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ verification_requestId: tamperedRequestId, proof: tamperedProof })
      .expect(400);
  });

  it("rejects a proof where the key-binding JWT is signed by a different key", async () => {
    // Generate a second (attacker) key pair
    const attackerKeys = await generateTestKeyPair();

    const validProof = await generateTestProof(
      testCredential,
      userKeys.privateKey,
      {
        requestedFields: ["degree_title", "university"],
        verifierId: testVerifierId,
        nonce: tamperedNonce,
      },
    );

    // Re-sign the key-binding payload with attacker's private key
    const privKey = await importPKCS8(attackerKeys.privateKey, "RS256");

    // Recompute sd_hash from the (valid) presentation
    const presentationString =
      validProof.presentation.sd_jwt +
      "~" +
      validProof.presentation.disclosures.join("~") +
      "~";
    const sd_hash = createHash("sha256")
      .update(presentationString)
      .digest("base64url");

    const attackerKbJwt = await new SignJWT({
      iat: Math.floor(Date.now() / 1000),
      aud: "test-company.nexusid.com",
      nonce: tamperedNonce,
      sd_hash,
    })
      .setProtectedHeader({ alg: "RS256", typ: "kb+jwt" })
      .sign(privKey);

    const spoofedProof = {
      ...validProof,
      key_binding: attackerKbJwt,
    };

    await request(app)
      .post("/api/v1/verification/submit-proof")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ verification_requestId: tamperedRequestId, proof: spoofedProof })
      .expect(400);
  });
});

// ─── Test 7: Expired Request Rejected ────────────────────────────────────────

describe("Test 7 — Expired request rejected", () => {
  let expiredRequestId: string;
  let expiredNonce: string;

  beforeAll(async () => {
    expiredNonce = generateNonce();

    // Create request directly in DB with expiresAt in the past
    const row = await prisma.verificationRequest.create({
      data: {
        verifierId: testVerifierId,
        requestedFields: ["degree_title"],
        nonce: expiredNonce,
        pageUrl: "https://test-company.nexusid.com/expired-test",
        status: "pending",
        // 10 minutes in the past
        expiresAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });

    expiredRequestId = row.id;
  });

  it("returns expired status when polling an expired request", async () => {
    const res = await request(app)
      .get(`/api/v1/verification/request/${expiredRequestId}`)
      .set("x-api-key", TEST_API_KEY)
      .expect(200);

    expect(res.body.data.status).toBe("expired");
  });

  it("rejects proof submission against an expired request with 400", async () => {
    const proof = await generateTestProof(testCredential, userKeys.privateKey, {
      requestedFields: ["degree_title"],
      verifierId: testVerifierId,
      nonce: expiredNonce,
    });

    const res = await request(app)
      .post("/api/v1/verification/submit-proof")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ verification_requestId: expiredRequestId, proof })
      .expect(400);

    expect(res.body.success).toBe(false);
    const errMsg: string = (res.body.error ?? "").toLowerCase();
    expect(errMsg.includes("expired") || errMsg.includes("expire")).toBe(true);
  });

  it("updates the request status to expired in the DB", async () => {
    const dbReq = await prisma.verificationRequest.findUnique({
      where: { id: expiredRequestId },
    });
    expect(dbReq!.status).toBe("expired");
  });
});

// ─── Test 8: Rejection Flow ───────────────────────────────────────────────────

describe("Test 8 — User rejects a verification request", () => {
  let rejectableRequestId: string;

  beforeAll(async () => {
    const nonce = generateNonce();

    const res = await request(app)
      .post("/api/v1/verification/request")
      .set("x-api-key", TEST_API_KEY)
      .set("x-pairing-secret", pairingSecret)
      .send({
        requestedFields: ["degree_title"],
        nonce,
        pageUrl: "https://test-company.nexusid.com/reject-test",
      })
      .expect(200);

    rejectableRequestId = res.body.data.requestId;
  });

  it("marks request as rejected when user rejects", async () => {
    const res = await request(app)
      .post(`/api/v1/verification/reject/${rejectableRequestId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.data.status).toBe("rejected");
  });

  it("polling reflects rejected status", async () => {
    const res = await request(app)
      .get(`/api/v1/verification/request/${rejectableRequestId}`)
      .set("x-api-key", TEST_API_KEY)
      .expect(200);

    expect(res.body.data.status).toBe("rejected");
    expect(res.body.data.rejected_at).toBeTruthy();
  });

  it("refuses proof submission on a rejected request", async () => {
    const nonce = await prisma.verificationRequest
      .findUnique({ where: { id: rejectableRequestId } })
      .then((r: { nonce: string } | null) => r!.nonce);

    const proof = await generateTestProof(testCredential, userKeys.privateKey, {
      requestedFields: ["degree_title"],
      verifierId: testVerifierId,
      nonce,
    });

    await request(app)
      .post("/api/v1/verification/submit-proof")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ verification_requestId: rejectableRequestId, proof })
      .expect(400);
  });
});

// ─── Test 9: Authentication guard ────────────────────────────────────────────

describe("Test 9 — Auth middleware", () => {
  it("returns 401 when no token provided to a protected route", async () => {
    await request(app)
      .post("/api/v1/verification/submit-proof")
      .send({ verification_requestId: "any", proof: {} })
      .expect(401);
  });

  it("returns 401 when an invalid token is provided", async () => {
    await request(app)
      .post("/api/v1/verification/submit-proof")
      .set("Authorization", "Bearer this.is.not.a.valid.jwt")
      .send({ verification_requestId: "any", proof: {} })
      .expect(401);
  });
});

// ─── Test 10: Verification History ───────────────────────────────────────────

describe("Test 10 — Verification history", () => {
  it("returns the user verification history", async () => {
    const res = await request(app)
      .get("/api/v1/verification/history")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // At minimum the completed test from Test 3 should appear
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const completed = res.body.data.find(
      (h: { requestId: string }) => h.requestId === verificationRequestId,
    );
    expect(completed).toBeDefined();
    expect(completed.status).toBe("completed");
    expect(completed.verifierName).toBe("NexusID Test Verifier");
    expect(completed.requestedFields).toEqual(["degree_title", "university"]);
    expect(typeof completed.decidedAt).toBe("string");
  });

  it("returns 401 without auth token", async () => {
    await request(app).get("/api/v1/verification/history").expect(401);
  });
});

// ─── Test 11: Service Provider API key (SRS FR-034) ─────────────────────────

describe('Test 11 — Service Provider API key', () => {
  it('rejects request creation without an API key — 401', async () => {
    await request(app)
      .post('/api/v1/verification/request')
      .send({
        requestedFields: ['degree_title'],
        nonce:           generateNonce(),
        pageUrl:         'https://test-company.nexusid.com/apply',
      })
      .expect(401);
  });

  it('rejects request creation with an unknown API key — 401', async () => {
    await request(app)
      .post('/api/v1/verification/request')
      .set('x-api-key', 'not-a-real-key')
      .send({
        requestedFields: ['degree_title'],
        nonce:           generateNonce(),
        pageUrl:         'https://test-company.nexusid.com/apply',
      })
      .expect(401);
  });

  it('records the verifier from the API key, not the request body', async () => {
    const res = await request(app)
      .post('/api/v1/verification/request')
      .set('x-api-key', TEST_API_KEY)
      .set("x-pairing-secret", pairingSecret)
      .send({
        verifierId:      '00000000-0000-0000-0000-000000000000',
        requestedFields: ['degree_title'],
        nonce:           generateNonce(),
        pageUrl:         'https://test-company.nexusid.com/apply',
      })
      .expect(200);

    const dbReq = await prisma.verificationRequest.findUnique({
      where: { id: res.body.data.requestId },
    });
    expect(dbReq!.verifierId).toBe(testVerifierId);
  });

  it('hides a request from a different verifier — 404', async () => {
    await prisma.verifier.create({
      data: {
        domain:      'other-company.nexusid.com',
        displayName: 'Other Verifier',
        apiKey:      hashApiKey(OTHER_API_KEY),
        trusted:     true,
      },
    });

    await request(app)
      .get(`/api/v1/verification/request/${verificationRequestId}`)
      .set('x-api-key', OTHER_API_KEY)
      .expect(404);
  });

  it('rejects polling without an API key — 401', async () => {
    await request(app)
      .get(`/api/v1/verification/request/${verificationRequestId}`)
      .expect(401);
  });
});

// ─── Test 12: Pairing-based routing and revocation ──────────────────────────

describe("Test 12 — Requests belong to the paired user", () => {
  let otherToken: string;
  let requestId: string;

  beforeAll(async () => {
    // A second registered user who is NOT paired with this browser.
    const otherKeys = await generateTestKeyPair();
    const otherId = randomUUID();
    await request(app)
      .post("/api/v1/users/register")
      .send({
        user_id: otherId,
        public_key: otherKeys.publicKey,
        push_token: "other-user-fcm-token",
      })
      .expect(201);

    const { createSign } = await import("crypto");
    const challenge = "nexusid-test-challenge-" + Date.now();
    const signer = createSign("SHA256");
    signer.update(challenge);
    const signature = signer.sign(otherKeys.privateKey, "base64");
    const login = await request(app)
      .post("/api/v1/users/login")
      .send({ user_id: otherId, signature, challenge })
      .expect(200);
    otherToken = login.body.data.token;

    const created = await request(app)
      .post("/api/v1/verification/request")
      .set("x-api-key", TEST_API_KEY)
      .set("x-pairing-secret", pairingSecret)
      .send({
        requestedFields: ["degree_title"],
        nonce: generateNonce(),
        pageUrl: "https://test-company.nexusid.com/apply",
      })
      .expect(200);
    requestId = created.body.data.requestId;
  });

  it("lists the request as pending for the paired user only", async () => {
    const mine = await request(app)
      .get("/api/v1/verification/pending")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    const entry = mine.body.data.find(
      (r: { requestId: string }) => r.requestId === requestId,
    );
    expect(entry).toMatchObject({
      verifierId: testVerifierId,
      verifierName: "NexusID Test Verifier",
      requestedFields: ["degree_title"],
    });
    expect(typeof entry.nonce).toBe("string");

    const theirs = await request(app)
      .get("/api/v1/verification/pending")
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(200);
    expect(theirs.body.data).toEqual([]);
  });

  it("pushes only to the paired user's device", () => {
    const spy = getFCMSpy();
    const last = spy.mock.calls.at(-1)![0] as {
      push_token: string;
      verification_request_id: string;
    };
    expect(last.verification_request_id).toBe(requestId);
    expect(last.push_token).toBe("test-fcm-token-abc123");
    const pushedTokens = spy.mock.calls
      .map((c) => (c[0] as { verification_request_id: string; push_token: string }))
      .filter((c) => c.verification_request_id === requestId)
      .map((c) => c.push_token);
    expect(pushedTokens).toEqual(["test-fcm-token-abc123"]);
  });

  it("hides the request from a different user — 404 on reject", async () => {
    await request(app)
      .post(`/api/v1/verification/reject/${requestId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404);

    const dbReq = await prisma.verificationRequest.findUnique({ where: { id: requestId } });
    expect(dbReq!.status).toBe("pending");
  });

  it("refuses a valid proof from a revoked credential (BR-006)", async () => {
    const jti = JSON.parse(
      Buffer.from(testCredential.sd_jwt.split("~")[0].split(".")[1], "base64url").toString("utf8"),
    ).jti as string;

    await prisma.credential.create({
      data: {
        userId: testUserId,
        issuerCredentialId: testCredential.id,
        credentialJti: jti,
        issuerDid: "hec.gov.pk",
        issuerName: "HEC",
        credentialType: "degree",
        status: "revoked",
        metadata: {},
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: new Date(),
      },
    });

    const dbReq = await prisma.verificationRequest.findUnique({ where: { id: requestId } });
    const proof = await generateTestProof(testCredential, userKeys.privateKey, {
      requestedFields: ["degree_title"],
      verifierId: testVerifierId,
      nonce: dbReq!.nonce,
    });

    const res = await request(app)
      .post("/api/v1/verification/submit-proof")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ verification_requestId: requestId, proof })
      .expect(400);
    expect(res.body.error).toMatch(/revoked/i);

    const after = await prisma.verificationRequest.findUnique({ where: { id: requestId } });
    expect(after!.status).toBe("pending"); // nothing was disclosed

    await prisma.credential.deleteMany({ where: { credentialJti: jti } });
  });

  it("stops routing after the user revokes the pairing", async () => {
    const devices = await request(app)
      .get("/api/v1/pairing/devices")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    const pairingId = devices.body.data[0].pairingId as string;

    // Another user cannot revoke it.
    await request(app)
      .delete(`/api/v1/pairing/devices/${pairingId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404);

    await request(app)
      .delete(`/api/v1/pairing/devices/${pairingId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    await request(app)
      .post("/api/v1/verification/request")
      .set("x-api-key", TEST_API_KEY)
      .set("x-pairing-secret", pairingSecret)
      .send({
        requestedFields: ["degree_title"],
        nonce: generateNonce(),
        pageUrl: "https://test-company.nexusid.com/apply",
      })
      .expect(409);
  });
});

// ─── Test 13: Service Provider accounts (SRS FR-033, FR-034, BR-008/009) ────

describe("Test 13 — Service Provider accounts", () => {
  const email = "provider@acme-hiring.test";
  const password = "ProviderPass#2026";
  let providerToken: string;
  let firstKey: string;

  it("registers a provider and returns its first API key once", async () => {
    const res = await request(app)
      .post("/api/v1/verifiers/register")
      .send({ email, password, displayName: "Acme Hiring", domain: "acme-hiring.test" })
      .expect(201);

    firstKey = res.body.data.apiKey;
    providerToken = res.body.data.token;
    expect(firstKey).toMatch(/^nxk_/);
    expect(res.body.data.verifier).toMatchObject({ displayName: "Acme Hiring", domain: "acme-hiring.test" });

    // Only the hash is stored.
    const row = await prisma.verifier.findUnique({ where: { email } });
    expect(row!.apiKey).toBe(hashApiKey(firstKey));
    expect(row!.passwordHash).not.toBe(password);
  });

  it("refuses a duplicate email — 409 (BR-008)", async () => {
    await request(app)
      .post("/api/v1/verifiers/register")
      .send({ email, password, displayName: "Other", domain: "other-co.test" })
      .expect(409);
  });

  it("logs in with email + password", async () => {
    await request(app).post("/api/v1/verifiers/login").send({ email, password: "wrong-password" }).expect(401);
    const res = await request(app).post("/api/v1/verifiers/login").send({ email, password }).expect(200);
    providerToken = res.body.data.token;
  });

  it("keeps provider and End User tokens apart", async () => {
    await request(app)
      .get("/api/v1/verification/pending")
      .set("Authorization", `Bearer ${providerToken}`)
      .expect(401);
    await request(app)
      .get("/api/v1/verifiers/me")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(401);
  });

  it("returns the profile without the key", async () => {
    const res = await request(app)
      .get("/api/v1/verifiers/me")
      .set("Authorization", `Bearer ${providerToken}`)
      .expect(200);
    expect(res.body.data.apiKeyPrefix).toBe(firstKey.slice(0, 8));
    expect(JSON.stringify(res.body.data)).not.toContain(firstKey);
  });

  it("rotating the key invalidates the previous one immediately (BR-009)", async () => {
    await request(app).get("/api/v1/analytics/recent").set("x-api-key", firstKey).expect(200);

    const res = await request(app)
      .post("/api/v1/verifiers/me/api-key")
      .set("Authorization", `Bearer ${providerToken}`)
      .expect(200);
    const secondKey = res.body.data.apiKey as string;
    expect(secondKey).not.toBe(firstKey);

    await request(app).get("/api/v1/analytics/recent").set("x-api-key", firstKey).expect(401);
    await request(app).get("/api/v1/analytics/recent").set("x-api-key", secondKey).expect(200);
  });

  it("lists only its own verification requests", async () => {
    const res = await request(app)
      .get("/api/v1/verifiers/me/requests")
      .set("Authorization", `Bearer ${providerToken}`)
      .expect(200);
    expect(res.body.data).toEqual([]); // Acme has made no requests; the test verifier's are hidden
  });
});
