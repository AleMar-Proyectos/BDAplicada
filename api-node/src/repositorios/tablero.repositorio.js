import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../db.js';

/**
 * Consultas del tablero.
 * El SQL NO está escrito acá: se lee de database/07_consultas_tablero.sql,
 * donde cada consulta empieza con una línea "-- name: <nombre>". Así el
 * archivo que se entrega es exactamente el que ejecuta la aplicación.
 */
const ARCHIVO_SQL = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../database/07_consultas_tablero.sql',
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

export const tableroRepositorio = {
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
