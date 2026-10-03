import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRutas } from './rutas/auth.rutas.js';
import { netRutas } from './rutas/net.rutas.js';
import { requiereSesion } from './middlewares/autenticacion.js';
import { logRequests, manejadorErrores, noEncontrado } from './middlewares/errores.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');
const carpetaPublica = path.join(raiz, 'publico');
const carpetaPrivada = path.join(raiz, 'privado');

export function crearApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet()); // cabeceras de seguridad + Content-Security-Policy estricta
  app.use(logRequests);
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  // ---- API ----------------------------------------------------------------
  app.use('/api/auth', authRutas);
  app.use('/api/net', netRutas);
  app.use('/api', noEncontrado);

  // ---- Páginas ------------------------------------------------------------
  // El tablero NO es un archivo estático público: solo se entrega con sesión válida.
  const enviarPrivada = (archivo) => (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(carpetaPrivada, archivo));
  };
  app.get('/', (req, res) => res.redirect('/tablero'));
  app.get('/tablero', requiereSesion('pagina'), enviarPrivada('tablero.html'));

  app.use(express.static(carpetaPublica, { extensions: ['html'] }));
  app.use(noEncontrado);
  app.use(manejadorErrores);

  return app;
}
