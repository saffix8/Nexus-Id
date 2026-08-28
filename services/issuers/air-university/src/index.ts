import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import router from './routes';

const app = express();
const PORT = parseInt(process.env.PORT ?? '4003', 10);

// ── SECURITY MIDDLEWARE ────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000', 'http://localhost:4000'] }));
app.use(express.json({ limit: '16kb' })); // Small limit — no file uploads expected

// ── RATE LIMITING ──────────────────────────────────────────────────────────────
// Strict limit: scraping the portal is expensive and credentials should
// never be submitted in bulk. 5 requests per minute per IP.

const scrapeLimiter = rateLimit({
  windowMs: 60 * 1000,         // 1 minute
  max: 5,                       // 5 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. You may only attempt portal verification 5 times per minute.',
    timestamp: new Date().toISOString(),
  },
  // Log attempts (but NOT request body — which contains credentials)
  handler: (req, res, _next, options) => {
    console.warn(`[AU Scraper] Rate limit hit from IP: ${req.ip}`);
    res.status(429).json(options.message);
  },
});

// ── ROUTES ─────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'au-issuer', timestamp: new Date().toISOString() });
});

// Apply rate limit only to the scrape endpoint
app.use('/api/v1/credentials/au', scrapeLimiter, router);

// JWKS endpoint is rate-limited more leniently (it's just a public key)
app.get('/.well-known/jwks.json', router);

// ── GLOBAL ERROR HANDLER ───────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // CRITICAL: never echo error details that might contain request body fragments
  console.error('[AU Scraper] Unhandled error:', err.message);

  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred. Please try again.',
    timestamp: new Date().toISOString(),
  });
});

// ── START ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.info(`[AU Scraper] Issuer service running on port ${PORT}`);
});

export default app;
