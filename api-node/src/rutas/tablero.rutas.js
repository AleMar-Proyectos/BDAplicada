import { Router } from 'express';
import { z } from 'zod';
import { requiereSesion } from '../middlewares/autenticacion.js';
import { ErrorApp, Errores } from '../errores.js';
import { tableroRepositorio as repo } from '../repositorios/tablero.repositorio.js';

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
export const tableroRutas = Router();

const entero = z.coerce.number().int().positive();

const esquemaFiltro = z
  .object({
    provincia: entero.optional(),
    ciudad: entero.optional(),
    vendedor: z.string().uuid('Vendedor inválido.').optional(),
  })
  .refine((f) => !f.ciudad || f.provincia, 'Para ver una ciudad hay que indicar su provincia.')
  .refine((f) => !f.vendedor || f.ciudad, 'Para ver un vendedor hay que indicar su ciudad.');

const noEncontrado = () =>
  new ErrorApp(404, 'NIVEL_NO_ENCONTRADO', 'Lo que buscás no existe o no pertenece a ese nivel.');

tableroRutas.get('/', requiereSesion('api'), async (req, res, next) => {
  try {
    const datos = esquemaFiltro.safeParse(req.query);
    if (!datos.success) throw Errores.datosInvalidos(datos.error.issues[0].message);

    const filtro = {
      provinciaId: datos.data.provincia ?? null,
      ciudadId: datos.data.ciudad ?? null,
      vendedorId: datos.data.vendedor ?? null,
    };

    // El camino tiene que ser coherente: ciudad dentro de la provincia, vendedor dentro de la ciudad.
    const ctx = await repo.contexto(filtro);
    if (filtro.provinciaId && !ctx.provincia) throw noEncontrado();
    if (filtro.ciudadId && ctx.ciudad_provincia_id !== filtro.provinciaId) throw noEncontrado();
    if (filtro.vendedorId && ctx.vendedor_ciudad_id !== filtro.ciudadId) throw noEncontrado();

    let nivel;
    let filasNivel;
    if (filtro.vendedorId) {
      nivel = 'publicaciones';
      filasNivel = repo.publicaciones(filtro.vendedorId);
    } else if (filtro.ciudadId) {
      nivel = 'vendedores';
      filasNivel = repo.vendedores(filtro.ciudadId);
    } else if (filtro.provinciaId) {
      nivel = 'ciudades';
      filasNivel = repo.ciudades(filtro.provinciaId);
    } else {
      nivel = 'provincias';
      filasNivel = repo.provincias();
    }

    const [filas, indicadores, ventasPorMes, ventasPorTipo, antiguedadActivas, semaforo] =
      await Promise.all([
        filasNivel,
        repo.indicadores(filtro),
        repo.ventasPorMes(filtro),
        repo.ventasPorTipo(filtro),
        repo.antiguedadActivas(filtro),
        repo.parametrosSemaforo(),
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
      filas,
      indicadores,
      tendencias: { ventasPorMes, ventasPorTipo, antiguedadActivas },
      semaforo,
    });
  } catch (err) {
    next(err);
  }
});
