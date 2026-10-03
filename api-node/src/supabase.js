import { AuthClient } from '@supabase/auth-js';
import { config } from './config.js';

/**
 * Crea un cliente de Supabase Auth NUEVO para cada operación de autenticación.
 *
 * Se usa directamente @supabase/auth-js (el módulo de autenticación de Supabase)
 * en lugar del cliente completo supabase-js: el servidor solo necesita Auth y así
 * no se inicializa Realtime (WebSockets), que no hace falta y en Node 20 falla.
 *
 * Por qué no un cliente compartido: el cliente guarda en memoria la sesión de
 * la última llamada (signInWithPassword, refreshSession…). En un servidor que
 * atiende a muchos usuarios a la vez, un cliente compartido mezclaría sesiones
 * entre requests. Con un cliente por operación el servidor queda stateless.
 */
export function clienteAuth() {
  return new AuthClient({
    url: `${config.supabase.url.replace(/\/$/, '')}/auth/v1`,
    headers: {
      apikey: config.supabase.anonKey,
      Authorization: `Bearer ${config.supabase.anonKey}`,
    },
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  });
}
