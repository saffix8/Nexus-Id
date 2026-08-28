import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { router } from './routes';

const app = express();
const PORT = parseInt(process.env.PORT ?? '4002', 10);

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({ origin: '*' })); // Tighten in production
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hec-issuer', timestamp: new Date().toISOString() });
});

// JWKS endpoint (must be accessible at root well-known path)
app.use('/', router);

// Credential issuance endpoints
app.use('/api/v1/credentials/hec', router);

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev && err instanceof Error) {
    console.error('[HECIssuer]', err.stack);
  } else {
    console.error('[HECIssuer] Unhandled error:', err instanceof Error ? err.message : err);
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[HECIssuer] Running on http://localhost:${PORT}`);
  console.log(`[HECIssuer] Endpoint: POST http://localhost:${PORT}/api/v1/credentials/hec/verify`);
  console.log(`[HECIssuer] JWKS:     GET  http://localhost:${PORT}/.well-known/jwks.json`);
  console.log(`[HECIssuer] HEC API base: ${process.env.HEC_BASE_URL ?? 'https://api.hec.gov.pk/degree-verification/v2'}`);

  if (!process.env.HEC_API_KEY) {
    console.warn('[HECIssuer] WARNING: HEC_API_KEY is not set — live verification will fail');
  }
});

export default app;