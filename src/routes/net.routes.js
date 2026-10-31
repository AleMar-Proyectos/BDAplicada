import { Router } from 'express';
import { validateToken } from '../middleware/validateToken.js';
import { reenviarANet } from '../controllers/net.controller.js';

const router = Router();

// /api/net/*  →  API .NET /api/*  (con el JWT de la sesión)
router.use(validateToken, reenviarANet);

export default router;
