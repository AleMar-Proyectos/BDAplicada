import { query } from '../db.js';
import { Errores } from './errores.js';

/**
 * Acceso a public.perfiles (perfil de negocio de cada usuario).
 * Las credenciales NO están acá: las valida Supabase Auth contra auth.users.
 * Lo usan el controlador de auth (login) y el middleware validateToken.
 */

const ROL_PANEL = 'admin';

const COLUMNAS = `
  id_usuario,
  nombre_usuario::text AS nombre_usuario,
  correo::text         AS correo,
  nombre_completo,
  tipo_usuario,
  rol::text            AS rol,
  activo,
  ultimo_acceso
`;

/** Busca por correo o por nombre de usuario (citext → no distingue mayúsculas). */
export async function buscarPorIdentificador(identificador) {
  const { rows } = await query(
    `SELECT ${COLUMNAS}
       FROM public.perfiles
      WHERE correo         = $1::extensions.citext
         OR nombre_usuario = $1::extensions.citext
      LIMIT 1`,
    [identificador],
  );
  return rows[0] ?? null;
}

export async function buscarPorId(idUsuario) {
  const { rows } = await query(
    `SELECT ${COLUMNAS} FROM public.perfiles WHERE id_usuario = $1`,
    [idUsuario],
  );
  return rows[0] ?? null;
}

export async function registrarAcceso(idUsuario) {
  await query('UPDATE public.perfiles SET ultimo_acceso = now() WHERE id_usuario = $1', [idUsuario]);
}

/** Solo entran al panel las cuentas activas con rol admin. */
export function validarAccesoAlPanel(perfil) {
  if (!perfil.activo) throw Errores.cuentaInactiva();
  if (perfil.rol !== ROL_PANEL) throw Errores.sinPermiso();
}

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
