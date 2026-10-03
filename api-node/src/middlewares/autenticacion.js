import { verificarSesion } from '../servicios/auth.servicio.js';
import { guardarSesion, borrarSesion, leerTokens } from './cookies.js';
import { ErrorApp } from '../errores.js';

/**
 * Protege rutas.
 *   modo 'api'    → responde 401/403 en JSON.
 *   modo 'pagina' → redirige al login (así el HTML del tablero ni siquiera se
 *                   envía a quien no inició sesión).
 * Deja en req.usuario el perfil y en req.accessToken el token vigente.
 */
export function requiereSesion(modo = 'api') {
  return async (req, res, next) => {
    const { accessToken, refreshToken } = leerTokens(req);

    try {
      const { perfil, accessToken: token, sesionNueva } = await verificarSesion(accessToken, refreshToken);
      if (sesionNueva) guardarSesion(res, sesionNueva);
      req.usuario = perfil;
      req.accessToken = token;
      return next();
    } catch (err) {
      if (!(err instanceof ErrorApp)) return next(err);
      if (err.status === 401 || err.status === 403) borrarSesion(res);
      if (modo === 'pagina') {
        // Sin cookies = visita nueva → login limpio. Con cookies inválidas = sesión vencida.
        const motivo = accessToken || refreshToken ? `?motivo=${encodeURIComponent(err.codigo)}` : '';
        return res.redirect(303, `/login.html${motivo}`);
      }
      return next(err);
    }
  };
}
