import { clienteAuth } from '../libs/supabase.js';
import { guardarSesion, borrarSesion, leerTokens } from '../libs/cookies.js';
import { ErrorApp, Errores } from '../libs/errores.js';
import { buscarPorId, validarAccesoAlPanel } from '../libs/usuarios.js';

/**
 * Verifica la sesión de un request.
 *  - Valida el access token contra Supabase (firma + expiración + no revocado).
 *  - Si expiró pero hay refresh token, renueva la sesión de forma transparente.
 *  - Relee el perfil en cada request: si a alguien le sacan el rol admin,
 *    pierde el acceso en el siguiente request, sin esperar que venza el token.
 * Devuelve { perfil, accessToken, sesionNueva } o lanza ErrorApp.
 */
async function verificarSesion(accessToken, refreshToken) {
  let usuarioAuth = null;
  let sesionNueva = null;
  let tokenVigente = accessToken;

  if (accessToken) {
    const { data, error } = await clienteAuth().getUser(accessToken);
    if (!error && data?.user) usuarioAuth = data.user;
    else if (error?.status >= 500) throw Errores.authNoDisponible();
  }

  if (!usuarioAuth && refreshToken) {
    const { data, error } = await clienteAuth().refreshSession({ refresh_token: refreshToken });
    if (!error && data?.session) {
      usuarioAuth = data.user;
      sesionNueva = data.session;
      tokenVigente = data.session.access_token;
    }
  }

  if (!usuarioAuth) throw Errores.sinSesion();

  const perfil = await buscarPorId(usuarioAuth.id);
  if (!perfil) throw Errores.sinSesion();
  validarAccesoAlPanel(perfil);

  return { perfil, accessToken: tokenVigente, sesionNueva };
}

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
        return res.redirect(303, `/${motivo}`);
      }
      return next(err);
    }
  };
}

/** Para rutas de la API (responde JSON). */
export const validateToken = requiereSesion('api');

/** Para páginas HTML (redirige al login). */
export const validateTokenPagina = requiereSesion('pagina');
