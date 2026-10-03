import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { Errores } from '../errores.js';
import { iniciarSesion, cerrarSesion, perfilPublico } from '../servicios/auth.servicio.js';
import { guardarSesion, borrarSesion, leerTokens } from '../middlewares/cookies.js';
import { requiereSesion } from '../middlewares/autenticacion.js';

export const authRutas = Router();

/** Límite de intentos por IP: frena ataques de fuerza bruta sobre el login. */
const limiteLogin = rateLimit({
  windowMs: config.login.ventanaMs,
  limit: config.login.maxIntentos,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true, // solo cuentan los intentos fallidos
  handler: (req, res, next) => next(Errores.demasiadosIntentos()),
});

const esquemaLogin = z.object({
  usuario: z.string().trim().min(3, 'Ingresá tu usuario o correo.').max(120),
  password: z.string().min(1, 'Ingresá tu contraseña.').max(128),
});

/** POST /api/auth/login  { usuario, password } */
authRutas.post('/login', limiteLogin, async (req, res, next) => {
  try {
    if (!req.is('application/json')) throw Errores.datosInvalidos('Se esperaba JSON.');

    const datos = esquemaLogin.safeParse(req.body ?? {});
    if (!datos.success) throw Errores.datosInvalidos(datos.error.issues[0].message);

    const { sesion, perfil } = await iniciarSesion(datos.data.usuario, datos.data.password);
    guardarSesion(res, sesion);

    res.json({ ok: true, usuario: perfilPublico(perfil), redirigirA: '/tablero' });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/logout — revoca la sesión en Supabase y borra las cookies. */
authRutas.post('/logout', async (req, res, next) => {
  try {
    const { accessToken } = leerTokens(req);
    await cerrarSesion(accessToken);
    borrarSesion(res);
    res.json({ ok: true, redirigirA: '/login.html' });
  } catch (err) {
    next(err);
  }
});

/** GET /api/auth/sesion — ¿hay sesión válida? Devuelve el perfil. */
authRutas.get('/sesion', requiereSesion('api'), (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, usuario: perfilPublico(req.usuario) });
});
