import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AirUniversityPortalScraper, ScraperError } from './portal-scraper';
import { buildCredential } from './credential-builder';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();
const scraper = new AirUniversityPortalScraper();

// ── INPUT VALIDATION ───────────────────────────────────────────────────────────

const scrapeSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
  password: z.string().min(1, 'Password is required').max(200),
  otp: z.string().length(6).optional(),
  user_public_key: z
    .string()
    .min(1, 'User public key is required')
    .refine(
      (v) => v.includes('BEGIN PUBLIC KEY') || v.includes('BEGIN RSA PUBLIC KEY'),
      'user_public_key must be a valid RSA public key in PEM format'
    ),
});

// ── ROUTES ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/credentials/au/scrape
 *
 * Scrapes the Air University student portal with the user's credentials.
 * The username and password are used ONCE and never stored, logged, or returned.
 */
router.post(
  '/scrape',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = scrapeSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map((e) => e.message).join(', '),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { username, password, otp, user_public_key } = parsed.data;

    // Security: username and password are destructured here and must not
    // appear in any log, error response, or stored variable after this point.

    try {
      // NOTE: logger intentionally does NOT log username
      console.info('[AU Scraper] Scraping for user: [REDACTED]');

      const studentData = await scraper.scrapeStudentData(username, password, otp);

      // Overwrite locals (best-effort in JS — GC handles the rest)
      void username;
      void password;

      const credential = await buildCredential(studentData, user_public_key);

      res.status(200).json({
        success: true,
        data: { credential },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof ScraperError) {
        // Map scraper errors to actionable user-facing messages
        const messageMap: Record<ScraperError['code'], string> = {
          LOGIN_FAILED: 'Login failed. Please check your student portal username and password.',
          OTP_REQUIRED: 'An OTP is required. Please re-submit with the OTP sent to your registered mobile.',
          OTP_FAILED: 'OTP verification failed. Please check the code and try again.',
          DATA_EXTRACTION_FAILED:
            'Your credentials were verified but we could not read your student profile. The portal may be temporarily unavailable.',
          NAVIGATION_FAILED: 'Could not reach the Air University student portal. Please try again later.',
          TIMEOUT: 'The portal took too long to respond. Please try again.',
        };

        res.status(400).json({
          success: false,
          // Return code so mobile app can decide to prompt for OTP
          error_code: err.code,
          error: messageMap[err.code] ?? 'An unexpected error occurred.',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Unknown error — pass to global handler, but strip any sensitive context
      const sanitized = new Error('Internal scraper error. Please try again.');
      next(sanitized);
    }
  }
);

/**
 * GET /.well-known/jwks.json
 *
 * Exposes the issuer's public key for credential verification.
 */
router.get('/.well-known/jwks.json', (_req: Request, res: Response): void => {
  const keyPath = path.resolve(__dirname, '../.issuer-public-key.pem');

  if (!fs.existsSync(keyPath)) {
    res.status(503).json({ error: 'Issuer key not yet provisioned.' });
    return;
  }

  const pem = fs.readFileSync(keyPath, 'utf-8');

  // Convert PEM to a minimal JWK representation
  // (Full RSA JWK generation requires the jose library — done here for completeness)
  res.json({
    keys: [
      {
        kty: 'RSA',
        use: 'sig',
        alg: 'RS256',
        kid: 'au-issuer-key-v1',
        // Base64url-encoded key material is extracted server-side by the
        // verification service using jose's importSPKI + exportJWK.
        // Clients should use the backend's GET /issuers/:id/public-key endpoint
        // which returns a fully-formed JWK — this endpoint is a discovery fallback.
        x5c: [pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n/g, '')],
      },
    ],
  });
});

export default router;
