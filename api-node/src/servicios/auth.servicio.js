import { clienteAuth } from '../supabase.js';
import * as usuarios from '../repositorios/usuario.repositorio.js';
import { Errores } from '../errores.js';

const ROL_PANEL = 'admin';

// Si el usuario no existe igual se consulta a Supabase con un correo inexistente:
// la respuesta tarda lo mismo y no se puede adivinar qué usuarios existen.
const CORREO_INEXISTENTE = 'no-registrado@invalid.marketcar.local';

/** Datos del perfil que se pueden mostrar en el front. */
export function perfilPublico(perfil) {
  return {
    id: perfil.id_usuario,
    usuario: perfil.nombre_usuario,
    correo: perfil.correo,
    nombre: perfil.nombre_completo,
    tipo: perfil.tipo_usuario,
    rol: perfil.rol,
    ultimoAcceso: perfil.ultimo_acceso,
  };
}

function validarAccesoAlPanel(perfil) {
  if (!perfil.activo) throw Errores.cuentaInactiva();
  if (perfil.rol !== ROL_PANEL) throw Errores.sinPermiso();
}

/** Revoca el refresh token del lado de Supabase. Nunca hace fallar el flujo. */
async function revocar(accessToken) {
  try {
    await clienteAuth().admin.signOut(accessToken, 'local');
  } catch {
    /* si falla, la sesión igual expira sola */
  }
}

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
export async function iniciarSesion(identificador, password) {
  const ident = identificador.trim().toLowerCase();
  const perfil = await usuarios.buscarPorIdentificador(ident);

  const correo = perfil?.correo ?? (ident.includes('@') ? ident : CORREO_INEXISTENTE);
  const { data, error } = await clienteAuth().signInWithPassword({ email: correo, password });

  if (error || !data?.session) throw errorDeSupabase(error ?? {});

  const sesion = data.session;
  try {
    // Cuenta de Auth sin perfil de negocio → se trata como credenciales inválidas.
    if (!perfil || perfil.id_usuario !== data.user.id) throw Errores.credencialesInvalidas();
    validarAccesoAlPanel(perfil);
  } catch (err) {
    await revocar(sesion.access_token);
    throw err;
  }

  await usuarios.registrarAcceso(perfil.id_usuario);
  return { sesion, perfil };
}

/**
 * Verifica la sesión de un request.
 *  - Valida el access token contra Supabase (firma + expiración + no revocado).
 *  - Si expiró pero hay refresh token, renueva la sesión de forma transparente.
 *  - Relee el perfil en cada request: si a alguien le sacan el rol admin,
 *    pierde el acceso en el siguiente request, sin esperar que venza el token.
 * Devuelve { perfil, accessToken, sesionNueva } o lanza ErrorApp.
 */
export async function verificarSesion(accessToken, refreshToken) {
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

  const perfil = await usuarios.buscarPorId(usuarioAuth.id);
  if (!perfil) throw Errores.sinSesion();
  validarAccesoAlPanel(perfil);

  return { perfil, accessToken: tokenVigente, sesionNueva };
}

export async function cerrarSesion(accessToken) {
  if (accessToken) await revocar(accessToken);
}
