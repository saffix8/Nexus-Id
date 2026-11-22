import axios from "axios";
import prisma from "../lib/prisma.js";
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

class CredentialsService {
  // ── Issuer proxies ──────────────────────────────────────────────────────

  async proxyNadraVerify(body: unknown): Promise<unknown> {
    return this.forward(
      "post",
      `${NADRA_URL}/api/v1/credentials/nadra/verify`,
      body,
    );
  }

  async proxyNadraVerifyOtp(body: unknown, userId: string): Promise<unknown> {
    const data = await this.forward<{
      success: boolean;
      data?: { credential: SDJWTCredential };
    }>("post", `${NADRA_URL}/api/v1/credentials/nadra/verify-otp`, body);

    if (data.success && data.data?.credential) {
      await this.recordCredential(userId, data.data.credential);
    }
    return data;
  }

  async proxyHecVerify(body: unknown, userId: string): Promise<unknown> {
    const data = await this.forward<{
      success: boolean;
      data?: { credential: SDJWTCredential };
    }>("post", `${HEC_URL}/api/v1/credentials/hec/verify`, body);

    if (data.success && data.data?.credential) {
      await this.recordCredential(userId, data.data.credential);
    }
    return data;
  }

  async proxyAuScrape(body: unknown, userId: string): Promise<unknown> {
    const data = await this.forward<{
      success: boolean;
      data?: { credential: SDJWTCredential };
    }>("post", `${AU_URL}/api/v1/credentials/au/scrape`, body);

    if (data.success && data.data?.credential) {
      await this.recordCredential(userId, data.data.credential);
    }
    return data;
  }

  async proxyLinkedinAuthUrl(): Promise<unknown> {
    return this.forward(
      "get",
      `${LINKEDIN_URL}/api/v1/credentials/linkedin/auth-url`,
    );
  }

  async proxyLinkedinIssue(body: unknown, userId: string): Promise<unknown> {
    const data = await this.forward<{
      success: boolean;
      data?: { credential: SDJWTCredential };
    }>("post", `${LINKEDIN_URL}/api/v1/credentials/linkedin/issue`, body);

    if (data.success && data.data?.credential) {
      await this.recordCredential(userId, data.data.credential);
    }
    return data;
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

  // ── Internal helpers ────────────────────────────────────────────────────

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
