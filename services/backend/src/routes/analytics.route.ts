// services/backend/src/routes/analytics.route.ts
//
// Service Provider analytics (FR-042). Both routes accept either the SP's API
// key (`x-api-key`, for its own backend) or a portal JWT (the SP dashboard,
// SCR-018) — see requireVerifierAuth.
//
// BR-015 / FR-042 AC2: nothing here identifies the End User. Rows carry the
// session ID, condition, outcome, issuer and proof hash only.

import { Router } from "express";
import { z } from "zod";
import { predicateLabel } from "@nexusid/sd-jwt";
import type { VerificationOutcome } from "@nexusid/types";
import prisma from "../lib/prisma.js";
import { success } from "../lib/response.js";
import { requireVerifierAuth } from "../middleware/api-key.middleware.js";
import { ValidationError } from "../middleware/error.middleware.js";
import { outcomeOf } from "../services/verification.service.js";

const router = Router();

const DAY_MS = 86_400_000;
const SERIES_DAYS = 7;

const StatsQuery = z.object({
  /** Minutes behind UTC, as returned by JS `Date#getTimezoneOffset()`. */
  tzOffset: z.coerce.number().int().min(-840).max(840).default(0),
});

const RecentQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Validation failed",
    );
  }
  return parsed.data;
}

/** A pending session past its window counts as expired even before ALG-005 runs. */
function effectiveOutcome(
  r: { status: string; expiresAt: Date },
  now: Date,
): VerificationOutcome {
  return r.status === "pending" && r.expiresAt < now
    ? "EXPIRED"
    : outcomeOf(r.status);
}

/** Local calendar date (YYYY-MM-DD) for a UTC instant and a JS tz offset. */
function localDay(d: Date, tzOffset: number): string {
  return new Date(d.getTime() - tzOffset * 60_000).toISOString().slice(0, 10);
}

export interface VerificationStats {
  total: number;
  verified: number;
  failed: number;
  declined: number;
  expired: number;
  pending: number;
  /** verified / decided sessions, 0–100 with one decimal; null with no decided session. */
  successRate: number | null;
  /** Last 7 local days, oldest first. */
  daily: {
    date: string;
    verified: number;
    failed: number;
    declined: number;
    expired: number;
  }[];
}

// GET /api/v1/analytics/verifications — API-047: totals + 7-day series.
router.get("/verifications", requireVerifierAuth, async (req, res, next) => {
  try {
    const { tzOffset } = parse(StatsQuery, req.query);
    const verifierId = req.verifier!.id;
    const now = new Date();

    const [byStatus, overdue] = await Promise.all([
      prisma.verificationRequest.groupBy({
        by: ["status"],
        where: { verifierId },
        _count: { _all: true },
      }),
      prisma.verificationRequest.count({
        where: { verifierId, status: "pending", expiresAt: { lt: now } },
      }),
    ]);

    const counts: Record<VerificationOutcome, number> = {
      PENDING: 0,
      VERIFIED: 0,
      FAILED: 0,
      DECLINED: 0,
      EXPIRED: 0,
    };
    for (const g of byStatus) counts[outcomeOf(g.status)] += g._count._all;
    counts.PENDING -= overdue;
    counts.EXPIRED += overdue;

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const decided = total - counts.PENDING;

    // Daily series: bucket the last 7 local days.
    const days: string[] = [];
    for (let i = SERIES_DAYS - 1; i >= 0; i--)
      days.push(localDay(new Date(now.getTime() - i * DAY_MS), tzOffset));
    const series = new Map(
      days.map((d) => [
        d,
        { date: d, verified: 0, failed: 0, declined: 0, expired: 0 },
      ]),
    );

    const windowRows = await prisma.verificationRequest.findMany({
      where: {
        verifierId,
        createdAt: {
          gte: new Date(now.getTime() - (SERIES_DAYS + 1) * DAY_MS),
        },
      },
      select: { createdAt: true, status: true, expiresAt: true },
    });
    for (const r of windowRows) {
      const bucket = series.get(localDay(r.createdAt, tzOffset));
      if (!bucket) continue;
      const o = effectiveOutcome(r, now);
      if (o === "VERIFIED") bucket.verified++;
      else if (o === "FAILED") bucket.failed++;
      else if (o === "DECLINED") bucket.declined++;
      else if (o === "EXPIRED") bucket.expired++;
    }

    const stats: VerificationStats = {
      total,
      verified: counts.VERIFIED,
      failed: counts.FAILED,
      declined: counts.DECLINED,
      expired: counts.EXPIRED,
      pending: counts.PENDING,
      successRate:
        decided > 0
          ? Math.round((counts.VERIFIED / decided) * 1000) / 10
          : null,
      daily: [...series.values()],
    };
    res.json(success(stats));
  } catch (err) {
    next(err);
  }
});

export interface RecentVerification {
  id: string;
  /** The session ID the SP got from API-030. */
  sessionId: string;
  createdAt: string;
  predicate: string;
  predicateLabel: string;
  outcome: VerificationOutcome;
  issuer: string | null;
  proofHash: string | null;
  decidedAt: string | null;
}

// GET /api/v1/analytics/recent?limit — API-048: verification log, newest first.
router.get("/recent", requireVerifierAuth, async (req, res, next) => {
  try {
    const { limit } = parse(RecentQuery, req.query);
    const now = new Date();
    const rows = await prisma.verificationRequest.findMany({
      where: { verifierId: req.verifier!.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        status: true,
        expiresAt: true,
        predicate: true,
        requestedFields: true,
        completedAt: true,
        rejectedAt: true,
        result: { select: { issuer: true, proofHash: true, verifiedAt: true } },
      },
    });

    const recent: RecentVerification[] = rows.map((r) => {
      const predicate = r.predicate ?? r.requestedFields[0] ?? "";
      const decided = r.result?.verifiedAt ?? r.completedAt ?? r.rejectedAt;
      return {
        id: r.id,
        sessionId: r.id,
        createdAt: r.createdAt.toISOString(),
        predicate,
        predicateLabel: predicateLabel(predicate),
        outcome: effectiveOutcome(r, now),
        issuer: r.result?.issuer ?? null,
        proofHash: r.result?.proofHash ?? null,
        decidedAt: decided?.toISOString() ?? null,
      };
    });
    res.json(success(recent));
  } catch (err) {
    next(err);
  }
});

export default router;
