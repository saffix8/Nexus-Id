/**
 * verification-loop.test.ts
 *
 * The SRS v2 verification loop end to end, with real crypto:
 *   API-030 session → API-032 relay (pairing token) → push + API-034 pending
 *   → API-035 submit-proof (ALG-002, ALG-003) → API-031 / API-033 outcome,
 *   plus API-036 decline, API-037 fail and ALG-005 expiry at 120 s.
 * BR-005 single-use nonce and BR-015 outcome-only storage are asserted directly.
 */

import { jest } from "@jest/globals";

const sendVerificationRequest =
  jest.fn<
    (args: unknown) => Promise<{ success: boolean; message_id: string }>
  >();

jest.unstable_mockModule("../services/notification.service.js", () => ({
  notificationService: {
    sendVerificationRequest,
    sendVerificationComplete: jest.fn(),
    sendBatchNotifications: jest.fn(),
  },
  NotificationService: jest.fn(),
}));

const { createApp } = await import("../index.js");
const { verificationService, RESPONSE_WINDOW_MS } =
  await import("../services/verification.service.js");

import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createHash, createSign, randomUUID } from "crypto";
import { SignJWT } from "jose";
import {
  generateTestKeyPair,
  generateTestCredential,
  generateTestProof,
  type TestKeyPair,
} from "./helpers.js";
import type { SDJWTCredential } from "@nexusid/types";

const prisma = new PrismaClient();
const hashApiKey = (key: string) =>
  createHash("sha256").update(key, "utf8").digest("hex");

const SHOP_API_KEY = "loop-test-shop-a-key";
const SHOP_EMAIL = "shop-a@loop.test";
const SHOP_PASSWORD = "ShopAPass#2026";

let app: ReturnType<typeof createApp>;
let nadraKeys: TestKeyPair;
let userKeys: TestKeyPair;
let credential: SDJWTCredential;
let shopId: string;
let userId: string;
let deviceToken: string;
let pairingToken: string;
let shopPortalToken: string;

// ─── Flow helpers ─────────────────────────────────────────────────────────────

/** API-030 — Shop A's server opens a session. */
function createSession(predicate: string) {
  return request(app)
    .post("/api/v1/verification/sessions")
    .set("x-api-key", SHOP_API_KEY)
    .send({ predicate });
}

/** API-030 + API-032 — a session the paired extension relayed to the device. */
async function openRelayed(predicate = "AGE_OVER_18") {
  const s = await createSession(predicate).expect(201);
  const { sessionId, nonce } = s.body.data;
  const r = await request(app)
    .post("/api/v1/verification/request")
    .set("x-pairing-token", pairingToken)
    .send({ sessionId, nonce, pageUrl: "http://shop-a.localhost/checkout" })
    .expect(200);
  return {
    sessionId: sessionId as string,
    nonce: nonce as string,
    pollSecret: r.body.data.pollSecret as string,
  };
}

/** API-035 — the device submits a proof. */
function submit(sessionId: string, proof: unknown) {
  return request(app)
    .post("/api/v1/verification/submit-proof")
    .set("Authorization", `Bearer ${deviceToken}`)
    .send({ verification_requestId: sessionId, proof });
}

/** API-031 — Shop A's server reads the outcome. */
async function spOutcome(sessionId: string) {
  const res = await request(app)
    .get(`/api/v1/verification/sessions/${sessionId}/outcome`)
    .set("x-api-key", SHOP_API_KEY)
    .expect(200);
  return res.body.data;
}

/** API-033 — the extension polls with its poll secret. */
async function extensionOutcome(sessionId: string, pollSecret: string) {
  const res = await request(app)
    .get(`/api/v1/verification/request/${sessionId}`)
    .set("x-poll-secret", pollSecret)
    .expect(200);
  return res.body.data;
}

function proofFor(
  nonce: string,
  opts: { cred?: SDJWTCredential; predicate?: string; iat?: number } = {},
) {
  return generateTestProof(opts.cred ?? credential, userKeys.privateKey, {
    requestedFields: [opts.predicate ?? "AGE_OVER_18"],
    verifierId: shopId,
    nonce,
    iat: opts.iat,
  });
}

function sign(data: string, privateKeyPem: string): string {
  const signer = createSign("SHA256");
  signer.update(data, "utf8");
  return signer.sign(privateKeyPem, "base64");
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  [nadraKeys, userKeys] = await Promise.all([
    generateTestKeyPair(),
    generateTestKeyPair(),
  ]);
  app = createApp();

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

  await prisma.issuerRegistry.create({
    data: {
      issuerId: "nadra.gov.pk",
      name: "NADRA Pakistan",
      jwksUrl: "http://localhost:4001/.well-known/jwks.json",
      publicKey: nadraKeys.publicKey,
    },
  });

  // Shop A registers through the portal, then configures AGE_OVER_18 (API-046).
  const reg = await request(app)
    .post("/api/v1/verifiers/register")
    .send({
      email: SHOP_EMAIL,
      password: SHOP_PASSWORD,
      displayName: "Shop A",
      domain: "shop-a.test",
    })
    .expect(201);
  shopId = reg.body.data.verifier.id;
  shopPortalToken = reg.body.data.token;
  await prisma.verifier.update({
    where: { id: shopId },
    data: { apiKey: hashApiKey(SHOP_API_KEY) },
  });

  // End User: device key, login, pairing with the extension.
  userId = randomUUID();
  await request(app)
    .post("/api/v1/users/register")
    .send({
      user_id: userId,
      public_key: userKeys.publicKey,
      push_token: "loop-fcm-token",
    })
    .expect(201);
  const challenge = "loop-challenge-" + Date.now();
  const login = await request(app)
    .post("/api/v1/users/login")
    .send({
      user_id: userId,
      challenge,
      signature: sign(challenge, userKeys.privateKey),
    })
    .expect(200);
  deviceToken = login.body.data.token;

  const qr = await request(app)
    .post("/api/v1/qr-challenges")
    .send({ purpose: "PAIRING" })
    .expect(201);
  const { challengeId, code } = qr.body.data;
  pairingToken = qr.body.data.pairingToken;
  await request(app)
    .post("/api/v1/qr-challenges/redeem")
    .set("Authorization", `Bearer ${deviceToken}`)
    .send({
      challengeId,
      code,
      signature: sign(
        `nexusid-qr:PAIRING:${challengeId}:${code}`,
        userKeys.privateKey,
      ),
    })
    .expect(200);

  credential = await generateTestCredential(
    nadraKeys.privateKey,
    userKeys.publicKey,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─── Requirements (FR-041, API-045/046) ───────────────────────────────────────

describe("Service Provider requirements — API-045/046", () => {
  it("starts with nothing configured, so no session can be opened", async () => {
    const res = await request(app)
      .get("/api/v1/verifiers/requirements")
      .set("Authorization", `Bearer ${shopPortalToken}`)
      .expect(200);
    expect(res.body.data.predicates).toEqual([]);
    expect(res.body.data.catalog).toHaveLength(9);

    await createSession("AGE_OVER_18").expect(403);
  });

  it("rejects a predicate outside the catalog — 400 (BR-021)", async () => {
    await request(app)
      .put("/api/v1/verifiers/requirements")
      .set("Authorization", `Bearer ${shopPortalToken}`)
      .send({ predicates: ["AGE_OVER_18", "BLOOD_TYPE_O"] })
      .expect(400);
  });

  it("saves AGE_OVER_18 and AGE_OVER_21 for later sessions", async () => {
    const res = await request(app)
      .put("/api/v1/verifiers/requirements")
      .set("Authorization", `Bearer ${shopPortalToken}`)
      .send({ predicates: ["AGE_OVER_18", "AGE_OVER_21"] })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.predicates).toEqual(["AGE_OVER_18", "AGE_OVER_21"]);
    expect(typeof res.body.timestamp).toBe("string");
  });
});

// ─── 1. Happy path ────────────────────────────────────────────────────────────

describe("1 — Happy path: session → relay → push/pending → proof → VERIFIED", () => {
  let sessionId: string;
  let nonce: string;
  let pollSecret: string;
  let proof: Awaited<ReturnType<typeof generateTestProof>>;

  it("API-030 returns a backend session ID, nonce and 120 s window", async () => {
    const res = await createSession("AGE_OVER_18").expect(201);
    expect(res.body).toMatchObject({
      success: true,
      data: { predicate: "AGE_OVER_18", predicateLabel: "Age over 18" },
    });
    expect(typeof res.body.timestamp).toBe("string");
    sessionId = res.body.data.sessionId;
    nonce = res.body.data.nonce;
    const windowMs = new Date(res.body.data.expiresAt).getTime() - Date.now();
    expect(windowMs).toBeGreaterThan(RESPONSE_WINDOW_MS - 5_000);
    expect(windowMs).toBeLessThanOrEqual(RESPONSE_WINDOW_MS);
  });

  it("API-032 relays with the pairing token and pushes to the paired device", async () => {
    sendVerificationRequest.mockClear();
    const res = await request(app)
      .post("/api/v1/verification/request")
      .set("x-pairing-token", pairingToken)
      .send({ sessionId, nonce, pageUrl: "http://shop-a.localhost/checkout" })
      .expect(200);
    pollSecret = res.body.data.pollSecret;
    expect(res.body.data).toMatchObject({
      verifierName: "Shop A",
      predicate: "AGE_OVER_18",
      notification_sent: true,
    });
    expect(sendVerificationRequest).toHaveBeenCalledTimes(1);
    expect(sendVerificationRequest.mock.calls[0][0]).toMatchObject({
      push_token: "loop-fcm-token",
      verification_request_id: sessionId,
      requested_fields: ["AGE_OVER_18"],
    });
  });

  it("API-034 lists it as pending for the device", async () => {
    const res = await request(app)
      .get("/api/v1/verification/pending")
      .set("Authorization", `Bearer ${deviceToken}`)
      .expect(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        requestId: sessionId,
        predicate: "AGE_OVER_18",
        nonce,
        verifierId: shopId,
      }),
    ]);
    expect((await spOutcome(sessionId)).outcome).toBe("PENDING");
  });

  it("API-035 verifies the proof (ALG-002) and returns VERIFIED without claim values", async () => {
    proof = await proofFor(nonce);
    const res = await submit(sessionId, proof).expect(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        status: "verified",
        outcome: "VERIFIED",
        predicate: "AGE_OVER_18",
        issuer: "nadra.gov.pk",
      },
    });
    expect(res.body.data).not.toHaveProperty("verifiedFields");
  });

  it("API-031 and API-033 both report VERIFIED", async () => {
    const sp = await spOutcome(sessionId);
    const ext = await extensionOutcome(sessionId, pollSecret);
    for (const o of [sp, ext]) {
      expect(o).toMatchObject({
        status: "completed",
        outcome: "VERIFIED",
        predicate: "AGE_OVER_18",
        issuer: "nadra.gov.pk",
      });
      expect(o).not.toHaveProperty("verifiedFields");
    }
  });

  it("BR-015: stores only outcome, condition, proof hash and issuer", async () => {
    const row = await prisma.verificationResult.findUnique({
      where: { requestId: sessionId },
    });
    expect(Object.keys(row!).sort()).toEqual(
      [
        "condition",
        "createdAt",
        "id",
        "issuer",
        "outcome",
        "proofHash",
        "requestId",
        "verifiedAt",
      ].sort(),
    );
    expect(row).toMatchObject({
      outcome: "VERIFIED",
      condition: "AGE_OVER_18",
      issuer: "nadra.gov.pk",
    });
    expect(row!.proofHash).toMatch(/^[0-9a-f]{64}$/);

    // No disclosure, credential or claim of the presentation in any audit entry.
    const logs = await prisma.auditLog.findMany({
      where: { requestId: sessionId },
    });
    const dump = JSON.stringify(logs.map((l) => l.metadata));
    for (const d of proof.presentation.disclosures)
      expect(dump).not.toContain(d);
    expect(dump).not.toContain(proof.presentation.sd_jwt.split(".")[1]);
    expect(dump).not.toContain("NATIONALITY_PAKISTANI");
  });

  it("appears in the End User's history and the Service Provider log", async () => {
    const hist = await request(app)
      .get("/api/v1/verification/history")
      .set("Authorization", `Bearer ${deviceToken}`)
      .expect(200);
    expect(hist.body.data).toContainEqual(
      expect.objectContaining({
        requestId: sessionId,
        outcome: "VERIFIED",
        predicate: "AGE_OVER_18",
        verifierName: "Shop A",
      }),
    );

    const log = await request(app)
      .get("/api/v1/verifiers/me/requests")
      .set("Authorization", `Bearer ${shopPortalToken}`)
      .expect(200);
    expect(log.body.data).toContainEqual(
      expect.objectContaining({
        id: sessionId,
        outcome: "VERIFIED",
        predicate: "AGE_OVER_18",
      }),
    );
  });
});

// ─── 2. Decline ───────────────────────────────────────────────────────────────

describe("2 — Decline (API-036)", () => {
  it("records DECLINED, and the session can no longer take a proof", async () => {
    const { sessionId, nonce, pollSecret } = await openRelayed();

    const res = await request(app)
      .post(`/api/v1/verification/reject/${sessionId}`)
      .set("Authorization", `Bearer ${deviceToken}`)
      .expect(200);
    expect(res.body.data).toEqual({ status: "rejected", outcome: "DECLINED" });

    expect((await spOutcome(sessionId)).outcome).toBe("DECLINED");
    expect((await extensionOutcome(sessionId, pollSecret)).outcome).toBe(
      "DECLINED",
    );

    await submit(sessionId, await proofFor(nonce)).expect(400);
    expect(
      await prisma.usedNonce.findUnique({ where: { nonce } }),
    ).not.toBeNull();
    expect(
      await prisma.verificationResult.findUnique({
        where: { requestId: sessionId },
      }),
    ).toBeNull();
  });

  it("cannot be declined twice — 400", async () => {
    const { sessionId } = await openRelayed();
    await request(app)
      .post(`/api/v1/verification/reject/${sessionId}`)
      .set("Authorization", `Bearer ${deviceToken}`)
      .expect(200);
    await request(app)
      .post(`/api/v1/verification/reject/${sessionId}`)
      .set("Authorization", `Bearer ${deviceToken}`)
      .expect(400);
  });
});

// ─── API-037 fail ─────────────────────────────────────────────────────────────

describe("API-037 — no matching credential", () => {
  it("records FAILED with the condition and no proof hash or issuer", async () => {
    const { sessionId, pollSecret } = await openRelayed();
    const res = await request(app)
      .post(`/api/v1/verification/fail/${sessionId}`)
      .set("Authorization", `Bearer ${deviceToken}`)
      .expect(200);
    expect(res.body.data).toEqual({ status: "failed", outcome: "FAILED" });

    expect((await spOutcome(sessionId)).outcome).toBe("FAILED");
    expect((await extensionOutcome(sessionId, pollSecret)).outcome).toBe(
      "FAILED",
    );
    const row = await prisma.verificationResult.findUnique({
      where: { requestId: sessionId },
    });
    expect(row).toMatchObject({
      outcome: "FAILED",
      condition: "AGE_OVER_18",
      issuer: null,
      proofHash: null,
    });
  });

  it("only the routed End User can report it — 404 for anyone else", async () => {
    const { sessionId } = await openRelayed();
    const otherKeys = await generateTestKeyPair();
    const otherId = randomUUID();
    await request(app)
      .post("/api/v1/users/register")
      .send({ user_id: otherId, public_key: otherKeys.publicKey, push_token: "other-fcm-token" })
      .expect(201);
    const ch = "other-" + Date.now();
    const login = await request(app)
      .post("/api/v1/users/login")
      .send({
        user_id: otherId,
        challenge: ch,
        signature: sign(ch, otherKeys.privateKey),
      })
      .expect(200);
    await request(app)
      .post(`/api/v1/verification/fail/${sessionId}`)
      .set("Authorization", `Bearer ${login.body.data.token}`)
      .expect(404);
    expect((await spOutcome(sessionId)).outcome).toBe("PENDING");
  });
});

// ─── 3. Expiry (ALG-005) ──────────────────────────────────────────────────────

describe("3 — Expiry: ALG-005 closes PENDING sessions after 120 s", () => {
  it("leaves a session open at 119 s and expires it at 120 s", async () => {
    const { sessionId, nonce, pollSecret } = await openRelayed();
    const createdAt = (await prisma.verificationRequest.findUnique({
      where: { id: sessionId },
    }))!.createdAt;

    await verificationService.expireSessions(
      new Date(createdAt.getTime() + 119_000),
    );
    expect(
      (await prisma.verificationRequest.findUnique({
        where: { id: sessionId },
      }))!.status,
    ).toBe("pending");

    const expired = await verificationService.expireSessions(
      new Date(createdAt.getTime() + 120_000),
    );
    expect(expired).toBeGreaterThanOrEqual(1);
    expect(
      (await prisma.verificationRequest.findUnique({
        where: { id: sessionId },
      }))!.status,
    ).toBe("expired");

    // FR-024 AC2: the SP and the extension both see EXPIRED.
    expect((await spOutcome(sessionId)).outcome).toBe("EXPIRED");
    expect((await extensionOutcome(sessionId, pollSecret)).outcome).toBe(
      "EXPIRED",
    );

    // AC1: it can no longer be approved or declined.
    const res = await submit(sessionId, await proofFor(nonce)).expect(400);
    expect(res.body.success).toBe(false);
    await request(app)
      .post(`/api/v1/verification/reject/${sessionId}`)
      .set("Authorization", `Bearer ${deviceToken}`)
      .expect(400);

    // AC3: it is in the End User's history as EXPIRED, and audited.
    const hist = await request(app)
      .get("/api/v1/verification/history")
      .set("Authorization", `Bearer ${deviceToken}`)
      .expect(200);
    expect(hist.body.data).toContainEqual(
      expect.objectContaining({ requestId: sessionId, outcome: "EXPIRED" }),
    );
    const audit = await prisma.auditLog.findFirst({
      where: { requestId: sessionId, eventType: "verification_expired" },
    });
    expect(audit).not.toBeNull();
  });

  it("does not touch sessions that were already answered", async () => {
    const { sessionId, nonce } = await openRelayed();
    await submit(sessionId, await proofFor(nonce)).expect(200);
    await verificationService.expireSessions(
      new Date(Date.now() + 10 * RESPONSE_WINDOW_MS),
    );
    expect((await spOutcome(sessionId)).outcome).toBe("VERIFIED");
  });

  it("is also enforced on submit if the sweep has not run yet", async () => {
    const { sessionId, nonce } = await openRelayed();
    await prisma.verificationRequest.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await submit(sessionId, await proofFor(nonce)).expect(400);
    expect(res.body.error).toMatch(/expired/i);
    expect((await spOutcome(sessionId)).outcome).toBe("EXPIRED");
  });
});

// ─── 4. Nonce replay (BR-005, ALG-003) ────────────────────────────────────────

describe("4 — Nonce replay", () => {
  it("rejects the same proof submitted twice to the same session", async () => {
    const { sessionId, nonce } = await openRelayed();
    const proof = await proofFor(nonce);
    await submit(sessionId, proof).expect(200);

    const res = await submit(sessionId, proof).expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/nonce|closed/i);
    expect((await spOutcome(sessionId)).outcome).toBe("VERIFIED");
  });

  it("rejects a captured proof replayed into a new session (nonce mismatch) and records FAILED", async () => {
    const first = await openRelayed();
    const captured = await proofFor(first.nonce);
    await submit(first.sessionId, captured).expect(200);

    const second = await openRelayed();
    const res = await submit(second.sessionId, captured).expect(400);
    expect(res.body.details).toMatchObject({
      code: "NONCE_MISMATCH",
      outcome: "FAILED",
    });
    expect((await spOutcome(second.sessionId)).outcome).toBe("FAILED");
  });

  it("lets only one of two concurrent submissions through", async () => {
    const { sessionId, nonce } = await openRelayed();
    const proof = await proofFor(nonce);
    const results = await Promise.all([
      submit(sessionId, proof),
      submit(sessionId, proof),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(
      await prisma.verificationResult.count({
        where: { requestId: sessionId },
      }),
    ).toBe(1);
  });

  it("rejects a relay of the same session a second time — 409", async () => {
    const s = await createSession("AGE_OVER_18").expect(201);
    const body = {
      sessionId: s.body.data.sessionId,
      nonce: s.body.data.nonce,
      pageUrl: "http://shop-a.localhost/",
    };
    await request(app)
      .post("/api/v1/verification/request")
      .set("x-pairing-token", pairingToken)
      .send(body)
      .expect(200);
    await request(app)
      .post("/api/v1/verification/request")
      .set("x-pairing-token", pairingToken)
      .send(body)
      .expect(409);
  });

  it("gives every session a unique nonce", async () => {
    const nonces = await Promise.all(
      Array.from(
        { length: 10 },
        async () =>
          (await createSession("AGE_OVER_18").expect(201)).body.data.nonce,
      ),
    );
    expect(new Set(nonces).size).toBe(10);
  });
});

// ─── 5. Wrong predicate ───────────────────────────────────────────────────────

describe("5 — Wrong predicate", () => {
  it("API-030 rejects a code outside the catalog — 422", async () => {
    const res = await createSession("age").expect(422);
    expect(res.body.details.code).toBe("UNKNOWN_PREDICATE");
  });

  it("API-030 rejects a catalog predicate the provider did not configure — 403", async () => {
    const res = await createSession("NATIONALITY_PAKISTANI").expect(403);
    expect(res.body.details.code).toBe("PREDICATE_NOT_CONFIGURED");
  });

  it("FAILS a proof that discloses a different predicate than requested", async () => {
    const { sessionId, nonce } = await openRelayed("AGE_OVER_18");
    const res = await submit(
      sessionId,
      await proofFor(nonce, { predicate: "NATIONALITY_PAKISTANI" }),
    ).expect(400);
    expect(res.body.details).toMatchObject({
      code: "PREDICATE_MISMATCH",
      outcome: "FAILED",
    });
    expect((await spOutcome(sessionId)).outcome).toBe("FAILED");
    const row = await prisma.verificationResult.findUnique({
      where: { requestId: sessionId },
    });
    expect(row).toMatchObject({
      outcome: "FAILED",
      condition: "AGE_OVER_18",
      issuer: "nadra.gov.pk",
    });
  });

  it("FAILS a proof that discloses extra claims beyond the predicate", async () => {
    const { sessionId, nonce } = await openRelayed("AGE_OVER_18");
    const proof = await generateTestProof(credential, userKeys.privateKey, {
      requestedFields: ["AGE_OVER_18", "NATIONALITY_PAKISTANI"],
      verifierId: shopId,
      nonce,
    });
    const res = await submit(sessionId, proof).expect(400);
    expect(res.body.details.code).toBe("PREDICATE_MISMATCH");
  });

  it("FAILS when the issuer-signed predicate is false (AGE_OVER_21 = false)", async () => {
    const { sessionId, nonce } = await openRelayed("AGE_OVER_21");
    const res = await submit(
      sessionId,
      await proofFor(nonce, { predicate: "AGE_OVER_21" }),
    ).expect(400);
    expect(res.body.details.code).toBe("CONDITION_NOT_MET");
    expect((await spOutcome(sessionId)).outcome).toBe("FAILED");
  });
});

// ─── 6. Expired credential ────────────────────────────────────────────────────

describe("6 — Expired credential", () => {
  it("FAILS a proof built from a credential past its expiry (BR-018)", async () => {
    const expiredCred = await generateTestCredential(
      nadraKeys.privateKey,
      userKeys.publicKey,
      { expiresInDays: -1 },
    );
    const { sessionId, nonce, pollSecret } = await openRelayed();
    const res = await submit(
      sessionId,
      await proofFor(nonce, { cred: expiredCred }),
    ).expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.details).toMatchObject({
      code: "CREDENTIAL_EXPIRED",
      outcome: "FAILED",
    });
    expect((await spOutcome(sessionId)).outcome).toBe("FAILED");
    expect((await extensionOutcome(sessionId, pollSecret)).outcome).toBe(
      "FAILED",
    );
  });
});

// ─── Other ALG-002 checks ─────────────────────────────────────────────────────

describe("ALG-002 — remaining checks", () => {
  it("FAILS a proof older than 60 s", async () => {
    const { sessionId, nonce } = await openRelayed();
    const res = await submit(
      sessionId,
      await proofFor(nonce, { iat: Math.floor(Date.now() / 1000) - 61 }),
    ).expect(400);
    expect(res.body.details.code).toBe("PROOF_TOO_OLD");
  });

  it("FAILS a revoked credential (BR-006)", async () => {
    const jti = JSON.parse(
      Buffer.from(credential.sd_jwt.split(".")[1], "base64url").toString(),
    ).jti as string;
    await prisma.credential.create({
      data: {
        userId,
        issuerCredentialId: "loop-revoked-" + jti,
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
    const { sessionId, nonce } = await openRelayed();
    const res = await submit(sessionId, await proofFor(nonce)).expect(400);
    expect(res.body.details.code).toBe("CREDENTIAL_REVOKED");
    await prisma.credential.deleteMany({ where: { credentialJti: jti } });
  });

  it("FAILS a credential signed by an issuer outside the registry", async () => {
    const rogue = await generateTestKeyPair();
    const rogueCred = await generateTestCredential(
      rogue.privateKey,
      userKeys.publicKey,
      { issuerDID: "rogue.example" },
    );
    const { sessionId, nonce } = await openRelayed();
    const res = await submit(
      sessionId,
      await proofFor(nonce, { cred: rogueCred }),
    ).expect(400);
    expect(res.body.details.code).toBe("UNTRUSTED_ISSUER");
  });

  it("FAILS a forged credential that claims to be from NADRA", async () => {
    const rogue = await generateTestKeyPair();
    const forged = await generateTestCredential(
      rogue.privateKey,
      userKeys.publicKey,
    );
    const { sessionId, nonce } = await openRelayed();
    const res = await submit(
      sessionId,
      await proofFor(nonce, { cred: forged }),
    ).expect(400);
    expect(res.body.details.code).toBe("INVALID_SIGNATURE");
  });

  it("FAILS a key-binding JWT signed by a key other than the device key", async () => {
    const { sessionId, nonce } = await openRelayed();
    const valid = await proofFor(nonce);
    const attacker = await generateTestKeyPair();
    const { importPKCS8 } = await import("jose");
    const presentation =
      valid.presentation.sd_jwt +
      "~" +
      valid.presentation.disclosures.join("~") +
      "~";
    const kb = await new SignJWT({
      aud: shopId,
      nonce,
      iat: Math.floor(Date.now() / 1000),
      sd_hash: createHash("sha256").update(presentation).digest("base64url"),
    })
      .setProtectedHeader({ alg: "RS256", typ: "kb+jwt" })
      .sign(await importPKCS8(attacker.privateKey, "RS256"));
    const res = await submit(sessionId, { ...valid, key_binding: kb }).expect(
      400,
    );
    expect(res.body.details.outcome).toBe("FAILED");
  });
});
