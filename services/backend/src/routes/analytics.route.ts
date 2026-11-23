// services/backend/src/routes/analytics.route.ts
// Programmatic analytics for a Service Provider's own backend, authenticated
// with its API key (same middleware as verification requests — keys are
// looked up by hash, see api-key.middleware.ts).
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { success } from '../lib/response.js';
import { requireApiKey } from '../middleware/api-key.middleware.js';

const router = Router();

// GET /api/v1/analytics/verifications
router.get('/verifications', requireApiKey, async (req, res, next) => {
  try {
    const verifierId = req.verifier!.id;
    const [total, requests] = await Promise.all([
      prisma.verificationRequest.count({ where: { verifierId } }),
      prisma.verificationRequest.findMany({
        where: { verifierId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    res.json(success({ total, recent: requests }));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/analytics/recent
router.get('/recent', requireApiKey, async (req, res, next) => {
  try {
    const recent = await prisma.verificationRequest.findMany({
      where: { verifierId: req.verifier!.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    res.json(success(recent));
  } catch (err) {
    next(err);
  }
});

export default router;
