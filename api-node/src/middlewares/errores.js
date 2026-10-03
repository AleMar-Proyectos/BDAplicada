import { ErrorApp } from '../errores.js';

export function noEncontrado(req, res) {
  res.status(404).json({ ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'Recurso no encontrado.' });
}

// eslint-disable-next-line no-unused-vars
export function manejadorErrores(err, req, res, next) {
  if (err instanceof ErrorApp) {
    return res.status(err.status).json({ ok: false, codigo: err.codigo, mensaje: err.message });
  }

  // JSON mal formado enviado por el cliente
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, codigo: 'DATOS_INVALIDOS', mensaje: 'JSON inválido.' });
  }

  // Error inesperado: se registra completo en el servidor y al cliente se le
  // devuelve un mensaje genérico (no se filtran detalles internos).
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  return res
    .status(500)
    .json({ ok: false, codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado.' });
}

/** Log de cada request: método, ruta, estado y duración. Nunca el body. */
export function logRequests(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${ms.toFixed(0)} ms)`);
  });
  next();
}
