-- =============================================================================
--  MarketCar · 02_unificar_vehiculos.sql
--  Corrección: unificar las tres jerarquías paralelas (auto / moto / rodado)
--  en una sola estructura con un tipo de vehículo que las distingue.
--
--  ANTES (18 tablas, 3 copias del mismo diseño):
--    segmentos_auto  marcas_auto  modelos_auto  versiones_auto  autos    fotos_auto
--    segmentos_moto  marcas_moto  modelos_moto  versiones_moto  motos    fotos_moto
--    segmentos_rodado marcas_rodado modelos_rodado versiones_rodado rodados fotos_rodado
--
--  DESPUÉS (7 tablas):
--    tipo_vehiculo ─┬─ segmento ─┐
--                   │            ├─ modelo ── version ── vehiculo ── foto_vehiculo
--    marca ─────────┴────────────┘
--
--  · La marca es una sola para todos los tipos (Honda hace autos y motos).
--  · El tipo de vehículo viaja en segmento, modelo, version y vehiculo y se
--    controla con claves foráneas compuestas: es imposible, por ejemplo,
--    colgar una versión de moto de un modelo de auto.
--  · vehiculo.tipo_vehiculo_id es un dato redundante a propósito
--    (desnormalización controlada): permite filtrar "solo motos" sin
--    recorrer versión → modelo, y las FK garantizan que nunca se contradiga.
--  · Al final se crea vw_vehiculo: una fila por publicación con marca, modelo,
--    segmento y versión ya resueltos (vista desnormalizada para el tablero).
--
--  Las tablas viejas NO se borran: el script migra los datos a las nuevas y
--  deja la limpieza para cuando la app del marketplace use las nuevas tablas
--  (ver sección 6, comentada).
--
--  Ejecutar completo en Supabase → SQL Editor. Corre en una sola transacción:
--  si algo falla, no queda nada a medio hacer.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Catálogo de tipos
-- -----------------------------------------------------------------------------
CREATE TABLE public.tipo_vehiculo (
  id      smallint PRIMARY KEY,
  codigo  text NOT NULL UNIQUE,
  nombre  text NOT NULL
);

INSERT INTO public.tipo_vehiculo (id, codigo, nombre) VALUES
  (1, 'auto',   'Auto'),
  (2, 'moto',   'Moto'),
  (3, 'rodado', 'Rodado');

-- -----------------------------------------------------------------------------
-- 2. Tablas unificadas
--    id_origen guarda el id que tenía la fila en su tabla vieja. Sirve para
--    migrar y para reapuntar otras tablas (ventas, favoritos…); se puede
--    borrar en la sección 6.
-- -----------------------------------------------------------------------------
CREATE TABLE public.segmento (
  id                smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo_vehiculo_id  smallint NOT NULL REFERENCES public.tipo_vehiculo (id),
  nombre            text     NOT NULL,
  id_origen         smallint,
  UNIQUE (tipo_vehiculo_id, nombre),
  UNIQUE (id, tipo_vehiculo_id)            -- destino de la FK compuesta de modelo
);

CREATE TABLE public.marca (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre      text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX marca_nombre_uq ON public.marca (lower(nombre));

CREATE TABLE public.modelo (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo_vehiculo_id  smallint    NOT NULL REFERENCES public.tipo_vehiculo (id),
  marca_id          bigint      NOT NULL REFERENCES public.marca (id),
  segmento_id       smallint,
  nombre            text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  id_origen         bigint,
  FOREIGN KEY (segmento_id, tipo_vehiculo_id)
    REFERENCES public.segmento (id, tipo_vehiculo_id),
  UNIQUE (id, tipo_vehiculo_id)
);

CREATE TABLE public.version (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo_vehiculo_id  smallint    NOT NULL,
  modelo_id         bigint      NOT NULL,
  nombre            text        NOT NULL,
  combustible       text,                         -- los rodados no tienen
  verificado        boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  id_origen         bigint,
  FOREIGN KEY (modelo_id, tipo_vehiculo_id)
    REFERENCES public.modelo (id, tipo_vehiculo_id),
  UNIQUE (id, tipo_vehiculo_id)
);

CREATE TABLE public.vehiculo (                    -- la publicación
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo_vehiculo_id  smallint    NOT NULL,
  version_id        bigint      NOT NULL,
  anio              integer,
  kilometros        integer,
  precio            numeric,
  moneda            text,
  condicion         text,
  caja_cambios      public.caja_cambios,
  usuario_id        uuid        NOT NULL REFERENCES auth.users (id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  id_origen         bigint,
  FOREIGN KEY (version_id, tipo_vehiculo_id)
    REFERENCES public.version (id, tipo_vehiculo_id)
);

CREATE TABLE public.foto_vehiculo (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehiculo_id   bigint      NOT NULL REFERENCES public.vehiculo (id) ON DELETE CASCADE,
  ruta          text        NOT NULL,
  orden         integer     NOT NULL DEFAULT 0,
  fecha_subida  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX modelo_marca_idx         ON public.modelo (marca_id);
CREATE INDEX version_modelo_idx       ON public.version (modelo_id);
CREATE INDEX vehiculo_tipo_idx        ON public.vehiculo (tipo_vehiculo_id);
CREATE INDEX vehiculo_version_idx     ON public.vehiculo (version_id);
CREATE INDEX vehiculo_usuario_idx     ON public.vehiculo (usuario_id);
CREATE INDEX foto_vehiculo_veh_idx    ON public.foto_vehiculo (vehiculo_id, orden);

-- -----------------------------------------------------------------------------
-- 3. Migración de datos
--    Se usan LEFT JOIN a propósito: si algún dato viejo no tiene su padre,
--    el NOT NULL hace fallar el script (y se revierte todo) en vez de perder
--    filas sin avisar.
-- -----------------------------------------------------------------------------

-- 3.1 Segmentos
INSERT INTO public.segmento (tipo_vehiculo_id, nombre, id_origen)
SELECT 1, nombre, id FROM public.segmentos_auto
UNION ALL
SELECT 2, nombre, id FROM public.segmentos_moto
UNION ALL
SELECT 3, nombre, id FROM public.segmentos_rodado;

-- 3.2 Marcas: una sola fila por nombre (sin distinguir mayúsculas/espacios)
INSERT INTO public.marca (nombre, created_at)
SELECT min(trim(nombre)), min(created_at)
FROM (
  SELECT nombre, created_at FROM public.marcas_auto
  UNION ALL
  SELECT nombre, created_at FROM public.marcas_moto
  UNION ALL
  SELECT nombre, created_at FROM public.marcas_rodado
) m
GROUP BY lower(trim(nombre));

-- 3.3 Modelos
INSERT INTO public.modelo (tipo_vehiculo_id, marca_id, segmento_id, nombre, created_at, id_origen)
SELECT 1, ma.id, s.id, mo.nombre, mo.created_at, mo.id
FROM public.modelos_auto mo
LEFT JOIN public.marcas_auto mx ON mx.id = mo.marca_id
LEFT JOIN public.marca ma       ON lower(ma.nombre) = lower(trim(mx.nombre))
LEFT JOIN public.segmento s     ON s.tipo_vehiculo_id = 1 AND s.id_origen = mo.segmento_id
UNION ALL
SELECT 2, ma.id, s.id, mo.nombre, mo.created_at, mo.id
FROM public.modelos_moto mo
LEFT JOIN public.marcas_moto mx ON mx.id = mo.marca_id
LEFT JOIN public.marca ma       ON lower(ma.nombre) = lower(trim(mx.nombre))
LEFT JOIN public.segmento s     ON s.tipo_vehiculo_id = 2 AND s.id_origen = mo.segmento_id
UNION ALL
SELECT 3, ma.id, s.id, mo.nombre, mo.created_at, mo.id
FROM public.modelos_rodado mo
LEFT JOIN public.marcas_rodado mx ON mx.id = mo.marca_id
LEFT JOIN public.marca ma         ON lower(ma.nombre) = lower(trim(mx.nombre))
LEFT JOIN public.segmento s       ON s.tipo_vehiculo_id = 3 AND s.id_origen = mo.segmento_id;

-- 3.4 Versiones
INSERT INTO public.version (tipo_vehiculo_id, modelo_id, nombre, combustible, verificado, created_at, id_origen)
SELECT 1, m.id, v.nombre, v.combustible::text, coalesce(v.verificado, false), v.created_at, v.id
FROM public.versiones_auto v
LEFT JOIN public.modelo m ON m.tipo_vehiculo_id = 1 AND m.id_origen = v.modelo_id
UNION ALL
SELECT 2, m.id, v.nombre, v.combustible::text, coalesce(v.verificado, false), v.created_at, v.id
FROM public.versiones_moto v
LEFT JOIN public.modelo m ON m.tipo_vehiculo_id = 2 AND m.id_origen = v.modelo_id
UNION ALL
SELECT 3, m.id, v.nombre, NULL, coalesce(v.verificado, false), v.created_at, v.id
FROM public.versiones_rodado v
LEFT JOIN public.modelo m ON m.tipo_vehiculo_id = 3 AND m.id_origen = v.modelo_id;

-- 3.5 Publicaciones
INSERT INTO public.vehiculo (tipo_vehiculo_id, version_id, anio, kilometros, precio, moneda,
                             condicion, caja_cambios, usuario_id, created_at, id_origen)
SELECT 1, ve.id, a.anio, a.kilometros, a.precio, a.moneda, a.condicion, a.caja_cambios,
       a.usuario_id, a.created_at, a.id
FROM public.autos a
LEFT JOIN public.version ve ON ve.tipo_vehiculo_id = 1 AND ve.id_origen = a.version_id
UNION ALL
SELECT 2, ve.id, a.anio, a.kilometros, a.precio, a.moneda, a.condicion, a.caja_cambios,
       a.usuario_id, a.created_at, a.id
FROM public.motos a
LEFT JOIN public.version ve ON ve.tipo_vehiculo_id = 2 AND ve.id_origen = a.version_id
UNION ALL
SELECT 3, ve.id, a.anio, a.kilometros, a.precio, a.moneda, a.condicion, a.caja_cambios,
       a.usuario_id, a.created_at, a.id
FROM public.rodados a
LEFT JOIN public.version ve ON ve.tipo_vehiculo_id = 3 AND ve.id_origen = a.version_id;

-- 3.6 Fotos
INSERT INTO public.foto_vehiculo (vehiculo_id, ruta, orden, fecha_subida)
SELECT v.id, f.ruta, coalesce(f.orden, 0), f.fecha_subida
FROM public.fotos_auto f
JOIN public.vehiculo v ON v.tipo_vehiculo_id = 1 AND v.id_origen = f.auto_id
UNION ALL
SELECT v.id, f.ruta, coalesce(f.orden, 0), f.fecha_subida
FROM public.fotos_moto f
JOIN public.vehiculo v ON v.tipo_vehiculo_id = 2 AND v.id_origen = f.moto_id
UNION ALL
SELECT v.id, f.ruta, coalesce(f.orden, 0), f.fecha_subida
FROM public.fotos_rodado f
JOIN public.vehiculo v ON v.tipo_vehiculo_id = 3 AND v.id_origen = f.rodado_id;

-- -----------------------------------------------------------------------------
-- 4. Vista desnormalizada para el tablero: una fila por publicación
-- -----------------------------------------------------------------------------
CREATE VIEW public.vw_vehiculo
WITH (security_invoker = true) AS          -- respeta la RLS de quien consulta
SELECT
  v.id,
  t.codigo            AS tipo,
  t.nombre            AS tipo_nombre,
  ma.nombre           AS marca,
  mo.nombre           AS modelo,
  s.nombre            AS segmento,
  ve.nombre           AS version,
  ve.combustible,
  ve.verificado       AS version_verificada,
  v.anio,
  v.kilometros,
  v.precio,
  v.moneda,
  v.condicion,
  v.caja_cambios,
  v.usuario_id,
  v.created_at,
  (SELECT f.ruta FROM public.foto_vehiculo f
    WHERE f.vehiculo_id = v.id ORDER BY f.orden, f.id LIMIT 1) AS foto_portada,
  (SELECT count(*) FROM public.foto_vehiculo f
    WHERE f.vehiculo_id = v.id)                                AS cantidad_fotos
FROM public.vehiculo v
JOIN public.tipo_vehiculo t ON t.id  = v.tipo_vehiculo_id
JOIN public.version ve      ON ve.id = v.version_id
JOIN public.modelo mo       ON mo.id = ve.modelo_id
JOIN public.marca ma        ON ma.id = mo.marca_id
LEFT JOIN public.segmento s ON s.id  = mo.segmento_id;

-- -----------------------------------------------------------------------------
-- 5. Seguridad (RLS)
--    Catálogo y publicaciones: lectura pública (es un marketplace).
--    Publicaciones y fotos: cada usuario solo modifica las suyas.
--    El catálogo solo se modifica con la service role (admin / backend).
-- -----------------------------------------------------------------------------
ALTER TABLE public.tipo_vehiculo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segmento       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marca          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modelo         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.version        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculo       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foto_vehiculo  ENABLE ROW LEVEL SECURITY;

CREATE POLICY lectura_publica ON public.tipo_vehiculo FOR SELECT USING (true);
CREATE POLICY lectura_publica ON public.segmento      FOR SELECT USING (true);
CREATE POLICY lectura_publica ON public.marca         FOR SELECT USING (true);
CREATE POLICY lectura_publica ON public.modelo        FOR SELECT USING (true);
CREATE POLICY lectura_publica ON public.version       FOR SELECT USING (true);
CREATE POLICY lectura_publica ON public.vehiculo      FOR SELECT USING (true);
CREATE POLICY lectura_publica ON public.foto_vehiculo FOR SELECT USING (true);

CREATE POLICY propietario_escribe ON public.vehiculo
  FOR ALL TO authenticated
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

CREATE POLICY propietario_escribe ON public.foto_vehiculo
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vehiculo v
                  WHERE v.id = vehiculo_id AND v.usuario_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vehiculo v
                       WHERE v.id = vehiculo_id AND v.usuario_id = auth.uid()));

COMMIT;

-- -----------------------------------------------------------------------------
-- Verificación: las cantidades viejas y nuevas tienen que coincidir
-- -----------------------------------------------------------------------------
SELECT 'segmentos' AS entidad,
       (SELECT count(*) FROM segmentos_auto) + (SELECT count(*) FROM segmentos_moto)
     + (SELECT count(*) FROM segmentos_rodado)                         AS antes,
       (SELECT count(*) FROM segmento)                                 AS despues
UNION ALL
SELECT 'modelos',
       (SELECT count(*) FROM modelos_auto) + (SELECT count(*) FROM modelos_moto)
     + (SELECT count(*) FROM modelos_rodado),
       (SELECT count(*) FROM modelo)
UNION ALL
SELECT 'versiones',
       (SELECT count(*) FROM versiones_auto) + (SELECT count(*) FROM versiones_moto)
     + (SELECT count(*) FROM versiones_rodado),
       (SELECT count(*) FROM version)
UNION ALL
SELECT 'publicaciones',
       (SELECT count(*) FROM autos) + (SELECT count(*) FROM motos)
     + (SELECT count(*) FROM rodados),
       (SELECT count(*) FROM vehiculo)
UNION ALL
SELECT 'fotos',
       (SELECT count(*) FROM fotos_auto) + (SELECT count(*) FROM fotos_moto)
     + (SELECT count(*) FROM fotos_rodado),
       (SELECT count(*) FROM foto_vehiculo);
-- (Las marcas pueden dar menos "despues" que "antes": las repetidas entre tipos se unifican.)

-- =============================================================================
-- 6. LIMPIEZA — ejecutar recién cuando la app del marketplace use las tablas
--    nuevas. Antes, reapuntar las tablas que referencian a autos/motos/rodados
--    (por ejemplo ventas o favoritos) usando id_origen. Ejemplo para ventas:
--
--    ALTER TABLE public.venta ADD COLUMN vehiculo_id bigint REFERENCES public.vehiculo (id);
--    UPDATE public.venta x SET vehiculo_id = v.id
--      FROM public.vehiculo v
--     WHERE v.tipo_vehiculo_id = 1 AND v.id_origen = x.auto_id;   -- idem moto (2) y rodado (3)
--    ALTER TABLE public.venta DROP COLUMN auto_id;               -- y moto_id / rodado_id
--
--    Después:
--
--    DROP TABLE public.fotos_auto, public.fotos_moto, public.fotos_rodado;
--    DROP TABLE public.autos, public.motos, public.rodados;
--    DROP TABLE public.versiones_auto, public.versiones_moto, public.versiones_rodado;
--    DROP TABLE public.modelos_auto, public.modelos_moto, public.modelos_rodado;
--    DROP TABLE public.marcas_auto, public.marcas_moto, public.marcas_rodado;
--    DROP TABLE public.segmentos_auto, public.segmentos_moto, public.segmentos_rodado;
--    ALTER TABLE public.segmento DROP COLUMN id_origen;
--    ALTER TABLE public.modelo   DROP COLUMN id_origen;
--    ALTER TABLE public.version  DROP COLUMN id_origen;
--    ALTER TABLE public.vehiculo DROP COLUMN id_origen;
-- =============================================================================
