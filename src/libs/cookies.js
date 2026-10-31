import { config } from '../config.js';

/**
 * Los tokens viajan en cookies httpOnly: el JavaScript del navegador no puede
 * leerlos (protección ante XSS) y SameSite=Strict evita que otro sitio los use
 * (protección ante CSRF). En producción además van con Secure (solo HTTPS).
 */
const base = () => ({
  httpOnly: true,
  secure: config.esProduccion,
  sameSite: 'strict',
  path: '/',
});

export function guardarSesion(res, sesion) {
  res.cookie(config.cookies.accessToken, sesion.access_token, {
    ...base(),
    maxAge: (sesion.expires_in ?? 3600) * 1000,
  });
  res.cookie(config.cookies.refreshToken, sesion.refresh_token, {
    ...base(),
    maxAge: config.cookies.refreshMaxAgeMs,
  });
}

export function borrarSesion(res) {
  res.clearCookie(config.cookies.accessToken, base());
  res.clearCookie(config.cookies.refreshToken, base());
}

export function leerTokens(req) {
  return {
    accessToken: req.cookies?.[config.cookies.accessToken] ?? null,
    refreshToken: req.cookies?.[config.cookies.refreshToken] ?? null,
  };
}
