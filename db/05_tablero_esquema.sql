-- =============================================================================
--  MarketCar · 05_tablero_esquema.sql
--  Lo que necesita el tablero de control (2da entrega):
--    · provincia y ciudad, y la ciudad de cada vendedor (perfiles.ciudad_id)
--    · estado de cada publicación (activa / vendida / pausada)
--    · venta: qué se vendió, cuándo, por cuánto y con qué medio de pago
--    · umbrales del semáforo en parametro_semaforo + función fn_semaforo
--    · vw_tablero_publicacion: vista desnormalizada, una fila p--      con todo resuelto (ub--  Ejecutar en Supabase → SQL Editor después de 02/03/04. Se puede volver a
--  ejecutar: lo que ya existe no se duplica.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ubicación
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provincia (
  id      smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre  text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.ciudad (
  id            integer  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provincia_id  smallint NOT NULL REFERENCES public.provincia (id),
  nombre        text     NOT NULL,
  UNIQUE (provincia_id, nombre)
);
CREATE INDEX IF NOT EXISTS ciudad_provincia_idx ON public.ciudad (provincia_id);

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS ciudad_id integer REFERENCES public.ciudad (id);
CREATE INDEX IF NOT EXISTS perfiles_ciudad_idx ON public.perfiles (ciudad_id);

-- -----------------------------------------------------------------------------
-- 2. Estado de la publicación
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.estado_publicacion AS ENUM ('activa', 'vendida', 'pausada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.vehiculo
  ADD COLUMN IF NOT EXISTS estado public.estado_publicacion NOT NULL DEFAULT 'activa';
CREATE INDEX IF NOT EXISTS vehiculo_estado_idx ON public.vehiculo (estado);

-- -----------------------------------------------------------------------------
-- 3. Ventas
--    Una publicación se vende una sola vez (vehiculo_id UNIQUE).
--    monto_ars: el monto siempre se guarda en pesos para poder sumarlo.
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.medio_pago AS ENUM ('efectivo', 'transferencia', 'financiacion', 'permuta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.venta (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehiculo_id  bigint            NOT NULL UNIQUE REFERENCES public.vehiculo (id),
  fecha        timestamptz       NOT NULL DEFAULT now(),
  monto_ars    numeric(14, 2)    NOT NULL CHECK (monto_ars > 0),
  medio_pago   public.medio_pago NOT NULL,
  created_at   timestamptz       NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venta_fecha_idx ON public.venta (fecha);

-- Al registrar una venta: la fecha no puede ser anterior a la publicación y la
-- publicación pasa a 'vendida'. Así estado y venta nunca se contradicen.
CREATE OR REPLACE FUNCTION public.fn_venta_registrar()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  publicada timestamptz;
BEGIN
  SELECT created_at INTO publicada FROM public.vehiculo WHERE id = NEW.vehiculo_id;
  IF NEW.fecha < publicada THEN
    RAISE EXCEPTION 'La venta (%) no puede ser anterior a la publicación (%).', NEW.fecha, publicada;
  END IF;
  UPDATE public.vehiculo SET estado = 'vendida' WHERE id = NEW.vehiculo_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS venta_registrar ON public.venta;
CREATE TRIGGER venta_registrar
  BEFORE INSERT ON public.venta
  FOR EACH ROW EXECUTE FUNCTION public.fn_venta_registrar();

-- -----------------------------------------------------------------------------
-- 4. Semáforo
--    Si limite_verde >= limite_amarillo, "más es mejor" (conversión).
--    Si limite_verde <  limite_amarillo, "menos es mejor" (antigüedad).
-- -----------------------------------------------------------------------------
INSERT INTO public.parametro_semaforo (indicador, limite_verde, limite_amarillo, descripcion) VALUES
  ('conversion', 40, 20, 'Porcentaje de publicaciones vendidas. Verde: 40 % o más · Amarillo: entre 20 % y 40 % · Rojo: menos de 20 %.'),
  ('antiguedad', 30, 60, 'Días que lleva publicada una oferta sin venderse. Verde: hasta 30 días · Amarillo: 31 a 60 días · Rojo: más de 60 días.')
ON CONFLICT (indicador) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_semaforo(p_indicador text, p_valor numeric)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
           WHEN p_valor IS NULL THEN NULL
           WHEN s.limite_verde >= s.limite_amarillo THEN
             CASE WHEN p_valor >= s.limite_verde    THEN 'verde'
                  WHEN p_valor >= s.limite_amarillo THEN 'amarillo'
                  ELSE 'rojo' END
           ELSE
             CASE WHEN p_valor <= s.limite_verde    THEN 'verde'
                  WHEN p_valor <= s.limite_amarillo THEN 'amarillo'
                  ELSE 'rojo' END
         END
  FROM public.parametro_semaforo s
  WHERE s.indicador = p_indicador
$$;

-- -----------------------------------------------------------------------------
-- 5. Vista desnormalizada del tablero: una fila por publicación
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_tablero_publicacion
WITH (security_invoker = true) AS
SELECT
  v.id                                   AS publicacion_id,
  v.estado,
  v.created_at                           AS fecha_publicacion,
  v.anio,
  v.kilometros,
  v.precio,
  v.moneda,
  v.condicion,
  t.codigo                               AS tipo,
  t.nombre                               AS tipo_nombre,
  ma.nombre                              AS marca,
  mo.nombre                              AS modelo,
  ve.nombre                              AS version,
  p.id_usuario                           AS vendedor_id,
  coalesce(co.nombre, p.nombre_completo) AS vendedor,
  p.tipo_usuario                         AS vendedor_tipo,
  ci.id                                  AS ciudad_id,
  ci.nombre                              AS ciudad,
  pr.id                                  AS provincia_id,
  pr.nombre                              AS provincia,
  vt.id                                  AS venta_id,
  vt.fecha                               AS fecha_venta,
  vt.monto_ars,
  vt.medio_pago,
  CASE WHEN vt.id IS NOT NULL THEN vt.fecha::date - v.created_at::date END AS dias_hasta_venta,
  CASE WHEN v.estado = 'activa' THEN current_date - v.created_at::date END AS dias_publicada
FROM public.vehiculo v
JOIN public.tipo_vehiculo t       ON t.id  = v.tipo_vehiculo_id
JOIN public.version ve            ON ve.id = v.version_id
JOIN public.modelo mo             ON mo.id = ve.modelo_id
JOIN public.marca ma              ON ma.id = mo.marca_id
LEFT JOIN public.perfiles p       ON p.id_usuario = v.usuario_id
LEFT JOIN public.concesionarios co ON co.perfil_id = p.id_usuario
LEFT JOIN public.ciudad ci        ON ci.id = p.ciudad_id
LEFT JOIN public.provincia pr     ON pr.id = ci.provincia_id
LEFT JOIN public.venta vt         ON vt.vehiculo_id = v.id;

-- La vista es para el backend del tablero: no se expone a la API pública.
REVOKE ALL ON public.vw_tablero_publicacion FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Seguridad (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.provincia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ciudad    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venta     ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo el backend

DROP POLICY IF EXISTS lectura_publica ON public.provincia;
DROP POLICY IF EXISTS lectura_publica ON public.ciudad;
CREATE POLICY lectura_publica ON public.provincia FOR SELECT USING (true);
CREATE POLICY lectura_publica ON public.ciudad    FOR SELECT USING (true);

COMMIT;
