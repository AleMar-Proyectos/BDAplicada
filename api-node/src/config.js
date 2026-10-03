import 'dotenv/config';
import { z } from 'zod';

/**
 * Configuración centralizada. Se valida al arrancar: si falta una variable
 * el servidor no levanta (fail fast) en lugar de fallar en el primer login.
 */
const esquema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  DATABASE_URL: z.string().startsWith('postgres'),
  DOTNET_API_URL: z.string().url().default('http://localhost:5080'),
  LOGIN_MAX_INTENTOS: z.coerce.number().int().positive().default(10),
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  console.error('❌ Configuración inválida. Revisá el archivo .env:');
  for (const issue of resultado.error.issues) {
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = resultado.data;

export const config = {
  entorno: env.NODE_ENV,
  esProduccion: env.NODE_ENV === 'production',
  puerto: env.PORT,
  supabase: { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY },
  databaseUrl: env.DATABASE_URL,
  dotnetApiUrl: env.DOTNET_API_URL.replace(/\/$/, ''),
  login: { maxIntentos: env.LOGIN_MAX_INTENTOS, ventanaMs: 15 * 60 * 1000 },
  cookies: {
    accessToken: 'mc_at',
    refreshToken: 'mc_rt',
    refreshMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },
};
