import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { verifyJWT } from "../middleware/auth.middleware.js";
import {
  credentialsService,
  CredentialsError,
} from "../services/credentials.service.js";
import { success, failure } from "../lib/response.js";
import type { SDJWTCredential } from "@nexusid/types";

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/v1/credentials/linkedin/_internal/complete
// Called server-to-server by the LinkedIn issuer once its OAuth callback
// finishes — the browser popup lands there directly, so this is the only
// way the backend learns the outcome. No user JWT exists for this call;
// gated by a shared secret instead. Registered BEFORE router.use(verifyJWT)
// below so it's exempt from that auth requirement.
// ---------------------------------------------------------------------------

const LinkedinCompleteSchema = z.union([
  z.object({
    success: z.literal(true),
    state: z.string().uuid(),
    credential: z.unknown(),
  }),
  z.object({
    success: z.literal(false),
    state: z.string().uuid(),
    error: z.string(),
  }),
]);

router.post(
  "/linkedin/_internal/complete",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const secret = req.headers["x-internal-secret"];
      const expected =
        process.env.INTERNAL_SERVICE_SECRET ?? "dev-internal-secret";
      if (secret !== expected) {
        res.status(401).json(failure("Invalid internal service secret"));
        return;
      }

      const parsed = LinkedinCompleteSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(422)
          .json(
            failure(parsed.error.issues[0]?.message ?? "Validation failed"),
          );
        return;
      }

      if (parsed.data.success) {
        await credentialsService.recordLinkedinCompletion(parsed.data.state, {
          success: true,
          credential: parsed.data.credential as SDJWTCredential,
        });
      } else {
        await credentialsService.recordLinkedinCompletion(parsed.data.state, {
          success: false,
          error: parsed.data.error,
        });
      }

      res.status(200).json(success({ acknowledged: true }));
    } catch (err) {
      next(err);
    }
  },
);

// All credential-wallet routes below this line require an authenticated user.
router.use(verifyJWT);

// ---------------------------------------------------------------------------
// Error handler — converts CredentialsError to HTTP responses consistently
// ---------------------------------------------------------------------------

function handleServiceError(err: unknown, res: Response): void {
  if (err instanceof CredentialsError) {
    res.status(err.statusCode).json(failure(err.message));
    return;
  }
  throw err;
}

// ---------------------------------------------------------------------------
// GET /api/v1/credentials — list the authenticated user's credentials
// ---------------------------------------------------------------------------

router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const credentials = await credentialsService.listCredentials(userId);
      res.status(200).json(success(credentials));
    } catch (err) {
      if (err instanceof CredentialsError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

// ---------------------------------------------------------------------------
// NADRA — two-step verify / verify-otp
// ---------------------------------------------------------------------------

const NadraVerifySchema = z.object({
  cnic: z.string().min(1, "cnic is required"),
  phone: z.string().min(1, "phone is required"),
});

router.post(
  "/nadra/verify",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = NadraVerifySchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(422)
          .json(
            failure(parsed.error.issues[0]?.message ?? "Validation failed"),
          );
        return;
      }

      const data = await credentialsService.proxyNadraVerify(parsed.data);
      res.status(200).json(data);
    } catch (err) {
      if (err instanceof CredentialsError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

const NadraVerifyOtpSchema = z.object({
  session_id: z.string().uuid("session_id must be a UUID"),
  otp: z.string().length(6, "otp must be 6 digits"),
  user_public_key: z.string().min(1, "user_public_key is required"),
});

router.post(
  "/nadra/verify-otp",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = NadraVerifyOtpSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(422)
          .json(
            failure(parsed.error.issues[0]?.message ?? "Validation failed"),
          );
        return;
      }

      const userId = req.user!.sub;
      const data = await credentialsService.proxyNadraVerifyOtp(
        parsed.data,
        userId,
      );
      res.status(200).json(data);
    } catch (err) {
      if (err instanceof CredentialsError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

// ---------------------------------------------------------------------------
// HEC — single-step verify
// ---------------------------------------------------------------------------

const HecVerifySchema = z.object({
  degree_number: z.string().min(1, "degree_number is required"),
  university: z.string().min(1, "university is required"),
  student_name: z.string().min(1, "student_name is required"),
  user_public_key: z.string().min(1, "user_public_key is required"),
});

router.post(
  "/hec/verify",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = HecVerifySchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(422)
          .json(
            failure(parsed.error.issues[0]?.message ?? "Validation failed"),
          );
        return;
      }

      const userId = req.user!.sub;
      const data = await credentialsService.proxyHecVerify(parsed.data, userId);
      res.status(200).json(data);
    } catch (err) {
      if (err instanceof CredentialsError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

// ---------------------------------------------------------------------------
// Air University — single-step scrape
// ---------------------------------------------------------------------------

const AuScrapeSchema = z.object({
  username: z.string().min(1, "username is required"),
  password: z.string().min(1, "password is required"),
  otp: z.string().length(6).optional(),
  user_public_key: z.string().min(1, "user_public_key is required"),
});

router.post(
  "/au/scrape",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = AuScrapeSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(422)
          .json(
            failure(parsed.error.issues[0]?.message ?? "Validation failed"),
          );
        return;
      }

      const userId = req.user!.sub;
      const data = await credentialsService.proxyAuScrape(parsed.data, userId);
      res.status(200).json(data);
    } catch (err) {
      if (err instanceof CredentialsError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

// ---------------------------------------------------------------------------
// LinkedIn — auth-url -> popup -> callback -> poll /status, plus the
// synchronous /issue path for code+state obtained out of band. In sandbox
// mode auth-url points at the issuer's own mock consent page (there's no
// real LinkedIn app behind our sandbox client id), and the issuer notifies
// this backend server-to-server via /linkedin/_internal/complete once its
// callback finishes, since the popup lands there directly.
// ---------------------------------------------------------------------------

router.get(
  "/linkedin/auth-url",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const data = await credentialsService.proxyLinkedinAuthUrl(userId);
      res.status(200).json(data);
    } catch (err) {
      if (err instanceof CredentialsError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

router.get("/linkedin/status", (req: Request, res: Response): void => {
  const userId = req.user!.sub;
  const result = credentialsService.getLinkedinStatus(userId);
  res.status(200).json(success(result));
});

const LinkedinIssueSchema = z.object({
  code: z.string().min(1, "code is required"),
  state: z.string().uuid("state must be a UUID"),
  user_public_key: z.string().min(1, "user_public_key is required"),
});

router.post(
  "/linkedin/issue",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = LinkedinIssueSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(422)
          .json(
            failure(parsed.error.issues[0]?.message ?? "Validation failed"),
          );
        return;
      }

      const userId = req.user!.sub;
      const data = await credentialsService.proxyLinkedinIssue(
        parsed.data,
        userId,
      );
      res.status(200).json(data);
    } catch (err) {
      if (err instanceof CredentialsError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

// ---------------------------------------------------------------------------
// Revocation — checked and set against our own Credential row (source of
// truth for this deployment), with a best-effort fail-open cross-check
// against the Fabric chain audit trail (blockchain.service.ts).
// ---------------------------------------------------------------------------

router.get(
  "/:id/revocation",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const result = await credentialsService.checkRevocation(
        String(req.params.id),
        userId,
      );
      res.status(200).json(success(result));
    } catch (err) {
      if (err instanceof CredentialsError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

const RevokeSchema = z.object({
  reason: z.string().min(1, "reason is required"),
});

router.post(
  "/:id/revoke",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = RevokeSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(422)
          .json(
            failure(parsed.error.issues[0]?.message ?? "Validation failed"),
          );
        return;
      }

      const userId = req.user!.sub;
      await credentialsService.revokeCredential(
        String(req.params.id),
        userId,
        parsed.data.reason,
      );
      res.status(200).json(success({ revoked: true }));
    } catch (err) {
      if (err instanceof CredentialsError) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  },
);

export default router;
