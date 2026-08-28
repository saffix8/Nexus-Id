import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import router from './routes.js';
import type { Request, Response, NextFunction } from 'express';

const app = express();
const PORT = Number(process.env.PORT ?? 4004);

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({ origin: '*' })); // Tighten in production
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/v1/credentials/linkedin', router);

// JWKS endpoint at root well-known path (also mounted on router above for convenience)
app.use('/', router);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'linkedin-issuer', timestamp: new Date().toISOString() });
});

// ── Global Error Handler ──────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (process.env.NODE_ENV !== 'production') {
    console.error('[LinkedIn Issuer Error]', err.stack);
  } else {
    console.error('[LinkedIn Issuer Error]', err.message);
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[LinkedIn Issuer] Running on port ${PORT}`);
  console.log(`[LinkedIn Issuer] Health: http://localhost:${PORT}/health`);
  console.log(`[LinkedIn Issuer] JWKS:   http://localhost:${PORT}/.well-known/jwks.json`);
});

export default app;
