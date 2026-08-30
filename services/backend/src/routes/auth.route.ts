// services/backend/src/routes/auth.route.ts
//
// Canonical /api/v1/auth/* router — serves the WEB app's email/password
// login (web-auth.controller.ts). This is intentionally NOT the same
// as mobile's RSA-challenge flow in users.route.ts/auth.controller.ts —
// two different clients, two different trust models, kept separate on purpose.

import { Router } from 'express';
import { webRegister, webLogin } from '../controllers/web-auth.controller.js';
const router = Router();

router.post('/register', webRegister);
router.post('/login', webLogin);

export default router;