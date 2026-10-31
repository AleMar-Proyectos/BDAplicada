-- =============================================================================
--  MarketCar · 04_ajustes_finales.sql
--  1. Borra las columnas id_origen (solo servían para la migración).
--  2. Reapunta las FK que todavía apuntan a la tabla de respaldo
--     perfiles_anterior_* (concesionarios, suscripciones…) hacia
--     public.perfiles(id_usuario).
--  Corre en una sola transacción: si algún perfil_id no existe en perfiles,
--  falla y no cambia nada.
-- =============================================================================

BEGIN;

-- 1. Columnas de migración
ALTER TABLE public.segmento DROP COLUMN IF EXISTS id_origen;
ALTER TABLE public.modelo   DROP COLUMN IF EXISTS id_origen;
ALTER TABLE public.version  DROP COLUMN IF EXISTS id_origen;
ALTER TABLE public.vehiculo DROP COLUMN IF EXISTS id_origen;

-- 2. FK que apuntan a perfiles_anterior_* → perfiles(id_usuario)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname,
           c.conrelid::regclass AS tabla,
           a.attname            AS columna,
           c.confrelid::regclass AS destino_viejo
    FROM pg_constraint c
    JOIN pg_class d     ON d.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = d.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND d.relname LIKE 'perfiles\_anterior%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabla, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.perfiles (id_usuario)',
                   r.tabla, r.conname, r.columna);
    RAISE NOTICE '%.% ahora apunta a perfiles (antes: %)', r.tabla, r.columna, r.destino_viejo;
  END LOOP;
END $$;

COMMIT;

-- Verificación: ninguna FK debería seguir apuntando a perfiles_anterior_*
SELECT c.conrelid::regclass AS tabla, c.conname, c.confrelid::regclass AS apunta_a
FROM pg_constraint c
JOIN pg_class d ON d.oid = c.confrelid
WHERE c.contype = 'f'
  AND (d.relname = 'perfiles' OR d.relname LIKE 'perfiles\_anterior%')
ORDER BY 3, 1;
