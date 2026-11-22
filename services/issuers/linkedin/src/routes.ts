import { Router, type Request, type Response } from "express";
import { z } from "zod";
import axios from "axios";
import { linkedInOAuthClient, LinkedInOAuthError } from "./oauth-client.js";
import {
  buildCredential,
  EmploymentExtractorError,
} from "./employment-extractor.js";
import type { ApiResponse, SDJWTCredential } from "@nexusid/types";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function success<T>(data: T): ApiResponse<T> {
  return { success: true, data, timestamp: new Date().toISOString() };
}

function failure(error: string): ApiResponse<never> {
  return { success: false, error, timestamp: new Date().toISOString() };
}

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";
const INTERNAL_SECRET =
  process.env.INTERNAL_SERVICE_SECRET ?? "dev-internal-secret";

// Best-effort, fire-and-forget notification to the backend — the browser
// popup lands on /callback directly, so this is the only way the backend
// (which tracks the pending connection by `state`) learns the outcome.
async function notifyBackend(
  state: string,
  outcome:
    | { success: true; credential: SDJWTCredential }
    | { success: false; error: string },
): Promise<void> {
  try {
    await axios.post(
      `${BACKEND_URL}/api/v1/credentials/linkedin/_internal/complete`,
      { state, ...outcome },
      { headers: { "X-Internal-Secret": INTERNAL_SECRET }, timeout: 5000 },
    );
  } catch (err) {
    console.error(
      "[LinkedIn Issuer] Failed to notify backend of OAuth completion (non-fatal):",
      (err as Error).message,
    );
  }
}

// Renders the page the popup window lands on after the callback completes.
// Attempts the mobile deep link (harmless no-op in a desktop browser) and
// closes the popup shortly after, since window.close() requires the window
// to have been opened by script — true here, as AddCredentialModal opens
// this flow via window.open() in a click handler.
function renderPopupResult(
  res: Response,
  message: string,
  deepLink: string,
): void {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html>
<head><title>NexusID</title></head>
<body style="font-family: sans-serif; text-align: center; margin-top: 100px;">
  <p>${message}</p>
  <p style="color:#888; font-size: 13px;">You can close this window.</p>
  <script>
    try { window.location.href = ${JSON.stringify(deepLink)}; } catch (e) {}
    setTimeout(function () { try { window.close(); } catch (e) {} }, 1200);
  </script>
</body>
</html>`);
}

// ── GET /api/v1/credentials/linkedin/auth-url ─────────────────────────────────

router.get("/auth-url", (_req: Request, res: Response) => {
  try {
    const auth_url = linkedInOAuthClient.getAuthorizationURL();
    return res.json(success({ auth_url }));
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to generate authorization URL";
    return res.status(500).json(failure(message));
  }
});

// ── GET /api/v1/credentials/linkedin/mock-consent ─────────────────────────────
// Sandbox-only stand-in for LinkedIn's real consent screen. There is no real
// LinkedIn app behind our sandbox client id, so getAuthorizationURL() sends
// the browser here instead of to linkedin.com. Authorize/Deny both redirect
// back to the real redirect_uri (our own /callback) exactly like the real
// LinkedIn OAuth server would.

const mockConsentQuerySchema = z.object({
  state: z.string().uuid(),
  redirect_uri: z.string().url(),
});

router.get("/mock-consent", (req: Request, res: Response) => {
  if (process.env.LINKEDIN_USE_SANDBOX === "false") {
    return res.status(404).send("Not found");
  }

  const parsed = mockConsentQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).send("Missing or invalid state/redirect_uri");
  }

  const { state, redirect_uri } = parsed.data;

  const authorizeUrl = new URL(redirect_uri);
  authorizeUrl.searchParams.set("code", "sandbox-fake-code");
  authorizeUrl.searchParams.set("state", state);

  const denyUrl = new URL(redirect_uri);
  denyUrl.searchParams.set("error", "access_denied");
  denyUrl.searchParams.set("state", state);

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html>
<head><title>NexusID Sandbox — LinkedIn</title></head>
<body style="font-family: sans-serif; max-width: 420px; margin: 80px auto; text-align: center;">
  <h2 style="color:#0A66C2;">LinkedIn (Sandbox)</h2>
  <p>NexusID is requesting access to your profile and employment history.</p>
  <p style="color:#888; font-size: 13px;">This is a simulated consent screen — no real LinkedIn account is involved.</p>
  <a href="${authorizeUrl.toString()}" style="display:inline-block; margin:8px; padding:10px 20px; background:#0A66C2; color:white; text-decoration:none; border-radius:6px;">Authorize</a>
  <a href="${denyUrl.toString()}" style="display:inline-block; margin:8px; padding:10px 20px; background:#eee; color:#333; text-decoration:none; border-radius:6px;">Deny</a>
</body>
</html>`);
});

// ── GET /api/v1/credentials/linkedin/callback ─────────────────────────────────

const callbackQuerySchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
  state: z.string().uuid("State must be a valid UUID"),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

router.get("/callback", async (req: Request, res: Response) => {
  // LinkedIn sends an error param if the user denied access
  if (req.query.error) {
    const description = String(
      req.query.error_description ?? "User denied access",
    );
    const stateParam = req.query.state;
    if (typeof stateParam === "string") {
      await notifyBackend(stateParam, { success: false, error: description });
    }
    return renderPopupResult(
      res,
      "Authorization was denied.",
      `nexusid://credential-added?status=error&reason=${encodeURIComponent(description)}`,
    );
  }

  const parsed = callbackQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => e.message).join("; ");
    const stateParam = req.query.state;
    if (typeof stateParam === "string") {
      await notifyBackend(stateParam, { success: false, error: errors });
    }
    return renderPopupResult(
      res,
      "Something went wrong.",
      `nexusid://credential-added?status=error&reason=${encodeURIComponent(errors)}`,
    );
  }

  const { code, state } = parsed.data;

  // user_public_key is passed via the state in production flows, but for the
  // prototype we read it from the session store keyed on state. Here we accept
  // it as an optional query param for integration testing purposes.
  const userPublicKey = req.query.user_public_key as string | undefined;

  try {
    const accessToken = await linkedInOAuthClient.exchangeCodeForToken(
      code,
      state,
    );

    const [profile, positions] = await Promise.all([
      linkedInOAuthClient.getProfile(accessToken),
      linkedInOAuthClient.getPositions(accessToken),
    ]);

    // If no public key was provided we cannot issue a bound credential. This
    // is a real, separate gap — nothing in the web dashboard flow collects
    // a holder public key for ANY issuer today — not fixed here.
    if (!userPublicKey) {
      const reason =
        "No public key available for this holder — connect a device first.";
      await notifyBackend(state, { success: false, error: reason });
      const profileParam = encodeURIComponent(
        JSON.stringify({ id: profile.id, firstName: profile.firstName }),
      );
      return renderPopupResult(
        res,
        "Almost there — a device key is needed to finish.",
        `nexusid://credential-added?status=pending&profile=${profileParam}`,
      );
    }

    const credential = await buildCredential(profile, positions, userPublicKey);

    await notifyBackend(state, { success: true, credential });

    const credParam = encodeURIComponent(JSON.stringify(credential));
    return renderPopupResult(
      res,
      "LinkedIn connected successfully.",
      `nexusid://credential-added?status=success&credential=${credParam}`,
    );
  } catch (err) {
    let reason = "Unknown error during LinkedIn verification";

    if (err instanceof LinkedInOAuthError) {
      reason = err.message;
    } else if (err instanceof EmploymentExtractorError) {
      reason = err.message;
    } else if (err instanceof Error) {
      reason = err.message;
    }

    await notifyBackend(state, { success: false, error: reason });

    return renderPopupResult(
      res,
      "Something went wrong.",
      `nexusid://credential-added?status=error&reason=${encodeURIComponent(reason)}`,
    );
  }
});

// ── POST /api/v1/credentials/linkedin/issue ───────────────────────────────────
// Alternative JSON endpoint for web dashboard flow (no deep-link redirect needed)

const issueBodySchema = z.object({
  code: z.string().min(1),
  state: z.string().uuid(),
  user_public_key: z.string().min(1, "user_public_key is required"),
});

router.post("/issue", async (req: Request, res: Response) => {
  const parsed = issueBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => e.message).join("; ");
    return res.status(400).json(failure(errors));
  }

  const { code, state, user_public_key } = parsed.data;

  try {
    const accessToken = await linkedInOAuthClient.exchangeCodeForToken(
      code,
      state,
    );

    const [profile, positions] = await Promise.all([
      linkedInOAuthClient.getProfile(accessToken),
      linkedInOAuthClient.getPositions(accessToken),
    ]);

    const credential: SDJWTCredential = await buildCredential(
      profile,
      positions,
      user_public_key,
    );

    return res.status(201).json(success({ credential }));
  } catch (err) {
    if (err instanceof LinkedInOAuthError) {
      return res.status(400).json(failure(err.message));
    }
    if (err instanceof EmploymentExtractorError) {
      return res.status(500).json(failure(err.message));
    }
    const message =
      err instanceof Error ? err.message : "Credential issuance failed";
    return res.status(500).json(failure(message));
  }
});

// ── GET /.well-known/jwks.json ────────────────────────────────────────────────

import { readFileSync } from "fs";
import { join } from "path";
import { createPublicKey } from "crypto";

router.get("/.well-known/jwks.json", (_req: Request, res: Response) => {
  try {
    const keyPath =
      process.env.LINKEDIN_ISSUER_PUBLIC_KEY_PATH ??
      join(process.cwd(), ".keys", ".issuer-public-key.pem");

    const pem = readFileSync(keyPath, "utf-8");
    const keyObject = createPublicKey(pem);
    const jwk = keyObject.export({ format: "jwk" });

    return res.json({
      keys: [
        {
          ...jwk,
          use: "sig",
          kid: "linkedin-issuer-key-v1",
          alg: "RS256",
        },
      ],
    });
  } catch {
    return res.status(503).json(failure("Public key not yet configured"));
  }
});

export default router;
