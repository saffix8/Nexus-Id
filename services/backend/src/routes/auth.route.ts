// services/backend/src/routes/auth.route.ts
//
// Canonical /api/v1/auth/* router. Delegates to the same controller
// functions used by /api/v1/users/* — see controllers/auth.controller.ts.
// No authentication logic lives in this file.

import { Router } from 'express';
import { register, login } from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);

export default router;