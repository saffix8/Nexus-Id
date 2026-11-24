import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireApiKey } from "../middleware/api-key.middleware.js";
import { PAIRING_TOKEN_HEADER } from "../services/pairing.service.js";
import {
  verificationService,
  VerificationError,
} from "../services/verification.service.js";
import { success, failure } from "../lib/response.js";
import type { Proof } from "@nexusid/types";

const router = Router();

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------

// API-030: the verifier is identified by its API key (see requireApiKey),
// never by a field in the body. The backend generates the nonce (FR-043).
// One catalog predicate per session (FR-005, BR-021); catalog membership and
// the provider's configuration are checked in the service.
const CreateSessionSchema = z.object({
  predicate: z
    .string({ error: "predicate is required (a predicate catalog code such as AGE_OVER_18)" })
    .min(1, "predicate is required")
    .max(64),
  callbackUrl: z.string().url("callbackUrl must be a valid URL").optional(),
});

// API-032: what the extension read from the page's integration snippet.
const RelayRequestSchema = z.object({
  sessionId: z.string().uuid("sessionId must be a UUID"),
  nonce: z.string().min(1, "nonce is required").max(512),
  pageUrl: z.string().min(1, "pageUrl is required").max(2048),
});

const UuidSchema = z.string().uuid();

/** Header carrying the extension's poll secret (SRS auth type "Poll secret"). */
const POLL_SECRET_HEADER = "x-poll-secret";

const SubmitProofSchema = z.object({
  verification_requestId: z
    .string()
    .uuid("verification_requestId must be a UUID"),
  proof: z.object({
    presentation: z.object({
      sd_jwt: z.string().min(1),
      disclosures: z.array(z.string()),
    }),
    key_binding: z.string().min(1),
    timestamp: z.string().min(1),
    verifier_id: z.string().min(1),
  }),
});

const HistoryQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
});

// ---------------------------------------------------------------------------
// Error handler — converts VerificationError to HTTP responses consistently
// ---------------------------------------------------------------------------

function handleServiceError(err: unknown, res: Response): void {
  if (err instanceof VerificationError) {
    res
      .status(err.statusCode)
      .json(failure(err.message, err.statusCode, { code: err.code, ...err.details }));
    return;
  }
  // Re-throw unknown errors to the global error middleware
  throw err;
}

// ---------------------------------------------------------------------------
// POST /api/v1/verification/sessions — API-030 (FR-043)
// The Service Provider's SERVER opens a session with its API key. Returns the
// session ID and a backend-generated single-use nonce to embed in its page.
// ---------------------------------------------------------------------------

router.post(
  "/sessions",
  requireApiKey,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(422)
          .json(failure(parsed.error.issues[0]?.message ?? "Validation failed"));
        return;
      }

      const result = await verificationService.createSession({
        ...parsed.data,
        verifierId: req.verifier!.id,
        configuredPredicates: req.verifier!.requiredPredicates,
      });
      res.status(201).json(success(result));
    } catch (err) {
      if (err instanceof VerificationError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/verification/sessions/:id/outcome — API-031 (FR-045)
// The Service Provider's server reads the outcome with its API key.
// ---------------------------------------------------------------------------

router.get(
  "/sessions/:id/outcome",
  requireApiKey,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id;
      if (!UuidSchema.safeParse(id).success) {
        res.status(422).json(failure("Invalid session ID"));
        return;
      }

      const result = await verificationService.getSessionOutcome(
        id as string,
        req.verifier!.id,
      );
      res.status(200).json(success(result));
    } catch (err) {
      if (err instanceof VerificationError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/verification/request — API-032 (FR-032, FR-019)
// The browser extension relays a session it detected on a page. Authenticated
// by the extension's pairing token only — the SP's API key never reaches the
// browser. Returns a poll secret for API-033.
// ---------------------------------------------------------------------------

router.post(
  "/request",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = RelayRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(422)
          .json(failure(parsed.error.issues[0]?.message ?? "Validation failed"));
        return;
      }

      const result = await verificationService.relayRequest({
        ...parsed.data,
        pairingToken: req.header(PAIRING_TOKEN_HEADER) ?? "",
      });
      res.status(200).json(success(result));
    } catch (err) {
      if (err instanceof VerificationError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/verification/request/:id — API-033 (FR-034, FR-045)
// Polled by the browser extension with the poll secret it got from API-032.
// ---------------------------------------------------------------------------

router.get(
  "/request/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id;
      if (!UuidSchema.safeParse(id).success) {
        res.status(422).json(failure("Invalid verification request ID"));
        return;
      }

      const pollSecret = req.header(POLL_SECRET_HEADER);
      if (!pollSecret) {
        res.status(401).json(failure(`Missing ${POLL_SECRET_HEADER} header`));
        return;
      }

      const result = await verificationService.pollForExtension(
        id as string,
        pollSecret,
      );
      res.status(200).json(success(result));
    } catch (err) {
      if (err instanceof VerificationError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/verification/submit-proof — API-035 (FR-044, ALG-002)
// Called by the device after the End User approves. Device JWT. Runs ALG-002;
// the session closes as VERIFIED or FAILED either way (single-use nonce).
// ---------------------------------------------------------------------------

router.post(
  "/submit-proof",
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = SubmitProofSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(422)
          .json(
            failure(parsed.error.issues[0]?.message ?? "Validation failed"),
          );
        return;
      }

      const user_id = req.user?.sub;
      if (!user_id) {
        // Should be impossible if verifyJWT ran — defensive guard
        res.status(401).json(failure("User identity missing from token"));
        return;
      }

      const result = await verificationService.submitProof({
        verification_requestId: parsed.data.verification_requestId,
        proof: parsed.data.proof as Proof,
        user_id,
      });

      res.status(200).json(success(result));
    } catch (err) {
      if (err instanceof VerificationError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/verification/reject/:id — API-036 (FR-023): the End User declines.
// POST /api/v1/verification/fail/:id   — API-037 (FR-025): no valid credential
// carries the requested predicate.
// ---------------------------------------------------------------------------

function answerRoute(
  action: (id: string, userId: string) => Promise<unknown>,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id;
      if (!UuidSchema.safeParse(id).success) {
        res.status(422).json(failure("Invalid verification request ID"));
        return;
      }

      const user_id = req.user?.sub;
      if (!user_id) {
        res.status(401).json(failure("User identity missing from token"));
        return;
      }

      res.status(200).json(success(await action(id as string, user_id)));
    } catch (err) {
      if (err instanceof VerificationError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  };
}

router.post(
  "/reject/:id",
  verifyJWT,
  answerRoute((id, userId) => verificationService.rejectRequest(id, userId)),
);

router.post(
  "/fail/:id",
  verifyJWT,
  answerRoute((id, userId) => verificationService.failRequest(id, userId)),
);

// ---------------------------------------------------------------------------
// GET /api/v1/verification/pending
// Requests routed to the signed-in End User that await approval (UC-004).
// ---------------------------------------------------------------------------

router.get(
  "/pending",
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await verificationService.getPendingForUser(req.user!.sub);
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/verification/history
// Returns this user's paginated verification history.
// ---------------------------------------------------------------------------

router.get(
  "/history",
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = HistoryQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res
          .status(422)
          .json(
            failure(parsed.error.issues[0]?.message ?? "Invalid query params"),
          );
        return;
      }

      const user_id = req.user?.sub;
      if (!user_id) {
        res.status(401).json(failure("User identity missing from token"));
        return;
      }

      const { page, limit } = parsed.data;
      const result = await verificationService.getHistory(user_id, page, limit);

      res.status(200).json({
        success: true,
        data: result.data,
        page: result.page,
        limit: result.limit,
        total: result.total,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof VerificationError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

export default router;
