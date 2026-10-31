-- =============================================================================
--  MarketCar · 07_consultas_tablero.sql
--  Todas las consultas del tablero. El backend Node lee ESTE archivo y ejecuta
--  cada bloque por su nombre (línea "-- name: …"), así lo que está acá es
--  exactamente lo que corre la aplicación.
--
--  Parámetros de filtro (los mismos en todos los bloques que los usan):
--    $1 provincia_id · $2 ciudad_id · $3 vendedor_id (uuid)
--  Si un parámetro es NULL, no filtra. Así, cada nivel del drill down muestra
--  los indicadores y tendencias de lo que está mirando.
--
--  Todas leen de vw_tablero_publicacion (05_tablero_esquema.sql).
--  Para probarlas en el SQL Editor, reemplazar $1/$2/$3 por valores o NULL.
-- =============================================================================


-- name: indicadores
-- Tarjetas de la cabecera.
WITH base AS (
  SELECT * FROM public.vw_tablero_publicacion
  WHERE ($1::int  IS NULL OR provincia_id = $1)
    AND ($2::int  IS NULL OR ciudad_id    = $2)
    AND ($3::uuid IS NULL OR vendedor_id  = $3)
), calculo AS (
  SELECT
    count(*) FILTER (WHERE estado = 'activa')                                   AS publicaciones_activas,
    count(*)                                                                    AS publicaciones_total,
    count(*) FILTER (WHERE fecha_venta >= now() - interval '30 days')           AS ventas_30d,
    count(*) FILTER (WHERE fecha_venta >= now() - interval '60 days'
                       AND fecha_venta <  now() - interval '30 days')           AS ventas_30d_anterior,
    coalesce(sum(monto_ars) FILTER (WHERE fecha_venta >= now() - interval '30 days'), 0) AS monto_30d,
    coalesce(sum(monto_ars) FILTER (WHERE fecha_venta >= now() - interval '60 days'
                                      AND fecha_venta <  now() - interval '30 days'), 0) AS monto_30d_anterior,
    round(100.0 * count(venta_id) / nullif(count(*), 0), 1)                     AS conversion,
    round(avg(dias_hasta_venta), 1)                                             AS dias_promedio_venta,
    count(*) FILTER (WHERE public.fn_semaforo('antiguedad', dias_publicada) = 'rojo') AS publicaciones_estancadas
  FROM base
)
SELECT
  publicaciones_activas::int,
  publicaciones_total::int,
  ventas_30d::int,
  ventas_30d_anterior::int,
  monto_30d::float8,
  monto_30d_anterior::float8,
  conversion::float8,
  public.fn_semaforo('conversion', conversion) AS conversion_semaforo,
  dias_promedio_venta::float8,
  publicaciones_estancadas::int
FROM calculo;


-- name: nivel_provincias
-- Nivel 1: una fila por provincia.
SELECT
  provincia_id                                                  AS id,
  coalesce(provincia, 'Sin ubicación')                          AS nombre,
  count(*)::int                                                 AS publicaciones,
  count(*) FILTER (WHERE estado = 'activa')::int                AS activas,
  count(venta_id)::int                                          AS vendidas,
  round(100.0 * count(venta_id) / count(*), 1)::float8          AS conversion,
  coalesce(sum(monto_ars), 0)::float8                           AS monto_total,
  round(avg(dias_hasta_venta), 1)::float8                       AS dias_promedio_venta,
  public.fn_semaforo('conversion', round(100.0 * count(venta_id) / count(*), 1)) AS semaforo
FROM public.vw_tablero_publicacion
GROUP BY provincia_id, provincia
ORDER BY monto_total DESC, nombre;


-- name: nivel_ciudades
-- Nivel 2: ciudades de una provincia ($1).
SELECT
  ciudad_id                                                     AS id,
  ciudad                                                        AS nombre,
  count(*)::int                                                 AS publicaciones,
  count(*) FILTER (WHERE estado = 'activa')::int                AS activas,
  count(venta_id)::int                                          AS vendidas,
  round(100.0 * count(venta_id) / count(*), 1)::float8          AS conversion,
  coalesce(sum(monto_ars), 0)::float8                           AS monto_total,
  round(avg(dias_hasta_venta), 1)::float8                       AS dias_promedio_venta,
  public.fn_semaforo('conversion', round(100.0 * count(venta_id) / count(*), 1)) AS semaforo
FROM public.vw_tablero_publicacion
WHERE provincia_id = $1
GROUP BY ciudad_id, ciudad
ORDER BY monto_total DESC, nombre;


-- name: nivel_vendedores
-- Nivel 3: vendedores de una ciudad ($1).
SELECT
  vendedor_id                                                   AS id,
  vendedor                                                      AS nombre,
  vendedor_tipo                                                 AS tipo,
  count(*)::int                                                 AS publicaciones,
  count(*) FILTER (WHERE estado = 'activa')::int                AS activas,
  count(venta_id)::int                                          AS vendidas,
  round(100.0 * count(venta_id) / count(*), 1)::float8          AS conversion,
  coalesce(sum(monto_ars), 0)::float8                           AS monto_total,
  round(avg(dias_hasta_venta), 1)::float8                       AS dias_promedio_venta,
  public.fn_semaforo('conversion', round(100.0 * count(venta_id) / count(*), 1)) AS semaforo
FROM public.vw_tablero_publicacion
WHERE ciudad_id = $1
GROUP BY vendedor_id, vendedor, vendedor_tipo
ORDER BY monto_total DESC, nombre;


-- name: nivel_publicaciones
-- Nivel 4: publicaciones de un vendedor ($1). El semáforo de antigüedad solo
-- aplica a las activas (las vendidas muestran en cuántos días se vendieron).
SELECT
  publicacion_id                                    AS id,
  marca || ' ' || modelo || ' ' || version          AS vehiculo,
  tipo_nombre                                       AS tipo,
  anio,
  kilometros,
  precio::float8                                    AS precio,
  moneda,
  estado::text                                      AS estado,
  fecha_publicacion,
  dias_publicada,
  fecha_venta,
  dias_hasta_venta,
  monto_ars::float8                                 AS monto_ars,
  medio_pago::text                                  AS medio_pago,
  public.fn_semaforo('antiguedad', dias_publicada)  AS semaforo
FROM public.vw_tablero_publicacion
WHERE vendedor_id = $1
ORDER BY (estado = 'activa') DESC, dias_publicada DESC NULLS LAST, fecha_venta DESC;


-- name: ventas_por_mes
-- Tendencia: ventas y monto de los últimos 12 meses (incluye meses sin ventas).
WITH base AS (
  SELECT * FROM public.vw_tablero_publicacion
  WHERE ($1::int  IS NULL OR provincia_id = $1)
    AND ($2::int  IS NULL OR ciudad_id    = $2)
    AND ($3::uuid IS NULL OR vendedor_id  = $3)
)
SELECT
  to_char(m.mes, 'YYYY-MM')               AS mes,
  count(b.venta_id)::int                  AS ventas,
  coalesce(sum(b.monto_ars), 0)::float8   AS monto
FROM generate_series(date_trunc('month', now()) - interval '11 months',
                     date_trunc('month', now()), interval '1 month') AS m (mes)
LEFT JOIN base b ON date_trunc('month', b.fecha_venta) = m.mes
GROUP BY m.mes
ORDER BY m.mes;


-- name: ventas_por_tipo
-- Tendencia: ventas por tipo de vehículo (incluye tipos sin ventas).
WITH base AS (
  SELECT * FROM public.vw_tablero_publicacion
  WHERE ($1::int  IS NULL OR provincia_id = $1)
    AND ($2::int  IS NULL OR ciudad_id    = $2)
    AND ($3::uuid IS NULL OR vendedor_id  = $3)
)
SELECT
  t.nombre                                  AS tipo,
  count(b.publicacion_id)::int              AS publicaciones,
  count(b.venta_id)::int                    AS ventas,
  coalesce(sum(b.monto_ars), 0)::float8     AS monto
FROM public.tipo_vehiculo t
LEFT JOIN base b ON b.tipo = t.codigo
GROUP BY t.id, t.nombre
ORDER BY t.id;


-- name: antiguedad_activas
-- Distribución de las publicaciones activas según el semáforo de antigüedad.
WITH base AS (
  SELECT * FROM public.vw_tablero_publicacion
  WHERE ($1::int  IS NULL OR provincia_id = $1)
    AND ($2::int  IS NULL OR ciudad_id    = $2)
    AND ($3::uuid IS NULL OR vendedor_id  = $3)
)
SELECT s.estado, count(b.publicacion_id)::int AS publicaciones
FROM (VALUES ('verde', 1), ('amarillo', 2), ('rojo', 3)) AS s (estado, orden)
LEFT JOIN base b
  ON b.estado = 'activa'
 AND public.fn_semaforo('antiguedad', b.dias_publicada) = s.estado
GROUP BY s.estado, s.orden
ORDER BY s.orden;


-- name: contexto
-- Nombres para las migas de pan y control de que el camino sea coherente
-- (que la ciudad pertenezca a la provincia y el vendedor a la ciudad).
SELECT
  (SELECT nombre       FROM public.provincia WHERE id = $1)            AS provincia,
  (SELECT nombre       FROM public.ciudad    WHERE id = $2)            AS ciudad,
  (SELECT provincia_id FROM public.ciudad    WHERE id = $2)::int       AS ciudad_provincia_id,
  (SELECT coalesce(c.nombre, p.nombre_completo)
     FROM public.perfiles p
     LEFT JOIN public.concesionarios c ON c.perfil_id = p.id_usuario
    WHERE p.id_usuario = $3)                                           AS vendedor,
  (SELECT ciudad_id    FROM public.perfiles  WHERE id_usuario = $3)    AS vendedor_ciudad_id;


-- name: parametros_semaforo
-- Umbrales para la referencia que se muestra debajo de cada tabla.
SELECT indicador, limite_verde::float8, limite_amarillo::float8, descripcion
FROM public.parametro_semaforo
WHERE indicador IN ('conversion', 'antiguedad')
ORDER BY indicador DESC;
