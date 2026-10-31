/**
 * Cliente HTTP del front. Todas las llamadas van al mismo origen (servidor Node),
 * las cookies de sesión viajan solas y son httpOnly: este código nunca ve el token.
 */

export class ErrorApi extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

export async function api(ruta, { metodo = 'GET', datos } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(datos !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: datos !== undefined ? JSON.stringify(datos) : undefined,
    });
  } catch {
    throw new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor. Revisá tu conexión.');
  }

  const cuerpo = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new ErrorApi(
      respuesta.status,
      cuerpo.codigo ?? 'ERROR',
      cuerpo.mensaje ?? cuerpo.title ?? `Error ${respuesta.status}`,
    );
  }
  return cuerpo;
}

export const auth = {
  login: (usuario, password) => api('/api/auth/login', { metodo: 'POST', datos: { usuario, password } }),
  logout: () => api('/api/auth/logout', { metodo: 'POST', datos: {} }),
  sesion: () => api('/api/auth/sesion'),
};
