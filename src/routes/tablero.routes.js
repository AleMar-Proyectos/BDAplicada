import { Router } from 'express';
import { validateToken } from '../middleware/validateToken.js';
import { getTablero } from '../controllers/tablero.controller.js';

const router = Router();

// GET /api/tablero?provincia=&ciudad=&vendedor=  (un nivel del drill down)
router.get('/', validateToken, getTablero);

export default router;
