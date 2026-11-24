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
import { createHash, createSign, randomUUID } from "crypto";

/** Same hashing the backend applies to stored API keys (FR-034). */
const hashApiKey = (key: string) =>
  createHash("sha256").update(key, "utf8").digest("hex");

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

let pairingToken: string; // extension pairing token of the test user (SRS IF-005)
let verificationPollSecret: string; // extension poll secret for verificationRequestId (API-033)

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
      issuerId: "nadra.gov.pk",
      name: "NADRA Pakistan",
      jwksUrl: "http://localhost:4001/.well-known/jwks.json",
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
      requiredPredicates: [
        "AGE_OVER_18",
        "AGE_OVER_21",
        "NATIONALITY_PAKISTANI",
      ],
    },
  });
  testVerifierId = verifierRow.id;

  // Generate a real credential with the issuer key
  testCredential = await generateTestCredential(
    issuerKeys.privateKey,
    userKeys.publicKey,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Helper to get the FCM spy
function getFCMSpy() {
  return notificationService.sendVerificationRequest as jest.Mock;
}

const DEFAULT_PAGE_URL = "https://test-company.nexusid.com/apply";

/** API-030: the Service Provider's server opens a session (backend makes the nonce). */
async function openSession(
  predicate: string,
  extra: { callbackUrl?: string } = {},
): Promise<{ sessionId: string; nonce: string; expiresAt: string }> {
  const res = await request(app)
    .post("/api/v1/verification/sessions")
    .set("x-api-key", TEST_API_KEY)
    .send({ predicate, ...extra })
    .expect(201);
  return res.body.data;
}

/** API-032: the paired extension relays a session it found on a page. */
function relay(sessionId: string, nonce: string, pageUrl = DEFAULT_PAGE_URL) {
  return request(app)
    .post("/api/v1/verification/request")
    .set("x-pairing-token", pairingToken)
    .send({ sessionId, nonce, pageUrl });
}

/** API-030 then API-032: a request routed to the paired test user. */
async function openRelayedRequest(
  predicate: string,
  pageUrl = DEFAULT_PAGE_URL,
): Promise<{ requestId: string; nonce: string; pollSecret: string }> {
  const session = await openSession(predicate);
  const res = await relay(session.sessionId, session.nonce, pageUrl).expect(
    200,
  );
  return {
    requestId: res.body.data.requestId,
    nonce: session.nonce,
    pollSecret: res.body.data.pollSecret,
  };
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

// ─── Test 1b: Device pairing via QR challenge (SRS FR-003, FR-031, API-023–027) ─

/**
 * What the device signs to redeem a challenge (ALG-007). Written out here on
 * purpose: it is the contract the mobile app and web portal implement too.
 */
function signQrChallenge(
  challengeId: string,
  code: string,
  privateKeyPem: string,
): string {
  const signer = createSign("SHA256");
  signer.update(`nexusid-qr:PAIRING:${challengeId}:${code}`, "utf8");
  return signer.sign(privateKeyPem, "base64");
}

describe("Test 1b — Device pairing", () => {
  let challengeId: string;
  let code: string;

  it("creates a PAIRING QR challenge with a web-portal QR payload — API-023", async () => {
    const res = await request(app)
      .post("/api/v1/qr-challenges")
      .send({ purpose: "PAIRING" })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.purpose).toBe("PAIRING");
    challengeId = res.body.data.challengeId;
    code = res.body.data.code;
    pairingToken = res.body.data.pairingToken;

    // QR validity window is 120 s (BR-022).
    const ttlMs = new Date(res.body.data.expiresAt).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(110_000);
    expect(ttlMs).toBeLessThanOrEqual(120_000);

    // QR is a web-portal link carrying the challenge in its fragment.
    const qr = new URL(res.body.data.qrPayload);
    expect(qr.pathname).toBe("/pair");
    expect(qr.search).toBe("");
    const fragment = new URLSearchParams(qr.hash.slice(1));
    expect(fragment.get("p")).toBe(challengeId);
    expect(fragment.get("c")).toBe(code);

    // Only hashes are persisted.
    const row = await prisma.devicePairing.findUnique({
      where: { id: challengeId },
    });
    expect(row!.codeHash).not.toBe(code);
    expect(row!.secretHash).not.toBe(pairingToken);
  });

  it("rejects an unknown purpose — 400", async () => {
    await request(app)
      .post("/api/v1/qr-challenges")
      .send({ purpose: "SOMETHING_ELSE" })
      .expect(400);
  });

  it("reports PENDING to the extension holding the pairing token — API-024", async () => {
    const res = await request(app)
      .get(`/api/v1/qr-challenges/${challengeId}`)
      .set("x-pairing-token", pairingToken)
      .expect(200);
    expect(res.body.data.state).toBe("PENDING");
  });

  it("hides the challenge from a wrong pairing token — 404", async () => {
    await request(app)
      .get(`/api/v1/qr-challenges/${challengeId}`)
      .set("x-pairing-token", "wrong-token")
      .expect(404);
  });

  it("refuses an unpaired browser's relay — 409", async () => {
    const session = await openSession("AGE_OVER_18");
    const res = await relay(session.sessionId, session.nonce).expect(409);
    expect(res.body.error).toMatch(/not paired/i);
  });

  it("requires a signed-in device to redeem — 401", async () => {
    await request(app)
      .post("/api/v1/qr-challenges/redeem")
      .send({
        challengeId,
        code,
        signature: signQrChallenge(challengeId, code, userKeys.privateKey),
      })
      .expect(401);
  });

  it("requires a device signature — 400", async () => {
    await request(app)
      .post("/api/v1/qr-challenges/redeem")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ challengeId, code })
      .expect(400);
  });

  it("rejects a wrong code — 400 (ALG-006)", async () => {
    await request(app)
      .post("/api/v1/qr-challenges/redeem")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        challengeId,
        code: "not-the-code",
        signature: signQrChallenge(
          challengeId,
          "not-the-code",
          userKeys.privateKey,
        ),
      })
      .expect(400);
  });

  it("rejects a signature from a key that is not the account's device key — 401 (ALG-007)", async () => {
    const res = await request(app)
      .post("/api/v1/qr-challenges/redeem")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        challengeId,
        code,
        signature: signQrChallenge(challengeId, code, issuerKeys.privateKey),
      })
      .expect(401);
    expect(res.body.error).toMatch(/signature/i);

    // The failed attempt did not use up the code.
    const poll = await request(app)
      .get(`/api/v1/qr-challenges/${challengeId}`)
      .set("x-pairing-token", pairingToken)
      .expect(200);
    expect(poll.body.data.state).toBe("PENDING");
  });

  it("pairs the browser when the device redeems with a valid signature — API-025", async () => {
    const res = await request(app)
      .post("/api/v1/qr-challenges/redeem")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        challengeId,
        code,
        signature: signQrChallenge(challengeId, code, userKeys.privateKey),
      })
      .expect(200);
    expect(res.body.data.state).toBe("REDEEMED");

    const poll = await request(app)
      .get(`/api/v1/qr-challenges/${challengeId}`)
      .set("x-pairing-token", pairingToken)
      .expect(200);
    expect(poll.body.data.state).toBe("REDEEMED");
    expect(poll.body.data.redeemedAt).not.toBeNull();
  });

  it("refuses to reuse a redeemed code — 409 (BR-002)", async () => {
    await request(app)
      .post("/api/v1/qr-challenges/redeem")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        challengeId,
        code,
        signature: signQrChallenge(challengeId, code, userKeys.privateKey),
      })
      .expect(409);
  });

  it("refuses an expired code — 410 (BR-002)", async () => {
    const created = await request(app)
      .post("/api/v1/qr-challenges")
      .send({ purpose: "PAIRING" })
      .expect(201);
    const expiredId = created.body.data.challengeId as string;
    const expiredCode = created.body.data.code as string;
    await prisma.devicePairing.update({
      where: { id: expiredId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await request(app)
      .post("/api/v1/qr-challenges/redeem")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        challengeId: expiredId,
        code: expiredCode,
        signature: signQrChallenge(expiredId, expiredCode, userKeys.privateKey),
      })
      .expect(410);

    const poll = await request(app)
      .get(`/api/v1/qr-challenges/${expiredId}`)
      .set("x-pairing-token", created.body.data.pairingToken)
      .expect(200);
    expect(poll.body.data.state).toBe("EXPIRED");
  });

  it("lists the paired browser for the user — API-026", async () => {
    const res = await request(app)
      .get("/api/v1/pairings")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ pairingId: challengeId, status: "paired" }),
    ]);
  });
});

// ─── Test 2: Session creation (API-030) and relay (API-032) ──────────────────

describe("Test 2 — Verification session and relay", () => {
  let sessionId: string;

  beforeAll(() => {
    getFCMSpy().mockClear();
  });

  it("requires the Service Provider's API key to open a session — 401", async () => {
    await request(app)
      .post("/api/v1/verification/sessions")
      .send({ predicate: "AGE_OVER_18" })
      .expect(401);
  });

  it("opens a session with a backend-generated nonce and a 120 s window — API-030", async () => {
    const res = await request(app)
      .post("/api/v1/verification/sessions")
      .set("x-api-key", TEST_API_KEY)
      .send({
        predicate: "AGE_OVER_18",
        callbackUrl: "https://test-company.nexusid.com/verify/callback",
      })
      .expect("Content-Type", /json/)
      .expect(201);

    expect(res.body.success).toBe(true);
    sessionId = res.body.data.sessionId;
    testNonce = res.body.data.nonce;
    expect(typeof sessionId).toBe("string");
    expect(testNonce.length).toBeGreaterThanOrEqual(32);

    const windowMs = new Date(res.body.data.expiresAt).getTime() - Date.now();
    expect(windowMs).toBeGreaterThan(110_000);
    expect(windowMs).toBeLessThanOrEqual(120_000);

    // Nothing is routed until the extension relays it.
    const dbReq = await prisma.verificationRequest.findUnique({
      where: { id: sessionId },
    });
    expect(dbReq!.status).toBe("pending");
    expect(dbReq!.userId).toBeNull();
    expect(getFCMSpy()).not.toHaveBeenCalled();
  });

  it("gives every session a different nonce (FR-043 AC4)", async () => {
    const other = await openSession("AGE_OVER_18");
    expect(other.nonce).not.toBe(testNonce);
  });

  it("refuses a relay with the wrong nonce, and sends nothing — 404 (FR-032 AC3)", async () => {
    await relay(sessionId, "not-the-nonce-0000000000").expect(404);
    expect(getFCMSpy()).not.toHaveBeenCalled();
  });

  it("refuses a relay for an unknown session — 404", async () => {
    await relay("00000000-0000-0000-0000-000000000000", testNonce).expect(404);
  });

  it("relays the session to the paired user without an API key — API-032", async () => {
    const res = await relay(sessionId, testNonce)
      .expect("Content-Type", /json/)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.requestId).toBe(sessionId);
    expect(res.body.data.verifierName).toBe("NexusID Test Verifier");
    expect(res.body.data.predicate).toBe("AGE_OVER_18");
    expect(res.body.data.requestedFields).toEqual(["AGE_OVER_18"]);
    expect(typeof res.body.data.pollSecret).toBe("string");

    verificationRequestId = res.body.data.requestId;
    verificationPollSecret = res.body.data.pollSecret;
  });

  it("stores the routed request with only a hash of the poll secret", async () => {
    const dbReq = await prisma.verificationRequest.findUnique({
      where: { id: verificationRequestId },
    });

    expect(dbReq).not.toBeNull();
    expect(dbReq!.status).toBe("pending");
    expect(dbReq!.nonce).toBe(testNonce);
    expect(dbReq!.userId).toBe(testUserId);
    expect(dbReq!.relayedAt).not.toBeNull();
    expect(dbReq!.pageUrl).toBe(DEFAULT_PAGE_URL);
    expect(dbReq!.pollSecretHash).toBeTruthy();
    expect(dbReq!.pollSecretHash).not.toBe(verificationPollSecret);
    expect(dbReq!.predicate).toBe("AGE_OVER_18");
  });

  it("notified the paired device once (FR-019)", () => {
    expect(getFCMSpy()).toHaveBeenCalledTimes(1);

    const call = getFCMSpy().mock.calls[0][0] as {
      push_token: string;
      verification_request_id: string;
      nonce: string;
    };

    expect(call.verification_request_id).toBe(verificationRequestId);
    expect(call.nonce).toBe(testNonce);
    expect(call.push_token).toBe("test-fcm-token-abc123");
  });

  it("refuses to relay the same session twice — 409", async () => {
    await relay(sessionId, testNonce).expect(409);
    expect(getFCMSpy()).toHaveBeenCalledTimes(1);
  });

  it("refuses to relay an expired session — 410 (FR-024)", async () => {
    const stale = await openSession("AGE_OVER_18");
    await prisma.verificationRequest.update({
      where: { id: stale.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await relay(stale.sessionId, stale.nonce).expect(410);
    const dbReq = await prisma.verificationRequest.findUnique({
      where: { id: stale.sessionId },
    });
    expect(dbReq!.status).toBe("expired");
    expect(dbReq!.userId).toBeNull();
  });
});

// ─── Test 3: Proof Submission ─────────────────────────────────────────────────

describe("Test 3 — Valid proof submission", () => {
  it("accepts a valid SD-JWT proof and marks the request as completed", async () => {
    // Generate a REAL proof using holder pipeline + user private key
    const proof = await generateTestProof(testCredential, userKeys.privateKey, {
      requestedFields: ["AGE_OVER_18"],
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
    expect(res.body.data.outcome).toBe("VERIFIED");
    expect(res.body.data.predicate).toBe("AGE_OVER_18");
    expect(res.body.data).not.toHaveProperty("verifiedFields");

    // Confirmed in DB
    const dbReq = await prisma.verificationRequest.findUnique({
      where: { id: verificationRequestId },
    });
    expect(dbReq!.status).toBe("completed");

    const dbResult = await prisma.verificationResult.findUnique({
      where: { requestId: verificationRequestId },
    });
    expect(dbResult).not.toBeNull();
    expect(dbResult!.issuer).toBe("nadra.gov.pk");
    expect(dbResult!.outcome).toBe("VERIFIED");
    expect(dbResult!.condition).toBe("AGE_OVER_18");
    expect(dbResult!.proofHash).toBeTruthy();
  });
});

// ─── Test 4: Outcome — extension poll (API-033) and Service Provider (API-031) ─

describe("Test 4 — Reading the outcome", () => {
  it("returns completed to the extension with its poll secret — API-033", async () => {
    const res = await request(app)
      .get(`/api/v1/verification/request/${verificationRequestId}`)
      .set("x-poll-secret", verificationPollSecret)
      .expect("Content-Type", /json/)
      .expect(200);

    expect(res.body.data.status).toBe("completed");
    expect(res.body.data.outcome).toBe("VERIFIED");
    expect(res.body.data.predicate).toBe("AGE_OVER_18");
    expect(res.body.data).not.toHaveProperty("verifiedFields");
    expect(res.body.data.callbackUrl).toBe(
      "https://test-company.nexusid.com/verify/callback",
    );
  });

  it("returns the same outcome to the Service Provider's server — API-031", async () => {
    const res = await request(app)
      .get(`/api/v1/verification/sessions/${verificationRequestId}/outcome`)
      .set("x-api-key", TEST_API_KEY)
      .expect(200);

    expect(res.body.data.status).toBe("completed");
    expect(res.body.data.outcome).toBe("VERIFIED");
    expect(res.body.data.issuer).toBe("nadra.gov.pk");
  });

  it("requires the poll secret — 401", async () => {
    await request(app)
      .get(`/api/v1/verification/request/${verificationRequestId}`)
      .expect(401);
  });

  it("hides the request from a wrong poll secret — 404", async () => {
    await request(app)
      .get(`/api/v1/verification/request/${verificationRequestId}`)
      .set("x-poll-secret", "wrong-secret")
      .expect(404);
  });

  it("no longer accepts the API key for the extension poll — 401", async () => {
    await request(app)
      .get(`/api/v1/verification/request/${verificationRequestId}`)
      .set("x-api-key", TEST_API_KEY)
      .expect(401);
  });

  it("returns 404 for a non-existent session outcome", async () => {
    await request(app)
      .get(
        "/api/v1/verification/sessions/00000000-0000-0000-0000-000000000000/outcome",
      )
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
    const relayed = await openRelayedRequest(
      "AGE_OVER_18",
      "https://test-company.nexusid.com/replay-test",
    );
    replayRequestId = relayed.requestId;
    replayNonce = relayed.nonce;

    // Build the proof once
    replayProof = await generateTestProof(testCredential, userKeys.privateKey, {
      requestedFields: ["AGE_OVER_18"],
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

  // A fresh session per attempt: one proof closes a session (single-use nonce).
  beforeEach(async () => {
    const relayed = await openRelayedRequest(
      "AGE_OVER_18",
      "https://test-company.nexusid.com/tamper-test",
    );
    tamperedRequestId = relayed.requestId;
    tamperedNonce = relayed.nonce;
  });

  it("rejects a proof with a corrupted sd_jwt (signature verification fails)", async () => {
    const validProof = await generateTestProof(
      testCredential,
      userKeys.privateKey,
      {
        requestedFields: ["AGE_OVER_18"],
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
        requestedFields: ["AGE_OVER_18"],
        verifierId: testVerifierId,
        nonce: tamperedNonce,
      },
    );

    // Replace one disclosure with a crafted but invalid one
    const fakeDisclosure = Buffer.from(
      JSON.stringify(["fake-salt-000000000000", "AGE_OVER_18", true]),
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
        requestedFields: ["AGE_OVER_18"],
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
  const expiredPollSecret = "expired-test-poll-secret";

  beforeAll(async () => {
    expiredNonce = generateNonce();

    // Create request directly in DB with expiresAt in the past
    const row = await prisma.verificationRequest.create({
      data: {
        verifierId: testVerifierId,
        predicate: "AGE_OVER_18",
        requestedFields: ["AGE_OVER_18"],
        nonce: expiredNonce,
        pageUrl: "https://test-company.nexusid.com/expired-test",
        // Already relayed to the test user before it ran out.
        userId: testUserId,
        relayedAt: new Date(Date.now() - 11 * 60 * 1000),
        pollSecretHash: hashApiKey(expiredPollSecret), // same SHA-256 helper
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
      .set("x-poll-secret", expiredPollSecret)
      .expect(200);

    expect(res.body.data.status).toBe("expired");
  });

  it("rejects proof submission against an expired request with 400", async () => {
    const proof = await generateTestProof(testCredential, userKeys.privateKey, {
      requestedFields: ["AGE_OVER_18"],
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
  let rejectablePollSecret: string;

  beforeAll(async () => {
    const relayed = await openRelayedRequest(
      "AGE_OVER_18",
      "https://test-company.nexusid.com/reject-test",
    );
    rejectableRequestId = relayed.requestId;
    rejectablePollSecret = relayed.pollSecret;
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
      .set("x-poll-secret", rejectablePollSecret)
      .expect(200);

    expect(res.body.data.status).toBe("rejected");
    expect(res.body.data.rejected_at).toBeTruthy();
  });

  it("refuses proof submission on a rejected request", async () => {
    const nonce = await prisma.verificationRequest
      .findUnique({ where: { id: rejectableRequestId } })
      .then((r: { nonce: string } | null) => r!.nonce);

    const proof = await generateTestProof(testCredential, userKeys.privateKey, {
      requestedFields: ["AGE_OVER_18"],
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
    expect(completed.predicate).toBe("AGE_OVER_18");
    expect(completed.outcome).toBe("VERIFIED");
    expect(typeof completed.decidedAt).toBe("string");
  });

  it("returns 401 without auth token", async () => {
    await request(app).get("/api/v1/verification/history").expect(401);
  });
});

// ─── Test 11: Service Provider API key (SRS FR-034, API-030/031) ────────────

describe("Test 11 — Service Provider API key", () => {
  it("rejects session creation with an unknown API key — 401", async () => {
    await request(app)
      .post("/api/v1/verification/sessions")
      .set("x-api-key", "not-a-real-key")
      .send({ predicate: "AGE_OVER_18" })
      .expect(401);
  });

  it("records the verifier from the API key, not the request body", async () => {
    const res = await request(app)
      .post("/api/v1/verification/sessions")
      .set("x-api-key", TEST_API_KEY)
      .send({
        verifierId: "00000000-0000-0000-0000-000000000000",
        predicate: "AGE_OVER_18",
      })
      .expect(201);

    const dbReq = await prisma.verificationRequest.findUnique({
      where: { id: res.body.data.sessionId },
    });
    expect(dbReq!.verifierId).toBe(testVerifierId);
  });

  it("hides a session from a different verifier — 404", async () => {
    await prisma.verifier.create({
      data: {
        domain: "other-company.nexusid.com",
        displayName: "Other Verifier",
        apiKey: hashApiKey(OTHER_API_KEY),
        trusted: true,
      },
    });

    await request(app)
      .get(`/api/v1/verification/sessions/${verificationRequestId}/outcome`)
      .set("x-api-key", OTHER_API_KEY)
      .expect(404);
  });

  it("rejects reading an outcome without an API key — 401", async () => {
    await request(app)
      .get(`/api/v1/verification/sessions/${verificationRequestId}/outcome`)
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

    requestId = (await openRelayedRequest("AGE_OVER_18")).requestId;
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
      predicate: "AGE_OVER_18",
      predicateLabel: "Age over 18",
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
      .map(
        (c) => c[0] as { verification_request_id: string; push_token: string },
      )
      .filter((c) => c.verification_request_id === requestId)
      .map((c) => c.push_token);
    expect(pushedTokens).toEqual(["test-fcm-token-abc123"]);
  });

  it("hides the request from a different user — 404 on reject", async () => {
    await request(app)
      .post(`/api/v1/verification/reject/${requestId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404);

    const dbReq = await prisma.verificationRequest.findUnique({
      where: { id: requestId },
    });
    expect(dbReq!.status).toBe("pending");
  });

  it("refuses a valid proof from a revoked credential (BR-006)", async () => {
    const jti = JSON.parse(
      Buffer.from(
        testCredential.sd_jwt.split("~")[0].split(".")[1],
        "base64url",
      ).toString("utf8"),
    ).jti as string;

    await prisma.credential.create({
      data: {
        userId: testUserId,
        issuerCredentialId: testCredential.id,
        credentialJti: jti,
        issuerDid: "nadra.gov.pk",
        issuerName: "NADRA",
        credentialType: "identity",
        status: "revoked",
        metadata: {},
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: new Date(),
      },
    });

    const dbReq = await prisma.verificationRequest.findUnique({
      where: { id: requestId },
    });
    const proof = await generateTestProof(testCredential, userKeys.privateKey, {
      requestedFields: ["AGE_OVER_18"],
      verifierId: testVerifierId,
      nonce: dbReq!.nonce,
    });

    const res = await request(app)
      .post("/api/v1/verification/submit-proof")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ verification_requestId: requestId, proof })
      .expect(400);
    expect(res.body.error).toMatch(/revoked/i);

    const after = await prisma.verificationRequest.findUnique({
      where: { id: requestId },
    });
    // The nonce was consumed on receipt, so the session closes as FAILED.
    expect(after!.status).toBe("failed");

    await prisma.credential.deleteMany({ where: { credentialJti: jti } });
  });

  it("stops routing after the user revokes the pairing", async () => {
    const devices = await request(app)
      .get("/api/v1/pairings")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    const pairingId = devices.body.data[0].pairingId as string;

    // Another user cannot revoke it.
    await request(app)
      .delete(`/api/v1/pairings/${pairingId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404);

    await request(app)
      .delete(`/api/v1/pairings/${pairingId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    const session = await openSession("AGE_OVER_18");
    await relay(session.sessionId, session.nonce).expect(409);
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
      .send({
        email,
        password,
        displayName: "Acme Hiring",
        domain: "acme-hiring.test",
      })
      .expect(201);

    firstKey = res.body.data.apiKey;
    providerToken = res.body.data.token;
    expect(firstKey).toMatch(/^nxk_/);
    expect(res.body.data.verifier).toMatchObject({
      displayName: "Acme Hiring",
      domain: "acme-hiring.test",
    });

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
    await request(app)
      .post("/api/v1/verifiers/login")
      .send({ email, password: "wrong-password" })
      .expect(401);
    const res = await request(app)
      .post("/api/v1/verifiers/login")
      .send({ email, password })
      .expect(200);
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
    await request(app)
      .get("/api/v1/analytics/recent")
      .set("x-api-key", firstKey)
      .expect(200);

    const res = await request(app)
      .post("/api/v1/verifiers/me/api-key")
      .set("Authorization", `Bearer ${providerToken}`)
      .expect(200);
    const secondKey = res.body.data.apiKey as string;
    expect(secondKey).not.toBe(firstKey);

    await request(app)
      .get("/api/v1/analytics/recent")
      .set("x-api-key", firstKey)
      .expect(401);
    await request(app)
      .get("/api/v1/analytics/recent")
      .set("x-api-key", secondKey)
      .expect(200);
  });

  it("API-043 shows key data without the key; API-044 rotates (ALG-009)", async () => {
    const before = await request(app)
      .get("/api/v1/verifiers/api-key")
      .set("Authorization", `Bearer ${providerToken}`)
      .expect(200);
    expect(before.body.data.apiKeyPrefix).toMatch(/^nxk_/);
    expect(before.body.data).not.toHaveProperty("apiKey");

    const rotated = await request(app)
      .post("/api/v1/verifiers/api-key/regenerate")
      .set("Authorization", `Bearer ${providerToken}`)
      .expect(200);
    const newKey = rotated.body.data.apiKey as string;
    expect(rotated.body.data.apiKeyPrefix).toBe(newKey.slice(0, 8));

    const after = await request(app)
      .get("/api/v1/verifiers/api-key")
      .set("Authorization", `Bearer ${providerToken}`)
      .expect(200);
    expect(after.body.data.apiKeyPrefix).toBe(newKey.slice(0, 8));
    expect(JSON.stringify(after.body.data)).not.toContain(newKey);

    await request(app)
      .get("/api/v1/analytics/recent")
      .set("x-api-key", newKey)
      .expect(200);
  });

  it("API-047/048 accept the portal token; a bad API key is not retried as a token", async () => {
    const stats = await request(app)
      .get("/api/v1/analytics/verifications?tzOffset=-300")
      .set("Authorization", `Bearer ${providerToken}`)
      .expect(200);
    expect(stats.body.data).toMatchObject({
      total: 0,
      verified: 0,
      successRate: null,
    });
    expect(stats.body.data.daily).toHaveLength(7);

    const recent = await request(app)
      .get("/api/v1/analytics/recent")
      .set("Authorization", `Bearer ${providerToken}`)
      .expect(200);
    expect(recent.body.data).toEqual([]);

    await request(app)
      .get("/api/v1/analytics/recent")
      .set("Authorization", `Bearer ${providerToken}`)
      .set("x-api-key", "nxk_wrong")
      .expect(401);
    await request(app)
      .get("/api/v1/analytics/recent")
      .set("Authorization", `Bearer ${authToken}`) // End User token
      .expect(401);
  });

  it("lists only its own verification requests", async () => {
    const res = await request(app)
      .get("/api/v1/verifiers/me/requests")
      .set("Authorization", `Bearer ${providerToken}`)
      .expect(200);
    expect(res.body.data).toEqual([]); // Acme has made no requests; the test verifier's are hidden
  });
});
