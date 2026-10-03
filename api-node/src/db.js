import pg from 'pg';
import { config } from './config.js';

/**
 * Pool de conexiones a PostgreSQL (Supabase). Se usa para leer perfiles
 * (public.perfiles) y, en la 2da entrega, para las consultas del tablero.
 * Todas las consultas son parametrizadas ($1, $2…) → sin inyección SQL.
 */
const esLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(config.databaseUrl);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: esLocal ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[db] Error inesperado en una conexión inactiva:', err.message);
});

export const query = (texto, parametros) => pool.query(texto, parametros);
