import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { errorMiddleware } from './middleware/error.middleware.js';
import { notificationService } from './services/notification.service.js';

// Route imports
import authRouter from './routes/auth.route.js';
import usersRouter from './routes/users.route.js';
// import credentialsRouter from './routes/credentials.route';
import verificationRouter from './routes/verification.route.js';
import verifiersRouter from './routes/verifiers.route.js';
import issuersRouter from './routes/issuers.route.js';
import analyticsRouter from './routes/analytics.route.js';
import adminRouter from './routes/admin.route.js';

const PORT = Number(process.env.PORT) || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const API = '/api/v1';

export function createApp() {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS
  app.use(
    cors({
      origin:
        NODE_ENV === 'production'
          ? (process.env.ALLOWED_ORIGINS ?? '')
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean)
          : '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      credentials: true,
    })
  );

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Logging
  app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

  // Health check
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      version: process.env.npm_package_version ?? '1.0.0',
    });
  });

  // API routes
  app.use(`${API}/auth`, authRouter);
  app.use(`${API}/users`, usersRouter);
  // app.use(`${API}/credentials`, credentialsRouter);
  app.use(`${API}/verification`, verificationRouter);
  app.use(`${API}/verifiers`, verifiersRouter);
  app.use(`${API}/issuers`, issuersRouter);
  app.use(`${API}/analytics`, analyticsRouter);
  app.use(`${API}/admin`, adminRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: 'Route not found',
      timestamp: new Date().toISOString(),
    });
  });

  // Global error handler
  app.use(errorMiddleware);

  return app;
}

export const app = createApp();

async function bootstrap(): Promise<void> {
  try {
    notificationService.initialize();

    app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════╗
║         NexusID Backend API                  ║
╠══════════════════════════════════════════════╣
║  Status   : Running                          ║
║  Port     : ${String(PORT).padEnd(34)}║
║  Env      : ${NODE_ENV.padEnd(34)}║
║  Health   : http://localhost:${PORT}/health  ║
╚══════════════════════════════════════════════╝
      `.trim());
    });
  } catch (err) {
    console.error('Failed to start NexusID backend:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

// Do not auto-start when running tests
if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}