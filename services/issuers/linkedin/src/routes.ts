import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { linkedInOAuthClient, LinkedInOAuthError } from './oauth-client.js';
import { buildCredential, EmploymentExtractorError } from './employment-extractor.js';
import type { ApiResponse, SDJWTCredential } from '@nexusid/types';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function success<T>(data: T): ApiResponse<T> {
  return { success: true, data, timestamp: new Date().toISOString() };
}

function failure(error: string): ApiResponse<never> {
  return { success: false, error, timestamp: new Date().toISOString() };
}

// ── GET /api/v1/credentials/linkedin/auth-url ─────────────────────────────────

router.get('/auth-url', (_req: Request, res: Response) => {
  try {
    const auth_url = linkedInOAuthClient.getAuthorizationURL();
    return res.json(success({ auth_url }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate authorization URL';
    return res.status(500).json(failure(message));
  }
});

// ── GET /api/v1/credentials/linkedin/callback ─────────────────────────────────

const callbackQuerySchema = z.object({
  code:  z.string().min(1, 'Authorization code is required'),
  state: z.string().uuid('State must be a valid UUID'),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

router.get('/callback', async (req: Request, res: Response) => {
  // LinkedIn sends an error param if the user denied access
  if (req.query.error) {
    const description = String(req.query.error_description ?? 'User denied access');
    return res.redirect(
      `nexusid://credential-added?status=error&reason=${encodeURIComponent(description)}`
    );
  }

  const parsed = callbackQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => e.message).join('; ');
    return res.redirect(
      `nexusid://credential-added?status=error&reason=${encodeURIComponent(errors)}`
    );
  }

  const { code, state } = parsed.data;

  // user_public_key is passed via the state in production flows, but for the
  // prototype we read it from the session store keyed on state. Here we accept
  // it as an optional query param for integration testing purposes.
  const userPublicKey = req.query.user_public_key as string | undefined;

  try {
    const accessToken = await linkedInOAuthClient.exchangeCodeForToken(code, state);

    const [profile, positions] = await Promise.all([
      linkedInOAuthClient.getProfile(accessToken),
      linkedInOAuthClient.getPositions(accessToken),
    ]);

    // If no public key was provided we cannot issue a bound credential.
    // Redirect with the raw profile so the mobile app can retry with a key.
    if (!userPublicKey) {
      const profileParam = encodeURIComponent(JSON.stringify({ id: profile.id, firstName: profile.firstName }));
      return res.redirect(
        `nexusid://credential-added?status=pending&profile=${profileParam}`
      );
    }

    const credential = await buildCredential(profile, positions, userPublicKey);

    const credParam = encodeURIComponent(JSON.stringify(credential));
    return res.redirect(
      `nexusid://credential-added?status=success&credential=${credParam}`
    );
  } catch (err) {
    let reason = 'Unknown error during LinkedIn verification';

    if (err instanceof LinkedInOAuthError) {
      reason = err.message;
    } else if (err instanceof EmploymentExtractorError) {
      reason = err.message;
    } else if (err instanceof Error) {
      reason = err.message;
    }

    return res.redirect(
      `nexusid://credential-added?status=error&reason=${encodeURIComponent(reason)}`
    );
  }
});

// ── POST /api/v1/credentials/linkedin/issue ───────────────────────────────────
// Alternative JSON endpoint for web dashboard flow (no deep-link redirect needed)

const issueBodySchema = z.object({
  code:            z.string().min(1),
  state:           z.string().uuid(),
  user_public_key: z.string().min(1, 'user_public_key is required'),
});

router.post('/issue', async (req: Request, res: Response) => {
  const parsed = issueBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => e.message).join('; ');
    return res.status(400).json(failure(errors));
  }

  const { code, state, user_public_key } = parsed.data;

  try {
    const accessToken = await linkedInOAuthClient.exchangeCodeForToken(code, state);

    const [profile, positions] = await Promise.all([
      linkedInOAuthClient.getProfile(accessToken),
      linkedInOAuthClient.getPositions(accessToken),
    ]);

    const credential: SDJWTCredential = await buildCredential(profile, positions, user_public_key);

    return res.status(201).json(success({ credential }));
  } catch (err) {
    if (err instanceof LinkedInOAuthError) {
      return res.status(400).json(failure(err.message));
    }
    if (err instanceof EmploymentExtractorError) {
      return res.status(500).json(failure(err.message));
    }
    const message = err instanceof Error ? err.message : 'Credential issuance failed';
    return res.status(500).json(failure(message));
  }
});

// ── GET /.well-known/jwks.json ────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';
import { createPublicKey } from 'crypto';

router.get('/.well-known/jwks.json', (_req: Request, res: Response) => {
  try {
    const keyPath = process.env.LINKEDIN_ISSUER_PUBLIC_KEY_PATH
      ?? join(process.cwd(), '.keys', 'issuer-public-key.pem');

    const pem = readFileSync(keyPath, 'utf-8');
    const keyObject = createPublicKey(pem);
    const jwk = keyObject.export({ format: 'jwk' });

    return res.json({
      keys: [{
        ...jwk,
        use: 'sig',
        kid: 'linkedin-issuer-key-v1',
        alg: 'RS256',
      }],
    });
  } catch {
    return res.status(503).json(failure('Public key not yet configured'));
  }
});

export default router;
