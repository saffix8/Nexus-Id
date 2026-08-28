import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { hecClient, HECDegreeNotFoundError, HECClientError } from './hec-client';
import { buildCredential, CredentialBuildError } from './credential-builder';
import type { ApiResponse } from '@nexusid/types';
import type { SDJWTCredential } from '@nexusid/types';

export const router = Router();

// ─── Input schema ────────────────────────────────────────────────────────────

const verifyBodySchema = z.object({
  degree_number: z
    .string()
    .min(1, 'degree_number is required')
    .max(100)
    .trim(),
  university: z
    .string()
    .min(1, 'university is required')
    .max(200)
    .trim(),
  student_name: z
    .string()
    .min(1, 'student_name is required')
    .max(200)
    .trim(),
  user_public_key: z
    .string()
    .min(1, 'user_public_key is required')
    .refine(
      (v) => v.includes('BEGIN') && v.includes('PUBLIC KEY'),
      'user_public_key must be a valid PEM-encoded RSA public key',
    ),
});

type VerifyBody = z.infer<typeof verifyBodySchema>;

// ─── POST /api/v1/credentials/hec/verify ─────────────────────────────────────

router.post(
  '/verify',
  async (
    req: Request<unknown, ApiResponse<{ credential: SDJWTCredential }>, VerifyBody>,
    res: Response<ApiResponse<{ credential: SDJWTCredential }>>,
    next: NextFunction,
  ) => {
    // 1. Validate input
    const parseResult = verifyBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((i) => i.message).join('; '),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { degree_number, university, student_name, user_public_key } =
      parseResult.data;

    try {
      // 2. Verify with HEC API
      const { degree_details } = await hecClient.verifyDegree({
        degree_number,
        university,
        student_name,
      });

      // 3. Build SD-JWT credential
      const credential = await buildCredential(degree_details, user_public_key);

      // 4. Return credential to caller
      res.status(200).json({
        success: true,
        data: { credential },
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      if (err instanceof HECDegreeNotFoundError) {
        res.status(404).json({
          success: false,
          error: err.message,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (err instanceof HECClientError) {
        const status = err.statusCode === 401 ? 502 : 502;
        res.status(status).json({
          success: false,
          error: `HEC verification service error: ${err.message}`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (err instanceof CredentialBuildError) {
        res.status(500).json({
          success: false,
          error: `Failed to issue credential: ${err.message}`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      next(err);
    }
  },
);

// ─── GET /.well-known/jwks.json ───────────────────────────────────────────────
// Returns the HEC issuer's public key in JWK Set format so verifiers can
// validate credential signatures without contacting this service directly.

router.get('/.well-known/jwks.json', async (_req, res, next) => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { importSPKI, exportJWK } = await import('jose');

    const keyPath = path.resolve(__dirname, '../../.keys/issuer-public-key.pem');

    let publicKeyPEM: string;
    if (process.env.HEC_ISSUER_PUBLIC_KEY) {
      publicKeyPEM = process.env.HEC_ISSUER_PUBLIC_KEY.replace(/\\n/g, '\n');
    } else if (fs.existsSync(keyPath)) {
      publicKeyPEM = fs.readFileSync(keyPath, 'utf8');
    } else {
      res.status(503).json({ error: 'Issuer public key not yet generated' });
      return;
    }

    const publicKey = await importSPKI(publicKeyPEM, 'RS256');
    const jwk = await exportJWK(publicKey);

    res.status(200).json({
      keys: [
        {
          ...jwk,
          kty: 'RSA',
          use: 'sig',
          alg: 'RS256',
          kid: 'hec-issuer-key-v1',
        },
      ],
    });
  } catch (err) {
    next(err);
  }
});
