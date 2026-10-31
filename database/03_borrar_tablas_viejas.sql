-- =============================================================================
--  MarketCar · 03_borrar_tablas_viejas.sql
--  Borra las 18 tablas viejas (auto / moto / rodado) y deja solo la
--  estructura unificada creada por 02_unificar_vehiculos.sql.
--
--  Ejecutar DESPUÉS de 02_unificar_vehiculos.sql, completo, en
--  Supabase → SQL Editor. Corre en una sola transacción.
--
--  Antes de borrar hace dos controles y, si alguno falla, frena SIN borrar nada:
--    1. Que la migración se haya hecho (las cantidades viejas y nuevas coinciden).
--    2. Que ninguna otra tabla o vista dependa todavía de las tablas viejas
--       (por ejemplo ventas → autos, o una vista del tablero). Si hay alguna,
--       el mensaje de error dice cuál hay que reapuntar a public.vehiculo.
--
--  ⚠ Borrar es irreversible. No toca usuarios, perfiles, planes ni suscripciones.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  viejas text[] := ARRAY[
    'fotos_auto','fotos_moto','fotos_rodado',
    'autos','motos','rodados',
    'versiones_auto','versiones_moto','versiones_rodado',
    'modelos_auto','modelos_moto','modelos_rodado',
    'marcas_auto','marcas_moto','marcas_rodado',
    'segmentos_auto','segmentos_moto','segmentos_rodado'];
  antes    bigint;
  despues  bigint;
  dependencias text;
BEGIN
  -- 1. ¿Se corrió la migración?
  IF to_regclass('public.vehiculo') IS NULL THEN
    RAISE EXCEPTION 'No existe public.vehiculo: primero ejecutá 02_unificar_vehiculos.sql.';
  END IF;

  SELECT (SELECT count(*) FROM public.autos)
       + (SELECT count(*) FROM public.motos)
       + (SELECT count(*) FROM public.rodados),
         (SELECT count(*) FROM public.vehiculo)
    INTO antes, despues;

  IF antes <> despues THEN
    RAISE EXCEPTION 'Las publicaciones no coinciden (viejas: %, nuevas: %). No se borra nada.',
      antes, despues;
  END IF;

  -- 2. ¿Alguna tabla o vista de afuera depende de las tablas viejas?
  SELECT string_agg(DISTINCT detalle, E'\n  ')
    INTO dependencias
  FROM (
    -- claves foráneas desde otras tablas
    SELECT format('FK %s.%s → %s', c.conrelid::regclass, c.conname, c.confrelid::regclass) AS detalle
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid IN (SELECT format('public.%I', t)::regclass FROM unnest(viejas) t)
      AND c.conrelid NOT IN (SELECT format('public.%I', t)::regclass FROM unnest(viejas) t)
    UNION
    -- vistas que usan las tablas viejas
    SELECT format('VISTA %s usa %s', v.oid::regclass, d.refobjid::regclass)
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class v   ON v.oid = r.ev_class
    WHERE d.refobjid IN (SELECT format('public.%I', t)::regclass FROM unnest(viejas) t)
      AND v.oid NOT IN (SELECT format('public.%I', t)::regclass FROM unnest(viejas) t)
  ) x;

  IF dependencias IS NOT NULL THEN
    RAISE EXCEPTION E'Todavía hay objetos que usan las tablas viejas. Reapuntalos a public.vehiculo (o borralos) y volvé a ejecutar:\n  %',
      dependencias;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Borrado, de hijas a padres (sin CASCADE: si algo inesperado depende, falla)
-- -----------------------------------------------------------------------------
DROP TABLE public.fotos_auto,      public.fotos_moto,      public.fotos_rodado;
DROP TABLE public.autos,           public.motos,           public.rodados;
DROP TABLE public.versiones_auto,  public.versiones_moto,  public.versiones_rodado;
DROP TABLE public.modelos_auto,    public.modelos_moto,    public.modelos_rodado;
DROP TABLE public.marcas_auto,     public.marcas_moto,     public.marcas_rodado;
DROP TABLE public.segmentos_auto,  public.segmentos_moto,  public.segmentos_rodado;

-- Las columnas de migración ya no hacen falta
ALTER TABLE public.segmento DROP COLUMN id_origen;
ALTER TABLE public.modelo   DROP COLUMN id_origen;
ALTER TABLE public.version  DROP COLUMN id_origen;
ALTER TABLE public.vehiculo DROP COLUMN id_origen;

COMMIT;

-- Verificación: tienen que quedar solo las 7 tablas nuevas de vehículos
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('tipo_vehiculo','segmento','marca','modelo','version',
                     'vehiculo','foto_vehiculo',
                     'autos','motos','rodados','marcas_auto','modelos_auto')
ORDER BY table_name;
