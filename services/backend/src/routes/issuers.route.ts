// services/backend/src/routes/issuers.route.ts
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { success, failure } from '../lib/response.js';

const router = Router();

// GET /api/v1/issuers  — list trusted issuers
router.get('/', async (_req, res, next) => {
  try {
    const issuers = await prisma.issuerRegistry.findMany({ where: { active: true } });
    res.json(success(issuers));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/issuers/:id/public-key
router.get('/:id/public-key', async (req, res, next) => {
  try {
    const issuer = await prisma.issuerRegistry.findUnique({ where: { issuerId: req.params.id } });
    if (!issuer) return res.status(404).json(failure('Issuer not found'));
    res.json(success({ public_key: issuer.publicKey }));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/issuers/:id/revocation  — placeholder until blockchain.service is wired in
router.get('/:id/revocation', async (_req, res) => {
  res.json(success({ revoked: false }));
});

export default router;
