import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { query } from '../db.js';
import { ErrorApp, Errores } from '../libs/errores.js';

/**
 * Consultas del tablero.
 * El SQL NO está escrito acá: se lee de db/07_consultas_tablero.sql,
 * donde cada consulta empieza con una línea "-- name: <nombre>". Así el
 * archivo que se entrega es exactamente el que ejecuta la aplicación.
 */
const ARCHIVO_SQL = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/07_consultas_tablero.sql',
);

function cargarConsultas(archivo) {
  const texto = fs.readFileSync(archivo, 'utf8');
  const consultas = {};
  const partes = texto.split(/^-- name:\s*(\w+)\s*$/m);
  // partes = [encabezado, nombre1, sql1, nombre2, sql2, …]
  for (let i = 1; i < partes.length; i += 2) {
    consultas[partes[i]] = partes[i + 1].trim();
  }
  return consultas;
}

const SQL = cargarConsultas(ARCHIVO_SQL);

const NECESARIAS = [
  'indicadores', 'nivel_provincias', 'nivel_ciudades', 'nivel_vendedores', 'nivel_publicaciones',
  'ventas_por_mes', 'ventas_por_tipo', 'antiguedad_activas', 'contexto', 'parametros_semaforo',
];
for (const nombre of NECESARIAS) {
  if (!SQL[nombre]) throw new Error(`Falta la consulta "${nombre}" en ${ARCHIVO_SQL}`);
}

const filas = async (nombre, parametros = []) => (await query(SQL[nombre], parametros)).rows;

/** filtro = { provinciaId, ciudadId, vendedorId } (cualquiera puede ser null) */
const params = ({ provinciaId = null, ciudadId = null, vendedorId = null }) => [
  provinciaId, ciudadId, vendedorId,
];

const consultas = {
  indicadores: async (filtro) => (await filas('indicadores', params(filtro)))[0],
  ventasPorMes: (filtro) => filas('ventas_por_mes', params(filtro)),
  ventasPorTipo: (filtro) => filas('ventas_por_tipo', params(filtro)),
  antiguedadActivas: (filtro) => filas('antiguedad_activas', params(filtro)),
  contexto: async (filtro) => (await filas('contexto', params(filtro)))[0],
  parametrosSemaforo: () => filas('parametros_semaforo'),

  provincias: () => filas('nivel_provincias'),
  ciudades: (provinciaId) => filas('nivel_ciudades', [provinciaId]),
  vendedores: (ciudadId) => filas('nivel_vendedores', [ciudadId]),
  publicaciones: (vendedorId) => filas('nivel_publicaciones', [vendedorId]),
};

const entero = z.coerce.number().int().positive();

const esquemaFiltro = z
  .object({
    provincia: entero.optional(),
    ciudad: entero.optional(),
    vendedor: z.string().uuid('Vendedor inválido.').optional(),
  })
  .refine((f) => !f.ciudad || f.provincia, 'Para ver una ciudad hay que indicar su provincia.')
  .refine((f) => !f.vendedor || f.ciudad, 'Para ver un vendedor hay que indicar su ciudad.');

const nivelNoEncontrado = () =>
  new ErrorApp(404, 'NIVEL_NO_ENCONTRADO', 'Lo que buscás no existe o no pertenece a ese nivel.');

/**
 * Datos del tablero. Un solo endpoint por nivel del drill down:
 *
 *   GET /api/tablero                                   → Nivel 1: provincias
 *   GET /api/tablero?provincia=1                       → Nivel 2: ciudades de la provincia
 *   GET /api/tablero?provincia=1&ciudad=3              → Nivel 3: vendedores de la ciudad
 *   GET /api/tablero?provincia=1&ciudad=3&vendedor=…   → Nivel 4: publicaciones del vendedor
 *
 * Cada respuesta trae las filas del nivel, los indicadores y las tendencias
 * filtrados por lo que se está mirando, y los umbrales del semáforo.
 */
export const getTablero = async (req, res, next) => {
  try {
    const datos = esquemaFiltro.safeParse(req.query);
    if (!datos.success) throw Errores.datosInvalidos(datos.error.issues[0].message);

    const filtro = {
      provinciaId: datos.data.provincia ?? null,
      ciudadId: datos.data.ciudad ?? null,
      vendedorId: datos.data.vendedor ?? null,
    };

    // El camino tiene que ser coherente: ciudad dentro de la provincia, vendedor dentro de la ciudad.
    const ctx = await consultas.contexto(filtro);
    if (filtro.provinciaId && !ctx.provincia) throw nivelNoEncontrado();
    if (filtro.ciudadId && ctx.ciudad_provincia_id !== filtro.provinciaId) throw nivelNoEncontrado();
    if (filtro.vendedorId && ctx.vendedor_ciudad_id !== filtro.ciudadId) throw nivelNoEncontrado();

    let nivel;
    let filasNivel;
    if (filtro.vendedorId) {
      nivel = 'publicaciones';
      filasNivel = consultas.publicaciones(filtro.vendedorId);
    } else if (filtro.ciudadId) {
      nivel = 'vendedores';
      filasNivel = consultas.vendedores(filtro.ciudadId);
    } else if (filtro.provinciaId) {
      nivel = 'ciudades';
      filasNivel = consultas.ciudades(filtro.provinciaId);
    } else {
      nivel = 'provincias';
      filasNivel = consultas.provincias();
    }

    const [filasDelNivel, indicadores, ventasPorMes, ventasPorTipo, antiguedadActivas, semaforo] =
      await Promise.all([
        filasNivel,
        consultas.indicadores(filtro),
        consultas.ventasPorMes(filtro),
        consultas.ventasPorTipo(filtro),
        consultas.antiguedadActivas(filtro),
        consultas.parametrosSemaforo(),
      ]);

    res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      nivel,
      contexto: {
        provincia: filtro.provinciaId ? { id: filtro.provinciaId, nombre: ctx.provincia } : null,
        ciudad: filtro.ciudadId ? { id: filtro.ciudadId, nombre: ctx.ciudad } : null,
        vendedor: filtro.vendedorId ? { id: filtro.vendedorId, nombre: ctx.vendedor } : null,
      },
      filas: filasDelNivel,
      indicadores,
      tendencias: { ventasPorMes, ventasPorTipo, antiguedadActivas },
      semaforo,
    });
  } catch (err) {
    next(err);
  }
};
