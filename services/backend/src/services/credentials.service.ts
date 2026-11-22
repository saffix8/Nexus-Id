import axios from "axios";
import prisma from "../lib/prisma.js";
import { blockchainService } from "./blockchain.service.js";
import type { SDJWTCredential, CredentialMetadata } from "@nexusid/types";

// ---------------------------------------------------------------------------
// Typed error class
// ---------------------------------------------------------------------------

export class CredentialsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = "CredentialsError";
  }
}

// ---------------------------------------------------------------------------
// Issuer base URLs — each issuer is its own microservice (see CLAUDE.md map)
// ---------------------------------------------------------------------------

const NADRA_URL = process.env.NADRA_ISSUER_URL ?? "http://localhost:4001";
const HEC_URL = process.env.HEC_ISSUER_URL ?? "http://localhost:4002";
const AU_URL = process.env.AU_ISSUER_URL ?? "http://localhost:4003";
const LINKEDIN_URL = process.env.LINKEDIN_ISSUER_URL ?? "http://localhost:4004";

// Human-readable issuer names for display — the SDJWTCredential's `issuer`
// field is a DID (e.g. "nadra.gov.pk"), not a display name.
const ISSUER_DISPLAY_NAMES: Record<string, string> = {
  "nadra.gov.pk": "NADRA Pakistan",
  "hec.gov.pk": "Higher Education Commission",
  "au.edu.pk": "Air University",
  "linkedin.com": "LinkedIn",
};

// ---------------------------------------------------------------------------
// DTO returned to the frontend by listCredentials
// ---------------------------------------------------------------------------

export interface CredentialListItem {
  id: string;
  issuerDid: string;
  issuerName: string;
  credentialType: string;
  status: string;
  metadata: CredentialMetadata;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface RevocationResult {
  revoked: boolean;
  revokedAt: string | null;
  reason: string | null;
}

export interface LinkedinStatusResult {
  status: "pending" | "completed" | "failed";
  credential?: SDJWTCredential;
  error?: string;
}

// ---------------------------------------------------------------------------
// LinkedIn OAuth pending-connection tracking.
// In-memory, single-process only — same known limitation as NADRA's OTP
// session store (see .claude/rules/backend.md). A real deployment needs
// Redis so this survives restarts and works across multiple instances.
// ---------------------------------------------------------------------------

interface PendingLinkedinEntry {
  userId: string;
  status: "pending" | "completed" | "failed";
  credential?: SDJWTCredential;
  error?: string;
}

const pendingLinkedin = new Map<string, PendingLinkedinEntry>();

class CredentialsService {
  // ── Issuer proxies ──────────────────────────────────────────────────────

  async proxyNadraVerify(body: unknown): Promise<unknown> {
    return this.forward(
      "post",
      `${NADRA_URL}/api/v1/credentials/nadra/verify`,
      body,
    );
  }

  async proxyNadraVerifyOtp(
    body: { session_id: string; otp: string },
    userId: string,
  ): Promise<unknown> {
    const user_public_key = await this.requirePublicKey(userId);
    const data = await this.forward<{
      success: boolean;
      data?: { credential: SDJWTCredential };
    }>("post", `${NADRA_URL}/api/v1/credentials/nadra/verify-otp`, {
      ...body,
      user_public_key,
    });

    if (data.success && data.data?.credential) {
      await this.recordCredential(userId, data.data.credential);
    }
    return data;
  }

  async proxyHecVerify(
    body: { degree_number: string; university: string; student_name: string },
    userId: string,
  ): Promise<unknown> {
    const user_public_key = await this.requirePublicKey(userId);
    const data = await this.forward<{
      success: boolean;
      data?: { credential: SDJWTCredential };
    }>("post", `${HEC_URL}/api/v1/credentials/hec/verify`, {
      ...body,
      user_public_key,
    });

    if (data.success && data.data?.credential) {
      await this.recordCredential(userId, data.data.credential);
    }
    return data;
  }

  async proxyAuScrape(
    body: { username: string; password: string; otp?: string },
    userId: string,
  ): Promise<unknown> {
    const user_public_key = await this.requirePublicKey(userId);
    const data = await this.forward<{
      success: boolean;
      data?: { credential: SDJWTCredential };
    }>("post", `${AU_URL}/api/v1/credentials/au/scrape`, {
      ...body,
      user_public_key,
    });

    if (data.success && data.data?.credential) {
      await this.recordCredential(userId, data.data.credential);
    }
    return data;
  }

  async proxyLinkedinAuthUrl(userId: string): Promise<unknown> {
    const data = await this.forward<{
      success: boolean;
      data?: { auth_url: string };
    }>("get", `${LINKEDIN_URL}/api/v1/credentials/linkedin/auth-url`);

    const authUrl = data.data?.auth_url;
    const state = authUrl ? new URL(authUrl).searchParams.get("state") : null;

    if (state) {
      // Starting a new attempt supersedes any earlier abandoned one for
      // this user — otherwise getLinkedinStatus's userId scan could return
      // a stale "pending" from an old attempt and never surface this one.
      for (const [existingState, entry] of pendingLinkedin) {
        if (entry.userId === userId) pendingLinkedin.delete(existingState);
      }

      // In-memory tracking only — same known limitation as NADRA's session
      // store (see .claude/rules/backend.md). Fine for a single-process dev
      // deployment; a real deployment would need Redis so this survives
      // restarts and works across multiple backend instances.
      pendingLinkedin.set(state, { userId, status: "pending" });
    }

    // The popup navigates to this URL directly — it never passes back
    // through this backend — so the holder's public key has to be threaded
    // through the URL itself (the mock-consent page and /callback already
    // forward it) rather than injected server-side like the other issuers.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { publicKey: true },
    });

    if (authUrl && user?.publicKey && data.data) {
      const url = new URL(authUrl);
      url.searchParams.set("user_public_key", user.publicKey);
      data.data.auth_url = url.toString();
    }

    return data;
  }

  async proxyLinkedinIssue(
    body: { code: string; state: string },
    userId: string,
  ): Promise<unknown> {
    const user_public_key = await this.requirePublicKey(userId);
    const data = await this.forward<{
      success: boolean;
      data?: { credential: SDJWTCredential };
    }>("post", `${LINKEDIN_URL}/api/v1/credentials/linkedin/issue`, {
      ...body,
      user_public_key,
    });

    if (data.success && data.data?.credential) {
      await this.recordCredential(userId, data.data.credential);
    }
    return data;
  }

  // Called by the LinkedIn issuer itself (server-to-server) once its OAuth
  // callback finishes, since the browser popup redirects there directly —
  // the backend has no other way to learn the outcome of that round trip.
  async recordLinkedinCompletion(
    state: string,
    outcome:
      | { success: true; credential: SDJWTCredential }
      | { success: false; error: string },
  ): Promise<void> {
    const pending = pendingLinkedin.get(state);
    if (!pending) return; // unknown/expired state — nothing to update

    if (outcome.success) {
      await this.recordCredential(pending.userId, outcome.credential);
      pendingLinkedin.set(state, {
        userId: pending.userId,
        status: "completed",
        credential: outcome.credential,
      });
    } else {
      pendingLinkedin.set(state, {
        userId: pending.userId,
        status: "failed",
        error: outcome.error,
      });
    }
  }

  // Polled by the frontend. Consumes (deletes) the entry once it reaches a
  // terminal state, so a later unrelated connect attempt doesn't see stale
  // results — mirrors NADRA's single-use OTP session semantics.
  getLinkedinStatus(userId: string): LinkedinStatusResult {
    for (const [state, entry] of pendingLinkedin) {
      if (entry.userId !== userId) continue;

      if (entry.status === "pending") {
        return { status: "pending" };
      }

      pendingLinkedin.delete(state);
      return entry.status === "completed"
        ? { status: "completed", credential: entry.credential }
        : { status: "failed", error: entry.error };
    }

    return { status: "pending" };
  }

  // ── Listing ─────────────────────────────────────────────────────────────

  async listCredentials(userId: string): Promise<CredentialListItem[]> {
    const rows = await prisma.credential.findMany({
      where: { userId },
      orderBy: { issuedAt: "desc" },
    });

    const now = new Date();

    return rows.map((row) => ({
      id: row.id,
      issuerDid: row.issuerDid,
      issuerName: row.issuerName,
      credentialType: row.credentialType,
      status:
        row.status === "revoked"
          ? "revoked"
          : row.expiresAt < now
            ? "expired"
            : "active",
      metadata: row.metadata as unknown as CredentialMetadata,
      issuedAt: row.issuedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
    }));
  }

  // ── Revocation ──────────────────────────────────────────────────────────
  // Postgres `Credential.status` is the source of truth for this deployment.
  // The Fabric chain audit trail (blockchain.service.ts) is cross-checked on
  // a best-effort basis and fails open by design — Fabric isn't running in
  // this environment, so this just confirms what Postgres already says
  // unless/until a real chaincode network is stood up.

  async checkRevocation(
    credentialId: string,
    userId: string,
  ): Promise<RevocationResult> {
    const row = await prisma.credential.findFirst({
      where: { id: credentialId, userId },
    });
    if (!row) {
      throw new CredentialsError("Credential not found", "NOT_FOUND", 404);
    }

    if (row.status === "revoked") {
      return {
        revoked: true,
        revokedAt: row.revokedAt?.toISOString() ?? null,
        reason: null,
      };
    }

    const chainStatus = await blockchainService.checkRevocation(
      row.issuerCredentialId,
    );
    if (chainStatus.revoked) {
      const revokedAt = chainStatus.revokedAt
        ? new Date(chainStatus.revokedAt)
        : new Date();
      await prisma.credential.update({
        where: { id: row.id },
        data: { status: "revoked", revokedAt },
      });
      return {
        revoked: true,
        revokedAt: revokedAt.toISOString(),
        reason: chainStatus.reason ?? null,
      };
    }

    return { revoked: false, revokedAt: null, reason: null };
  }

  async revokeCredential(
    credentialId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    const row = await prisma.credential.findFirst({
      where: { id: credentialId, userId },
    });
    if (!row) {
      throw new CredentialsError("Credential not found", "NOT_FOUND", 404);
    }

    const revokedAt = new Date();
    await prisma.credential.update({
      where: { id: row.id },
      data: { status: "revoked", revokedAt },
    });

    // Fire-and-forget — fails silently by design (see blockchain.service.ts)
    void blockchainService.logRevocation(row.issuerCredentialId, reason);
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  private async requirePublicKey(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { publicKey: true },
    });

    if (!user?.publicKey) {
      throw new CredentialsError(
        "No public key on file for this account. Generate one before connecting a credential source.",
        "NO_PUBLIC_KEY",
        400,
      );
    }

    return user.publicKey;
  }

  private async recordCredential(
    userId: string,
    credential: SDJWTCredential,
  ): Promise<void> {
    await prisma.credential.upsert({
      where: { issuerCredentialId: credential.id },
      create: {
        userId,
        issuerCredentialId: credential.id,
        issuerDid: credential.issuer,
        issuerName:
          ISSUER_DISPLAY_NAMES[credential.issuer] ?? credential.issuer,
        credentialType: credential.type,
        metadata: credential.metadata as unknown as object,
        issuedAt: new Date(credential.issued_at),
        expiresAt: new Date(credential.expires_at),
      },
      update: {},
    });
  }

  private async forward<T = unknown>(
    method: "get" | "post",
    url: string,
    body?: unknown,
  ): Promise<T> {
    try {
      const response =
        method === "post"
          ? await axios.post(url, body, { timeout: 30_000 })
          : await axios.get(url, { timeout: 30_000 });
      return response.data as T;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response) {
          throw new CredentialsError(
            (err.response.data as { error?: string })?.error ??
              "Issuer rejected the request",
            "ISSUER_ERROR",
            err.response.status,
          );
        }
        throw new CredentialsError(
          "Issuer service is unreachable",
          "ISSUER_UNREACHABLE",
          502,
        );
      }
      throw err;
    }
  }
}

export const credentialsService = new CredentialsService();
