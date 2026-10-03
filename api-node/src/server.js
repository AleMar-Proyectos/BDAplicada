import { config } from './config.js';
import { crearApp } from './app.js';
import { pool } from './db.js';

const app = crearApp();

const servidor = app.listen(config.puerto, async () => {
  console.log(`🚗 MarketCar · Panel de control → http://localhost:${config.puerto}`);
  try {
    await pool.query('SELECT 1');
    console.log('✅ Conectado a la base de datos (Supabase PostgreSQL)');
  } catch (err) {
    console.error('⚠️  No se pudo conectar a la base de datos:', err.message);
  }
});

// Cierre ordenado (Ctrl+C / docker stop)
for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    console.log('\nCerrando servidor…');
    servidor.close(() => pool.end().finally(() => process.exit(0)));
  });
}
