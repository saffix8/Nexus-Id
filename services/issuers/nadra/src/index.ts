import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import nadraRouter from './routes';

dotenv.config();

const app = express();
const PORT = process.env.NADRA_PORT ?? 4001;

// ── Middleware ─────────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*' }));
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    service:   'nadra-issuer',
    sandbox:   process.env.NADRA_USE_SANDBOX === 'true',
    timestamp: new Date().toISOString(),
  });
});

// JWKS endpoint at root level (non-prefixed) for standard discovery
app.get('/.well-known/jwks.json', (_req, res) => {
  const publicKeyPem = process.env.NADRA_ISSUER_PUBLIC_KEY;

  if (!publicKeyPem) {
    return res.status(503).json({ error: 'Issuer public key not configured' });
  }

  return res.json({
    keys: [
      {
        kty: 'RSA',
        use: 'sig',
        alg: 'RS256',
        kid: 'nadra-key-v1',
        x5c: [publicKeyPem.replace(/-----[^-]+-----/g, '').replace(/\n/g, '')],
      },
    ],
  });
});

app.use('/api/v1/credentials/nadra', nadraRouter);

// ── Global error handler ───────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[NADRA Issuer] Unhandled error:', err);
  res.status(500).json({
    success:   false,
    error:     process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    timestamp: new Date().toISOString(),
  });
});

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  const mode = process.env.NADRA_USE_SANDBOX === 'true' ? 'SANDBOX' : 'PRODUCTION';
  console.log(`[NADRA Issuer] Running on port ${PORT} — ${mode} mode`);
  console.log(`[NADRA Issuer] Health: http://localhost:${PORT}/health`);
  console.log(`[NADRA Issuer] JWKS:   http://localhost:${PORT}/.well-known/jwks.json`);
});

export default app;
