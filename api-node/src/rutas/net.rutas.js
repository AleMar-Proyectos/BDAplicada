import { Router } from 'express';
import { config } from '../config.js';
import { requiereSesion } from '../middlewares/autenticacion.js';
import { ErrorApp } from '../errores.js';

/**
 * Puente hacia la API .NET (patrón Backend-for-Frontend).
 * El navegador llama a /api/net/...; este servidor agrega el JWT de Supabase
 * como "Authorization: Bearer" y reenvía a .NET. Así el token nunca queda
 * expuesto al JavaScript del navegador y .NET no necesita CORS.
 */
export const netRutas = Router();

const METODOS_CON_BODY = new Set(['POST', 'PUT', 'PATCH']);

netRutas.use(requiereSesion('api'), async (req, res, next) => {
  const destino = `${config.dotnetApiUrl}/api${req.url}`;

  try {
    const respuesta = await fetch(destino, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${req.accessToken}`,
        Accept: 'application/json',
        ...(METODOS_CON_BODY.has(req.method) && { 'Content-Type': 'application/json' }),
      },
      body: METODOS_CON_BODY.has(req.method) ? JSON.stringify(req.body ?? {}) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    res.status(respuesta.status);
    const tipo = respuesta.headers.get('content-type');
    if (tipo) res.type(tipo);
    res.set('Cache-Control', 'no-store');
    res.send(Buffer.from(await respuesta.arrayBuffer()));
  } catch (err) {
    console.error(`[net] No se pudo contactar a la API .NET (${destino}):`, err.message);
    next(new ErrorApp(502, 'API_NET_NO_DISPONIBLE', 'La API .NET no está disponible.'));
  }
});
