import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.routes.js';
import tableroRoutes from './routes/tablero.routes.js';
import netRoutes from './routes/net.routes.js';
import { validateTokenPagina } from './middleware/validateToken.js';
import { logRequests, manejadorErrores, noEncontrado } from './middleware/errores.js';

// Carpetas del front (client/) y de Chart.js (node_modules en la raíz del proyecto).
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const carpetaClient = path.join(raiz, 'client');
const carpetaPublica = path.join(carpetaClient, 'public');
const carpetaSrcFront = path.join(carpetaClient, 'src');
// Chart.js se sirve desde node_modules (mismo origen): la CSP no permite scripts de otros sitios.
const carpetaChartJs = path.join(raiz, 'node_modules', 'chart.js', 'dist');

const app = express();

app.disable('x-powered-by');
app.use(helmet()); // cabeceras de seguridad + Content-Security-Policy estricta
app.use(logRequests);
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// ---- API ------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/tablero', tableroRoutes);
app.use('/api/net', netRoutes);
app.use('/api', noEncontrado);

// ---- Páginas --------------------------------------------------------------
// "/" es el login (client/index.html). Si ya hay sesión, el propio login redirige al tablero.
app.get('/', (req, res) => res.sendFile(path.join(carpetaClient, 'index.html')));

// El tablero NO es un archivo estático público: solo se entrega con sesión válida.
app.get('/tablero', validateTokenPagina, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(carpetaSrcFront, 'pages', 'tablero.html'));
});

// ---- Archivos estáticos del front ----------------------------------------
app.use('/vendor/chartjs', express.static(carpetaChartJs, { maxAge: '7d' }));
app.use(express.static(carpetaPublica)); // /img/…
// /src/… → JS y CSS del front. Las páginas .html de client/src NO se sirven por acá.
app.use('/src', (req, res, next) => (req.path.endsWith('.html') ? noEncontrado(req, res) : next()));
app.use('/src', express.static(carpetaSrcFront, { index: false }));

app.use(noEncontrado);
app.use(manejadorErrores);

export default app;
