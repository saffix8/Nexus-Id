// services/backend/src/routes/analytics.route.ts
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { success } from '../lib/response.js';

const router = Router();

// GET /api/v1/analytics/verifications  — auth via verifier api_key header, not user JWT
router.get('/verifications', async (req, res, next) => {
  try {
    const apiKey = req.header('x-api-key');
    const verifier = apiKey ? await prisma.verifier.findUnique({ where: { apiKey } }) : null;
    if (!verifier) return res.status(401).json({ success: false, error: 'Invalid API key' });

    const [total, requests] = await Promise.all([
      prisma.verificationRequest.count({ where: { verifierId: verifier.id } }),
      prisma.verificationRequest.findMany({
        where: { verifierId: verifier.id },
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
router.get('/recent', async (req, res, next) => {
  try {
    const apiKey = req.header('x-api-key');
    const verifier = apiKey ? await prisma.verifier.findUnique({ where: { apiKey } }) : null;
    if (!verifier) return res.status(401).json({ success: false, error: 'Invalid API key' });

    const recent = await prisma.verificationRequest.findMany({
      where: { verifierId: verifier.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    res.json(success(recent));
  } catch (err) {
    next(err);
  }
});

export default router;
