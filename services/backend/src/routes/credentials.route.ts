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

const router = Router();

// All credential-wallet routes require an authenticated user.
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
// LinkedIn — auth-url passthrough + synchronous issue
// NOTE: the OAuth redirect + status-polling flow (auth-url -> popup ->
// callback -> poll /status) is NOT implemented here. The LinkedIn issuer
// service has no /status endpoint and there is no session tracking between
// the callback and a poller. This only wires the auth-url passthrough and
// the synchronous /issue path (code + state obtained out of band). Flagging
// rather than building the full OAuth round-trip, which is a separate task.
// ---------------------------------------------------------------------------

router.get(
  "/linkedin/auth-url",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await credentialsService.proxyLinkedinAuthUrl();
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

export default router;
