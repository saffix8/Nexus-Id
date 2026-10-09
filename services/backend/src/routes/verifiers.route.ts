import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import prisma from '../lib/prisma.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { success, failure } from '../lib/response.js';

const router = Router();
const DomainSchema = z.object({
  domain: z.string().trim().min(1, 'domain is required').max(255),
});
const CreateVerifierSchema = DomainSchema.extend({
  displayName: z.string().trim().min(1, 'displayName is required').max(120),
});

// API keys are scoped to a verifier domain. JWT authentication prevents
// unauthenticated key reads and rotations; the domain is never accepted from
// an unvalidated path segment.
router.get('/api-key', verifyJWT, async (req, res, next) => {
  try {
    const parsed = DomainSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(422).json(failure(parsed.error.issues[0]?.message ?? 'Invalid domain'));
      return;
    }

    const verifier = await prisma.verifier.findUnique({
      where: { domain: parsed.data.domain, ownerUserId: req.user!.sub },
      select: { domain: true, displayName: true, apiKey: true, trusted: true, createdAt: true },
    });
    if (!verifier) {
      res.status(404).json(failure('No verifier is configured for this domain'));
      return;
    }

    res.json(success(verifier));
  } catch (err) {
    next(err);
  }
});

router.post('/api-key/regenerate', verifyJWT, async (req, res, next) => {
  try {
    const parsed = DomainSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(failure(parsed.error.issues[0]?.message ?? 'Invalid domain'));
      return;
    }

    const domain = parsed.data.domain;
    const verifier = await prisma.verifier.findUnique({
      where: { domain, ownerUserId: req.user!.sub },
    });
    if (!verifier) {
      res.status(404).json(failure('No verifier is configured for this domain'));
      return;
    }

    const apiKey = `nxk_${crypto.randomBytes(32).toString('base64url')}`;
    const updated = await prisma.verifier.update({
      where: { id: verifier.id },
      data: { apiKey },
      select: { domain: true, displayName: true, apiKey: true, trusted: true, createdAt: true },
    });

    await prisma.auditLog.create({
      data: {
        eventType: 'verifier_api_key_regenerated',
        verifierId: verifier.id,
        metadata: { actorUserId: req.user?.sub, domain },
      },
    });

    res.json(success(updated));
  } catch (err) {
    next(err);
  }
});

router.post('/', verifyJWT, async (req, res, next) => {
  try {
    const parsed = CreateVerifierSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(failure(parsed.error.issues[0]?.message ?? 'Invalid verifier'));
      return;
    }

    const existing = await prisma.verifier.findUnique({
      where: { domain: parsed.data.domain },
    });
    if (existing) {
      res.status(409).json(failure('A verifier already exists for this domain'));
      return;
    }

    const verifier = await prisma.verifier.create({
      data: {
        domain: parsed.data.domain,
        displayName: parsed.data.displayName,
        apiKey: `nxk_${crypto.randomBytes(32).toString('base64url')}`,
        ownerUserId: req.user!.sub,
      },
      select: { domain: true, displayName: true, apiKey: true, trusted: true, createdAt: true },
    });

    res.status(201).json(success(verifier));
  } catch (err) {
    next(err);
  }
});

export default router;