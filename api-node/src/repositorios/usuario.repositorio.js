import { query } from '../db.js';

/**
 * Acceso a datos de public.perfiles (perfil de negocio).
 * Las credenciales NO están acá: las valida Supabase Auth contra auth.users.
 */

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
