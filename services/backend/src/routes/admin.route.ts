// services/backend/src/routes/admin.route.ts
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { success } from '../lib/response.js';
import { verifyJWT } from '../middleware/auth.middleware.js';

const router = Router();

// GET /api/v1/admin/fraud-flags
router.get('/fraud-flags', verifyJWT, async (_req, res, next) => {
  try {
    const flags = await prisma.fraudFlag.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    res.json(success(flags));
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/admin/fraud-flags/:id
router.put('/fraud-flags/:id', verifyJWT, async (req, res, next) => {
  try {
    const { status } = req.body as { status: 'reviewed' | 'dismissed' };
    const flag = await prisma.fraudFlag.update({
      where: { id: String(req.params.id) },
      data: { status },
    });
    res.json(success(flag));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/audit-logs
router.get('/audit-logs', verifyJWT, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json(success(logs));
  } catch (err) {
    next(err);
  }
});

export default router;
