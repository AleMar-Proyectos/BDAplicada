import { z } from 'zod';
import { clienteAuth, revocarSesion } from '../libs/supabase.js';
import { guardarSesion, borrarSesion, leerTokens } from '../libs/cookies.js';
import { Errores } from '../libs/errores.js';
import {
  buscarPorIdentificador,
  registrarAcceso,
  validarAccesoAlPanel,
  perfilPublico,
} from '../libs/usuarios.js';

// Si el usuario no existe igual se consulta a Supabase con un correo inexistente:
// la respuesta tarda lo mismo y no se puede adivinar qué usuarios existen.
const CORREO_INEXISTENTE = 'no-registrado@invalid.marketcar.local';

const esquemaLogin = z.object({
  usuario: z.string().trim().min(3, 'Ingresá tu usuario o correo.').max(120),
  password: z.string().min(1, 'Ingresá tu contraseña.').max(128),
});

function errorDeSupabase(error) {
  if (error.status === 429) return Errores.demasiadosIntentos();
  if (!error.status || error.status >= 500) return Errores.authNoDisponible();
  return Errores.credencialesInvalidas();
}

/**
 * Inicio de sesión.
 *  1. Resuelve usuario → correo (public.perfiles).
 *  2. Supabase Auth compara la contraseña contra el hash bcrypt de auth.users.
 *  3. Autoriza: cuenta activa y rol admin. Si no, revoca la sesión recién creada.
 */
async function iniciarSesion(identificador, password) {
  const ident = identificador.trim().toLowerCase();
  const perfil = await buscarPorIdentificador(ident);

  const correo = perfil?.correo ?? (ident.includes('@') ? ident : CORREO_INEXISTENTE);
  const { data, error } = await clienteAuth().signInWithPassword({ email: correo, password });

  if (error || !data?.session) throw errorDeSupabase(error ?? {});

  const sesion = data.session;
  try {
    // Cuenta de Auth sin perfil de negocio → se trata como credenciales inválidas.
    if (!perfil || perfil.id_usuario !== data.user.id) throw Errores.credencialesInvalidas();
    validarAccesoAlPanel(perfil);
  } catch (err) {
    await revocarSesion(sesion.access_token);
    throw err;
  }

  await registrarAcceso(perfil.id_usuario);
  return { sesion, perfil };
}

/** POST /api/auth/login  { usuario, password } */
export const login = async (req, res, next) => {
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
};

/** POST /api/auth/logout — revoca la sesión en Supabase y borra las cookies. */
export const logout = async (req, res, next) => {
  try {
    const { accessToken } = leerTokens(req);
    await revocarSesion(accessToken);
    borrarSesion(res);
    res.json({ ok: true, redirigirA: '/' });
  } catch (err) {
    next(err);
  }
};

/** GET /api/auth/sesion — ¿hay sesión válida? Devuelve el perfil (lo deja validateToken). */
export const sesion = (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, usuario: perfilPublico(req.usuario) });
};
