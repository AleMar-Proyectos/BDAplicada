import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { Errores } from '../libs/errores.js';
import { validateToken } from '../middleware/validateToken.js';
import { login, logout, sesion } from '../controllers/auth.controller.js';

const router = Router();

/** Límite de intentos por IP: frena ataques de fuerza bruta sobre el login. */
const limiteLogin = rateLimit({
  windowMs: config.login.ventanaMs,
  limit: config.login.maxIntentos,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true, // solo cuentan los intentos fallidos
  handler: (req, res, next) => next(Errores.demasiadosIntentos()),
});

router.post('/login', limiteLogin, login);
router.post('/logout', logout);
router.get('/sesion', validateToken, sesion);

export default router;
