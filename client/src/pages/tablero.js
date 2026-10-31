import { api, auth } from '../api/api.js';

/* =============================================================================
   Tablero de control · MarketCar
   Navegación por niveles con la ruta en el hash de la URL:
     #/                                         Nivel 1 · Provincias
     #/provincia/1                              Nivel 2 · Ciudades
     #/provincia/1/ciudad/3                     Nivel 3 · Vendedores
     #/provincia/1/ciudad/3/vendedor/<uuid>     Nivel 4 · Publicaciones
   Drill down: clic en una barra o una fila. Drill up: "Nivel anterior", las
   migas de pan o el botón Atrás del navegador.
   ========================================================================== */

const $ = (id) => document.getElementById(id);

// ---- Formatos ---------------------------------------------------------------
const nf = (opciones) => new Intl.NumberFormat('es-AR', opciones);
const fmtEntero = nf({ maximumFractionDigits: 0 });
const fmtDecimal = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPesos = nf({ style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const fmtPesosCorto = nf({ style: 'currency', currency: 'ARS', notation: 'compact', maximumFractionDigits: 1 });
const fmtDolares = nf({ style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' });
const fmtMesLargo = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// "2026-03" → "mar" (y el año en enero, para marcar el cambio de año)
const mesCorto = (ym) => {
  const [a, m] = ym.split('-').map(Number);
  return m === 1 ? [MESES[0], String(a)] : MESES[m - 1];
};

const porcentaje = (v) => (v == null ? '—' : `${fmtDecimal.format(v)} %`);
const dias = (v) => (v == null ? '—' : `${fmtDecimal.format(v)} días`);
const precio = (valor, moneda) => (moneda === 'USD' ? fmtDolares : fmtPesos).format(valor);

const NIVELES = {
  provincias: { numero: 1, nombre: 'Provincias', columna: 'Provincia', grafico: 'Conversión por provincia' },
  ciudades: { numero: 2, nombre: 'Ciudades', columna: 'Ciudad', grafico: 'Conversión por ciudad' },
  vendedores: { numero: 3, nombre: 'Vendedores', columna: 'Vendedor', grafico: 'Conversión por vendedor' },
  publicaciones: { numero: 4, nombre: 'Publicaciones', columna: 'Vehículo', grafico: 'Publicaciones del vendedor' },
};

const TIPOS_VENDEDOR = { concesionaria: 'Concesionaria', independiente: 'Independiente' };
const ESTADOS = { activa: 'Activa', vendida: 'Vendida', pausada: 'Pausada' };
const MEDIOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', financiacion: 'Financiación', permuta: 'Permuta' };

// ---- Semáforo ---------------------------------------------------------------
// Cada estado se muestra con color + ícono + texto (nunca solo con color).
const SEMAFORO = {
  conversion: { verde: 'Buena', amarillo: 'Regular', rojo: 'Baja' },
  antiguedad: { verde: 'Al día', amarillo: 'Demorada', rojo: 'Estancada' },
};
const ICONOS = {
  verde: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.8 8.3l2.1 2.1 4.3-4.6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  amarillo: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1.2l7 12.6H1z" fill="currentColor"/><path d="M8 6v3.6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.8" r="1" fill="#fff"/></svg>',
  rojo: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5.1 1h5.8L15 5.1v5.8L10.9 15H5.1L1 10.9V5.1z" fill="currentColor"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
};
const COLOR_ESTADO = { verde: '#0ca30c', amarillo: '#fab219', rojo: '#d03b3b' };

function chipSemaforo(indicador, estado, texto) {
  if (!estado) return '<span class="semaforo semaforo--nulo">—</span>';
  const etiqueta = SEMAFORO[indicador][estado];
  return `<span class="semaforo semaforo--${estado}">${ICONOS[estado]}<span>${texto ?? etiqueta}</span></span>`;
}

// ---- Escape de HTML (los nombres vienen de la base) --------------------------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---- Rutas (hash) -------------------------------------------------------------
const RUTA = /^#\/(?:provincia\/(\d+)(?:\/ciudad\/(\d+)(?:\/vendedor\/([0-9a-f-]{36}))?)?)?$/i;

function leerRuta() {
  const m = RUTA.exec(window.location.hash || '#/');
  if (!m) return null;
  return { provincia: m[1] ? Number(m[1]) : null, ciudad: m[2] ? Number(m[2]) : null, vendedor: m[3] ?? null };
}

const hashDe = ({ provincia, ciudad, vendedor } = {}) => {
  let h = '#/';
  if (provincia) h += `provincia/${provincia}`;
  if (ciudad) h += `/ciudad/${ciudad}`;
  if (vendedor) h += `/vendedor/${vendedor}`;
  return h;
};

// Ruta del hijo según el nivel actual y el id de la fila elegida.
function rutaHija(ruta, nivel, id) {
  if (nivel === 'provincias') return { provincia: id };
  if (nivel === 'ciudades') return { ...ruta, ciudad: id };
  if (nivel === 'vendedores') return { ...ruta, vendedor: id };
  return null;
}

function rutaPadre(ruta) {
  if (ruta.vendedor) return { provincia: ruta.provincia, ciudad: ruta.ciudad };
  if (ruta.ciudad) return { provincia: ruta.provincia };
  return {};
}

// ---- Colores de los gráficos (se leen de las variables CSS → modo claro/oscuro)
function colores() {
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  return { serie: v('--serie-1'), texto: v('--texto-2'), grilla: v('--grilla'), superficie: v('--superficie') };
}

const graficos = {};
function dibujar(id, config) {
  graficos[id]?.destroy();
  graficos[id] = new window.Chart($(id), config);
}

function opcionesBase(c, { horizontal = false, sufijo = '' } = {}) {
  const ejeValor = {
    beginAtZero: true,
    grid: { color: c.grilla, drawTicks: false },
    border: { display: false },
    ticks: { color: c.texto, padding: 6, precision: 0, callback: (v) => `${fmtEntero.format(v)}${sufijo}` },
  };
  const ejeCategoria = {
    grid: { display: false },
    border: { color: c.grilla },
    ticks: { color: c.texto, autoSkip: false },
  };
  return {
    indexAxis: horizontal ? 'y' : 'x',
    maintainAspectRatio: false,
    animation: false,   // sin animación: el gráfico aparece completo al instante
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.superficie,
        titleColor: getComputedStyle(document.documentElement).getPropertyValue('--texto').trim(),
        bodyColor: c.texto,
        borderColor: c.grilla,
        borderWidth: 1,
        padding: 10,
        displayColors: false,
      },
    },
    scales: horizontal ? { x: ejeValor, y: ejeCategoria } : { x: ejeCategoria, y: ejeValor },
  };
}

const barra = { borderRadius: 4, borderSkipped: 'start', maxBarThickness: 26, categoryPercentage: 0.8 };

// ---- Estado de la pantalla --------------------------------------------------
let ultimo = null;        // última respuesta, para redibujar al cambiar el tema
let pedido = 0;           // evita que una respuesta vieja pise a una nueva

// ---- Render -----------------------------------------------------------------
function pintarEncabezado(datos, ruta) {
  const n = NIVELES[datos.nivel];
  const { provincia, ciudad, vendedor } = datos.contexto;
  $('nivel-etiqueta').textContent = `Nivel ${n.numero} de 4 · ${n.nombre}`;
  $('titulo').textContent = vendedor?.nombre ?? ciudad?.nombre ?? provincia?.nombre ?? 'Marketplace en todo el país';
  document.title = `${$('titulo').textContent} · MarketCar Panel`;

  const migas = [{ texto: 'Todo el país', ruta: {} }];
  if (provincia) migas.push({ texto: provincia.nombre, ruta: { provincia: provincia.id } });
  if (ciudad) migas.push({ texto: ciudad.nombre, ruta: { provincia: provincia.id, ciudad: ciudad.id } });
  if (vendedor) migas.push({ texto: vendedor.nombre, ruta });
  $('migas').innerHTML = migas
    .map((m, i) =>
      i === migas.length - 1
        ? `<li><span aria-current="page">${esc(m.texto)}</span></li>`
        : `<li><a href="${hashDe(m.ruta)}">${esc(m.texto)}</a></li>`)
    .join('');

  const anterior = $('btn-anterior');
  if (n.numero === 1) {
    anterior.setAttribute('aria-disabled', 'true');
    anterior.setAttribute('tabindex', '-1');
    anterior.href = '#/';
  } else {
    anterior.removeAttribute('aria-disabled');
    anterior.removeAttribute('tabindex');
    anterior.href = hashDe(rutaPadre(ruta));
  }
}

function delta(actual, anterior, formato) {
  const dif = actual - anterior;
  if (anterior === 0 && actual === 0) return '<span class="delta">Sin ventas en los dos períodos</span>';
  const signo = dif > 0 ? 'sube' : dif < 0 ? 'baja' : 'igual';
  const flecha = dif > 0 ? '▲' : dif < 0 ? '▼' : '=';
  return `<span class="delta delta--${signo}">${flecha} ${formato(Math.abs(dif))}</span> vs. 30 días anteriores`;
}

function pintarIndicadores(k, semaforo) {
  const limiteRojo = semaforo.find((s) => s.indicador === 'antiguedad')?.limite_amarillo ?? 60;

  $('k-activas').textContent = fmtEntero.format(k.publicaciones_activas);
  $('k-activas-det').textContent = `de ${fmtEntero.format(k.publicaciones_total)} publicaciones en total`;

  $('k-ventas').textContent = fmtEntero.format(k.ventas_30d);
  $('k-ventas-det').innerHTML = delta(k.ventas_30d, k.ventas_30d_anterior, (v) => fmtEntero.format(v));

  $('k-monto').textContent = fmtPesosCorto.format(k.monto_30d);
  $('k-monto').title = fmtPesos.format(k.monto_30d);
  $('k-monto-det').innerHTML = delta(k.monto_30d, k.monto_30d_anterior, (v) => fmtPesosCorto.format(v));

  $('k-conversion').textContent = porcentaje(k.conversion);
  $('k-conversion-det').innerHTML = chipSemaforo('conversion', k.conversion_semaforo);

  $('k-dias').textContent = k.dias_promedio_venta == null ? '—' : fmtDecimal.format(k.dias_promedio_venta);
  $('k-dias-det').textContent = k.dias_promedio_venta == null ? 'Todavía no hay ventas' : 'desde que se publica hasta que se vende';

  $('k-estancadas').textContent = fmtEntero.format(k.publicaciones_estancadas);
  $('k-estancadas-det').innerHTML = k.publicaciones_estancadas > 0
    ? chipSemaforo('antiguedad', 'rojo', `activas con más de ${fmtEntero.format(limiteRojo)} días`)
    : chipSemaforo('antiguedad', 'verde', 'ninguna activa demorada');
}

function encabezadoTabla(nivel) {
  if (nivel === 'publicaciones') {
    return ['Vehículo', 'Año', 'Km', 'Precio', 'Estado', 'Antigüedad', 'Venta']
      .map((t, i) => `<th scope="col"${i > 0 && i < 4 ? ' class="num"' : ''}>${t}</th>`).join('');
  }
  return [NIVELES[nivel].columna, 'Publicaciones', 'Activas', 'Vendidas', 'Conversión', 'Monto vendido', 'Días a la venta']
    .map((t, i) => `<th scope="col"${[1, 2, 3, 5, 6].includes(i) ? ' class="num"' : ''}>${t}</th>`).join('');
}

function filaResumen(f, nivel, ruta) {
  const destino = f.id == null ? null : hashDe(rutaHija(ruta, nivel, f.id));
  const nombre = destino
    ? `<a class="fila__enlace" href="${destino}">${esc(f.nombre)}</a>`
    : `<span>${esc(f.nombre)}</span>`;
  const tipo = f.tipo ? `<span class="fila__sub">${esc(TIPOS_VENDEDOR[f.tipo] ?? f.tipo)}</span>` : '';
  return `<tr${destino ? ` data-destino="${destino}"` : ''}>
    <th scope="row">${nombre}${tipo}</th>
    <td class="num">${fmtEntero.format(f.publicaciones)}</td>
    <td class="num">${fmtEntero.format(f.activas)}</td>
    <td class="num">${fmtEntero.format(f.vendidas)}</td>
    <td><span class="valor-semaforo">${porcentaje(f.conversion)}</span>${chipSemaforo('conversion', f.semaforo)}</td>
    <td class="num">${fmtPesos.format(f.monto_total)}</td>
    <td class="num">${dias(f.dias_promedio_venta)}</td>
  </tr>`;
}

function filaPublicacion(f) {
  let antiguedad;
  if (f.estado === 'activa') {
    antiguedad = `<span class="valor-semaforo">${fmtEntero.format(f.dias_publicada)} días</span>${chipSemaforo('antiguedad', f.semaforo)}`;
  } else if (f.estado === 'vendida') {
    antiguedad = `<span class="fila__sub">Se vendió en ${fmtEntero.format(f.dias_hasta_venta)} días</span>`;
  } else {
    antiguedad = '<span class="fila__sub">Pausada</span>';
  }
  const venta = f.fecha_venta
    ? `${fmtPesos.format(f.monto_ars)}<span class="fila__sub">${fmtFecha.format(new Date(f.fecha_venta))} · ${esc(MEDIOS[f.medio_pago] ?? f.medio_pago)}</span>`
    : '<span class="fila__sub">—</span>';
  return `<tr>
    <th scope="row">${esc(f.vehiculo)}<span class="fila__sub">${esc(f.tipo)} · publicado el ${fmtFecha.format(new Date(f.fecha_publicacion))}</span></th>
    <td class="num">${f.anio ?? '—'}</td>
    <td class="num">${f.kilometros == null ? '—' : fmtEntero.format(f.kilometros)}</td>
    <td class="num">${f.precio == null ? '—' : precio(f.precio, f.moneda)}</td>
    <td><span class="estado-pub estado-pub--${esc(f.estado)}">${ESTADOS[f.estado] ?? esc(f.estado)}</span></td>
    <td>${antiguedad}</td>
    <td>${venta}</td>
  </tr>`;
}

function pintarTabla(datos, ruta) {
  const { nivel, filas } = datos;
  $('tabla-nivel').querySelector('thead').innerHTML = `<tr>${encabezadoTabla(nivel)}</tr>`;
  const cuerpo = $('tabla-nivel').querySelector('tbody');
  if (!filas.length) {
    cuerpo.innerHTML = `<tr><td colspan="7" class="tabla__vacia">No hay datos para este nivel.</td></tr>`;
    return;
  }
  cuerpo.innerHTML = filas
    .map((f) => (nivel === 'publicaciones' ? filaPublicacion(f) : filaResumen(f, nivel, ruta)))
    .join('');
}

function pintarReferencia(nivel, semaforo) {
  const indicador = nivel === 'publicaciones' ? 'antiguedad' : 'conversion';
  const p = semaforo.find((s) => s.indicador === indicador);
  if (!p) return;
  const v = fmtEntero.format(p.limite_verde);
  const a = fmtEntero.format(p.limite_amarillo);
  const textos = indicador === 'conversion'
    ? { verde: `${v} % o más de las publicaciones vendidas`, amarillo: `entre ${a} % y ${v} %`, rojo: `menos de ${a} %` }
    : { verde: `publicada hace ${v} días o menos`, amarillo: `entre ${fmtEntero.format(p.limite_verde + 1)} y ${a} días`, rojo: `más de ${a} días sin venderse` };
  const titulo = indicador === 'conversion' ? 'Semáforo de conversión' : 'Semáforo de antigüedad (publicaciones activas)';
  $('referencia').innerHTML = `
    <p class="referencia__titulo">${titulo}</p>
    <ul>
      ${['verde', 'amarillo', 'rojo'].map((e) => `<li>${chipSemaforo(indicador, e)}<span>${textos[e]}</span></li>`).join('')}
    </ul>
    <p class="referencia__fuente">Umbrales guardados en la tabla <code>parametro_semaforo</code>.</p>`;
}

function pintarGraficoNivel(datos, ruta) {
  const c = colores();
  const caja = $('grafico-nivel-caja');
  const { nivel, filas } = datos;
  const n = NIVELES[nivel];
  $('nivel-titulo').textContent = n.grafico;

  if (nivel === 'publicaciones') {
    caja.hidden = true;
    graficos['grafico-nivel']?.destroy();
    delete graficos['grafico-nivel'];
    $('nivel-ayuda').textContent = 'Detalle de cada publicación. Las activas muestran el semáforo de antigüedad.';
    return;
  }
  caja.hidden = false;
  $('nivel-ayuda').textContent = nivel === 'vendedores'
    ? 'Hacé clic en una barra o en una fila para ver las publicaciones del vendedor.'
    : 'Hacé clic en una barra o en una fila para ver el detalle.';
  caja.style.height = `${Math.max(160, filas.length * 38 + 48)}px`;

  const opciones = opcionesBase(c, { horizontal: true, sufijo: ' %' });
  opciones.scales.x.suggestedMax = 60;
  opciones.plugins.tooltip.callbacks = {
    label: (ctx) => {
      const f = filas[ctx.dataIndex];
      return [
        `Conversión: ${porcentaje(f.conversion)} (${SEMAFORO.conversion[f.semaforo] ?? '—'})`,
        `${fmtEntero.format(f.vendidas)} vendidas de ${fmtEntero.format(f.publicaciones)}`,
        `Monto: ${fmtPesos.format(f.monto_total)}`,
      ];
    },
  };
  opciones.onHover = (evento, elementos) => {
    const f = elementos.length ? filas[elementos[0].index] : null;
    evento.native.target.style.cursor = f && f.id != null ? 'pointer' : 'default';
  };
  opciones.onClick = (evento, elementos) => {
    if (!elementos.length) return;
    const f = filas[elementos[0].index];
    if (f.id != null) window.location.hash = hashDe(rutaHija(ruta, nivel, f.id));
  };

  dibujar('grafico-nivel', {
    type: 'bar',
    data: {
      labels: filas.map((f) => f.nombre),
      datasets: [{
        label: 'Conversión',
        data: filas.map((f) => f.conversion),
        backgroundColor: filas.map((f) => COLOR_ESTADO[f.semaforo] ?? c.grilla),
        ...barra,
      }],
    },
    options: opciones,
  });
}

function pintarTendencias(t) {
  const c = colores();

  // Ventas por mes
  const meses = t.ventasPorMes;
  const opMeses = opcionesBase(c);
  opMeses.scales.x.ticks.maxRotation = 0;
  opMeses.plugins.tooltip.callbacks = {
    title: (items) => {
      const fecha = fmtMesLargo.format(new Date(`${meses[items[0].dataIndex].mes}-15T12:00:00`));
      return fecha.charAt(0).toUpperCase() + fecha.slice(1);
    },
    label: (ctx) => {
      const m = meses[ctx.dataIndex];
      return [`${fmtEntero.format(m.ventas)} ventas`, `Monto: ${fmtPesos.format(m.monto)}`];
    },
  };
  dibujar('grafico-meses', {
    type: 'bar',
    data: {
      labels: meses.map((m) => mesCorto(m.mes)),
      datasets: [{ label: 'Ventas', data: meses.map((m) => m.ventas), backgroundColor: c.serie, ...barra }],
    },
    options: opMeses,
  });

  // Ventas por tipo
  const tipos = t.ventasPorTipo;
  const opTipos = opcionesBase(c, { horizontal: true });
  opTipos.plugins.tooltip.callbacks = {
    label: (ctx) => {
      const f = tipos[ctx.dataIndex];
      return [`${fmtEntero.format(f.ventas)} ventas de ${fmtEntero.format(f.publicaciones)} publicaciones`, `Monto: ${fmtPesos.format(f.monto)}`];
    },
  };
  dibujar('grafico-tipos', {
    type: 'bar',
    data: {
      labels: tipos.map((f) => f.tipo),
      datasets: [{ label: 'Ventas', data: tipos.map((f) => f.ventas), backgroundColor: c.serie, ...barra }],
    },
    options: opTipos,
  });

  // Antigüedad de las activas
  const antig = t.antiguedadActivas;
  const etiquetas = { verde: 'Al día', amarillo: 'Demoradas', rojo: 'Estancadas' };
  const opAntig = opcionesBase(c, { horizontal: true });
  opAntig.plugins.tooltip.callbacks = {
    label: (ctx) => `${fmtEntero.format(antig[ctx.dataIndex].publicaciones)} publicaciones activas`,
  };
  dibujar('grafico-antiguedad', {
    type: 'bar',
    data: {
      labels: antig.map((f) => etiquetas[f.estado]),
      datasets: [{
        label: 'Publicaciones activas',
        data: antig.map((f) => f.publicaciones),
        backgroundColor: antig.map((f) => COLOR_ESTADO[f.estado]),
        ...barra,
      }],
    },
    options: opAntig,
  });
}

function pintarGraficos() {
  if (!ultimo || !window.Chart) return;
  pintarGraficoNivel(ultimo.datos, ultimo.ruta);
  pintarTendencias(ultimo.datos.tendencias);
}

function mostrarAviso(mensaje) {
  const aviso = $('aviso');
  if (!mensaje) {
    aviso.hidden = true;
    return;
  }
  aviso.innerHTML = `<span>${esc(mensaje)} <a href="#/">Volver al inicio</a></span>`;
  aviso.hidden = false;
}

// ---- Carga de un nivel --------------------------------------------------------
async function cargarNivel() {
  const ruta = leerRuta();
  if (!ruta) {
    window.location.replace('#/');
    return;
  }
  const numero = ++pedido;
  $('contenido').setAttribute('aria-busy', 'true');

  const qs = new URLSearchParams();
  if (ruta.provincia) qs.set('provincia', ruta.provincia);
  if (ruta.ciudad) qs.set('ciudad', ruta.ciudad);
  if (ruta.vendedor) qs.set('vendedor', ruta.vendedor);

  try {
    const datos = await api(`/api/tablero${qs.size ? `?${qs}` : ''}`);
    if (numero !== pedido) return;
    mostrarAviso(null);
    ultimo = { datos, ruta };
    pintarEncabezado(datos, ruta);
    pintarIndicadores(datos.indicadores, datos.semaforo);
    pintarTabla(datos, ruta);
    pintarReferencia(datos.nivel, datos.semaforo);
    pintarGraficos();
  } catch (err) {
    if (numero !== pedido) return;
    if (err.status === 401) return irAlLogin('SESION_INVALIDA');
    if (err.status === 403) return irAlLogin('SIN_PERMISO');
    mostrarAviso(err.status === 404 ? 'Ese nivel no existe o ya no está disponible.' : err.message);
  } finally {
    if (numero === pedido) $('contenido').setAttribute('aria-busy', 'false');
  }
}

// Clic en cualquier parte de la fila = drill down (el enlace del nombre es el
// destino accesible con teclado).
$('tabla-nivel').addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const fila = e.target.closest('tr[data-destino]');
  if (fila) window.location.hash = fila.dataset.destino;
});

$('btn-anterior').addEventListener('click', (e) => {
  if (e.currentTarget.getAttribute('aria-disabled') === 'true') e.preventDefault();
});

window.addEventListener('hashchange', cargarNivel);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', pintarGraficos);

// ---- Sesión -----------------------------------------------------------------
function irAlLogin(motivo) {
  window.location.replace(`/${motivo ? `?motivo=${motivo}` : ''}`);
}

function pintarUsuario(u) {
  $('nombre-usuario').textContent = u.nombre;
  $('correo-usuario').textContent = u.correo;
  $('avatar').textContent = u.nombre.trim().charAt(0).toUpperCase();
}

async function verificarConDotnet() {
  const estado = $('estado-net');
  try {
    await api('/api/net/perfil');
    estado.className = 'pie__estado pie__estado--ok';
    estado.textContent = 'API .NET: JWT y rol admin validados';
  } catch (err) {
    if (err.status === 401) return irAlLogin('SESION_INVALIDA');
    estado.className = 'pie__estado pie__estado--error';
    estado.textContent = 'API .NET: no disponible';
  }
}

async function iniciar() {
  try {
    const { usuario } = await auth.sesion();
    pintarUsuario(usuario);
  } catch (err) {
    return irAlLogin(err.codigo === 'SIN_PERMISO' ? 'SIN_PERMISO' : 'SESION_INVALIDA');
  }
  cargarNivel();
  verificarConDotnet();
}

$('btn-salir').addEventListener('click', async (e) => {
  e.currentTarget.disabled = true;
  try {
    await auth.logout();
  } finally {
    irAlLogin('LOGOUT');
  }
});

// Si el navegador muestra la página desde la caché (botón "atrás" después de
// cerrar sesión), se vuelve a verificar la sesión.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) iniciar();
});

iniciar();
