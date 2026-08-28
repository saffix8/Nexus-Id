import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { nadraClient, NadraVerificationError, type NadraPersonData } from './verisys-client';
import { buildCredential, CredentialBuildError } from './credential-builder';

const router = Router();

// ── In-memory session store ────────────────────────────────────────────────
// Stores NADRA person data between /verify and /verify-otp steps.
// In production: replace with Redis with a 5-minute TTL.

interface PendingSession {
  otp: string;
  nadraData: NadraPersonData;
  createdAt: number;
}

const sessions = new Map<string, PendingSession>();
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

function generateOTP(): string {
  return Math.floor(100_000 + Math.random() * 900_000).toString();
}

// ── Input schemas ──────────────────────────────────────────────────────────

const verifySchema = z.object({
  cnic:  z.string().regex(/^\d{5}-\d{7}-\d$/, 'CNIC must be in format 12345-1234567-1'),
  phone: z.string().min(10, 'Phone number too short').max(15, 'Phone number too long'),
});

const verifyOtpSchema = z.object({
  session_id:      z.string().uuid('Invalid session_id'),
  otp:             z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
  user_public_key: z.string().min(100, 'Invalid RSA public key'),
});

// ── POST /verify ───────────────────────────────────────────────────────────

router.post('/verify', async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error:   parsed.error.errors[0]?.message ?? 'Validation failed',
      timestamp: new Date().toISOString(),
    });
  }

  const { cnic, phone } = parsed.data;

  try {
    const nadraData = await nadraClient.verifyCNIC(cnic, phone);

    pruneExpiredSessions();

    const sessionId = uuidv4();
    const otp = generateOTP();

    sessions.set(sessionId, {
      otp,
      nadraData,
      createdAt: Date.now(),
    });

    // In sandbox mode, log OTP for testing. Never do this in production.
    if (process.env.NADRA_USE_SANDBOX === 'true') {
      console.log(`[SANDBOX] OTP for session ${sessionId}: ${otp}`);
    }

    // In production: send OTP via NADRA's SMS gateway or your own SMS service

    return res.status(200).json({
      success:    true,
      data:       { session_id: sessionId, status: 'otp_sent' },
      timestamp:  new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof NadraVerificationError) {
      return res.status(422).json({
        success: false,
        error:   err.message,
        code:    err.code,
        timestamp: new Date().toISOString(),
      });
    }

    console.error('[NADRA /verify] Unexpected error:', err);
    return res.status(500).json({
      success:   false,
      error:     'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
});

// ── POST /verify-otp ───────────────────────────────────────────────────────

router.post('/verify-otp', async (req: Request, res: Response) => {
  const parsed = verifyOtpSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error:   parsed.error.errors[0]?.message ?? 'Validation failed',
      timestamp: new Date().toISOString(),
    });
  }

  const { session_id, otp, user_public_key } = parsed.data;

  const session = sessions.get(session_id);

  if (!session) {
    return res.status(404).json({
      success:   false,
      error:     'Session not found or expired. Please restart verification.',
      timestamp: new Date().toISOString(),
    });
  }

  const sessionAge = Date.now() - session.createdAt;
  if (sessionAge > SESSION_TTL_MS) {
    sessions.delete(session_id);
    return res.status(410).json({
      success:   false,
      error:     'Session expired. Please restart verification.',
      timestamp: new Date().toISOString(),
    });
  }

  if (session.otp !== otp) {
    return res.status(401).json({
      success:   false,
      error:     'Invalid OTP. Please check and try again.',
      timestamp: new Date().toISOString(),
    });
  }

  // OTP is single-use
  sessions.delete(session_id);

  try {
    const credential = await buildCredential(session.nadraData, user_public_key);

    return res.status(200).json({
      success:   true,
      data:      { credential },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof CredentialBuildError) {
      console.error('[NADRA /verify-otp] Credential build error:', err.message);
      return res.status(500).json({
        success:   false,
        error:     'Failed to issue credential. Please try again.',
        timestamp: new Date().toISOString(),
      });
    }

    console.error('[NADRA /verify-otp] Unexpected error:', err);
    return res.status(500).json({
      success:   false,
      error:     'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
});

// ── GET /.well-known/jwks.json ─────────────────────────────────────────────
// Exposes NADRA issuer public key so the backend verifier can validate
// credentials issued by this service.

router.get('/.well-known/jwks.json', async (_req: Request, res: Response) => {
  const publicKeyPem = process.env.NADRA_ISSUER_PUBLIC_KEY;

  if (!publicKeyPem) {
    return res.status(503).json({ error: 'Issuer public key not configured' });
  }

  // Parse RSA PEM → JWK-compatible key components
  // For a production system, use jose's exportJWK. We expose minimal metadata here.
  return res.status(200).json({
    keys: [
      {
        kty: 'RSA',
        use: 'sig',
        alg: 'RS256',
        kid: 'nadra-key-v1',
        // The backend fetches this URL and stores/caches the PEM.
        // Full JWK export requires key parsing — done at startup in generate-issuer-keys.ts.
        x5c: [publicKeyPem.replace(/-----[^-]+-----/g, '').replace(/\n/g, '')],
      },
    ],
  });
});

export default router;
