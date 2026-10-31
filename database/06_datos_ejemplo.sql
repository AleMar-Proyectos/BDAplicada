-- =============================================================================
--  MarketCar · 06_datos_ejemplo.sql
--  Datos iniciales del tablero, cargados con INSERT:
--    · 4 provincias y 12 ciudades
--    · 22 vendedores (concesionarias e independientes) con su ciudad
--    · un catálogo básico de autos, motos y rodados
--    · ~170 publicaciones de los últimos 12 meses y sus ventas
--  Los vendedores tienen resultados distintos a propósito, para que el
--  semáforo muestre los tres estados en todos los niveles.
--
--  Ejecutar después de 05_tablero_esquema.sql. Si se vuelve a ejecutar no
--  duplica nada. Los vendedores de ejemplo usan correos @demo.marketcar.com y
--  la contraseña Vendedor123! (no tienen permiso para entrar al tablero).
--
--  Para borrar solo los datos de ejemplo:
--    DELETE FROM public.venta WHERE vehiculo_id IN (SELECT v.id FROM public.vehiculo v
--      JOIN public.perfiles p ON p.id_usuario = v.usuario_id WHERE p.correo LIKE '%@demo.marketcar.com');
--    DELETE FROM public.vehiculo WHERE usuario_id IN (SELECT id_usuario FROM public.perfiles
--      WHERE correo LIKE '%@demo.marketcar.com');
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Provincias y ciudades
-- -----------------------------------------------------------------------------
INSERT INTO public.provincia (nombre) VALUES
  ('Santa Fe'), ('Buenos Aires'), ('Córdoba'), ('Mendoza')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.ciudad (provincia_id, nombre)
SELECT p.id, c.nombre
FROM (VALUES
  ('Santa Fe', 'Rosario'), ('Santa Fe', 'Santa Fe'), ('Santa Fe', 'Rafaela'),
  ('Buenos Aires', 'La Plata'), ('Buenos Aires', 'Mar del Plata'), ('Buenos Aires', 'Bahía Blanca'),
  ('Córdoba', 'Córdoba'), ('Córdoba', 'Villa María'), ('Córdoba', 'Río Cuarto'),
  ('Mendoza', 'Mendoza'), ('Mendoza', 'Godoy Cruz'), ('Mendoza', 'San Rafael')
) AS c (provincia, nombre)
JOIN public.provincia p ON p.nombre = c.provincia
ON CONFLICT (provincia_id, nombre) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Catálogo: tipo, segmento, marca, modelo, versión, combustible, precio base (ARS)
-- -----------------------------------------------------------------------------
-- Tabla común (no TEMP): el SQL Editor de Supabase no garantiza que todas las
-- sentencias corran en la misma sesión, y una tabla temporal solo existe en la
-- sesión que la creó. Es una tabla auxiliar: se borra al final del script.
DROP TABLE IF EXISTS public.catalogo_ejemplo;
CREATE TABLE public.catalogo_ejemplo AS
SELECT * FROM (VALUES
  ('auto',   'Sedán',      'Toyota',     'Corolla',       '2.0 XEI CVT',     'nafta',  38000000),
  ('auto',   'Sedán',      'Fiat',       'Cronos',        '1.3 Drive',       'nafta',  21000000),
  ('auto',   'Sedán',      'Chevrolet',  'Cruze',         '1.4T LTZ',        'nafta',  33000000),
  ('auto',   'Hatchback',  'Volkswagen', 'Gol Trend',     '1.6 Trendline',   'nafta',  14000000),
  ('auto',   'Hatchback',  'Peugeot',    '208',           '1.6 Allure',      'nafta',  24000000),
  ('auto',   'Hatchback',  'Honda',      'Fit',           '1.5 EX',          'nafta',  22000000),
  ('auto',   'SUV',        'Jeep',       'Renegade',      '1.8 Sport',       'nafta',  31000000),
  ('auto',   'SUV',        'Ford',       'Territory',     '1.5T SEL',        'nafta',  42000000),
  ('auto',   'SUV',        'Renault',    'Duster',        '1.6 Intens',      'nafta',  27000000),
  ('moto',   'Calle',      'Honda',      'CB 190R',       'Estándar',        'nafta',   4200000),
  ('moto',   'Calle',      'Motomel',    'Blitz 110',     'Base',            'nafta',   1300000),
  ('moto',   'Naked',      'Bajaj',      'Rouser NS 200', 'Estándar',        'nafta',   4800000),
  ('moto',   'Scooter',    'Yamaha',     'NMAX 155',      'ABS',             'nafta',   5600000),
  ('moto',   'Enduro',     'Honda',      'XR 150L',       'Estándar',        'nafta',   4500000),
  ('rodado', 'Pickup',     'Toyota',     'Hilux',         '2.8 SRV 4x4',     'diesel', 52000000),
  ('rodado', 'Pickup',     'Ford',       'Ranger',        '3.2 XLT',         'diesel', 46000000),
  ('rodado', 'Pickup',     'Volkswagen', 'Amarok',        '2.0 Highline',    'diesel', 44000000),
  ('rodado', 'Utilitario', 'Renault',    'Kangoo',        '1.6 Express',     'nafta',  19000000)
) AS c (tipo, segmento, marca, modelo, version, combustible, precio_base);

INSERT INTO public.segmento (tipo_vehiculo_id, nombre)
SELECT DISTINCT t.id, c.segmento
FROM public.catalogo_ejemplo c JOIN public.tipo_vehiculo t ON t.codigo = c.tipo
ON CONFLICT (tipo_vehiculo_id, nombre) DO NOTHING;

INSERT INTO public.marca (nombre)
SELECT DISTINCT c.marca FROM public.catalogo_ejemplo c
WHERE NOT EXISTS (SELECT 1 FROM public.marca m WHERE lower(m.nombre) = lower(c.marca));

INSERT INTO public.modelo (tipo_vehiculo_id, marca_id, segmento_id, nombre)
SELECT DISTINCT t.id, m.id, s.id, c.modelo
FROM public.catalogo_ejemplo c
JOIN public.tipo_vehiculo t ON t.codigo = c.tipo
JOIN public.marca m         ON lower(m.nombre) = lower(c.marca)
JOIN public.segmento s      ON s.tipo_vehiculo_id = t.id AND s.nombre = c.segmento
WHERE NOT EXISTS (SELECT 1 FROM public.modelo x
                   WHERE x.tipo_vehiculo_id = t.id AND x.marca_id = m.id
                     AND lower(x.nombre) = lower(c.modelo));

INSERT INTO public.version (tipo_vehiculo_id, modelo_id, nombre, combustible, verificado)
SELECT t.id, mo.id, c.version, c.combustible, true
FROM public.catalogo_ejemplo c
JOIN public.tipo_vehiculo t ON t.codigo = c.tipo
JOIN public.marca m         ON lower(m.nombre) = lower(c.marca)
JOIN public.modelo mo       ON mo.tipo_vehiculo_id = t.id AND mo.marca_id = m.id
                           AND lower(mo.nombre) = lower(c.modelo)
WHERE NOT EXISTS (SELECT 1 FROM public.version x
                   WHERE x.modelo_id = mo.id AND lower(x.nombre) = lower(c.version));

-- -----------------------------------------------------------------------------
-- 3. Vendedores, publicaciones y ventas
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  -- usuario, nombre, tipo, ciudad, probabilidad de vender, cantidad de publicaciones
  vendedores CONSTANT text[][] := ARRAY[
    ['capital.motors',     'Capital Motors',          'concesionaria', 'Rosario',       '0.74', '12'],
    ['rosario.autos',      'Rosario Autos',           'concesionaria', 'Rosario',       '0.62', '11'],
    ['lucia.fernandez',    'Lucía Fernández',         'independiente', 'Rosario',       '0.33', '5'],
    ['litoral.motors',     'Litoral Motors',          'concesionaria', 'Santa Fe',      '0.36', '10'],
    ['martin.gomez',       'Martín Gómez',            'independiente', 'Santa Fe',      '0.20', '5'],
    ['rafaela.cars',       'Rafaela Cars',            'concesionaria', 'Rafaela',       '0.64', '9'],
    ['plata.automotores',  'Plata Automotores',       'concesionaria', 'La Plata',      '0.27', '11'],
    ['sofia.ruiz',         'Sofía Ruiz',              'independiente', 'La Plata',      '0.15', '4'],
    ['costa.autos',        'Costa Autos',             'concesionaria', 'Mar del Plata', '0.30', '10'],
    ['diego.perez',        'Diego Pérez',             'independiente', 'Mar del Plata', '0.10', '5'],
    ['sur.vehiculos',      'Sur Vehículos',           'concesionaria', 'Bahía Blanca',  '0.22', '8'],
    ['mediterranea.autos', 'Mediterránea Autos',      'concesionaria', 'Córdoba',       '0.66', '12'],
    ['juan.lopez',         'Juan López',              'independiente', 'Córdoba',       '0.58', '5'],
    ['villa.motors',       'Villa Motors',            'concesionaria', 'Villa María',   '0.42', '9'],
    ['rio.autos',          'Río Autos',               'concesionaria', 'Río Cuarto',    '0.46', '8'],
    ['carla.diaz',         'Carla Díaz',              'independiente', 'Río Cuarto',    '0.36', '4'],
    ['cuyo.automotores',   'Cuyo Automotores',        'concesionaria', 'Mendoza',       '0.16', '10'],
    ['pablo.sosa',         'Pablo Sosa',              'independiente', 'Mendoza',       '0.10', '4'],
    ['andes.cars',         'Andes Cars',              'concesionaria', 'Godoy Cruz',    '0.22', '8'],
    ['valle.autos',        'Valle Autos',             'concesionaria', 'San Rafael',    '0.18', '7'],
    ['rafael.motos',       'Rafael Motos',            'concesionaria', 'San Rafael',    '0.14', '6'],
    ['ana.torres',         'Ana Torres',              'independiente', 'San Rafael',    '0.28', '4']
  ];
  medios    CONSTANT text[] := ARRAY['transferencia','transferencia','financiacion','financiacion','efectivo','permuta'];
  cajas     text[];
  firma     text[];
  rol_vend  text;
  i         int;
  k         int;
  v_usuario text;  v_correo text;  v_ciudad int;  v_perfil uuid;
  prob      numeric; cantidad int;
  r_tipo    text;  r_version bigint; r_tipo_id smallint; r_base numeric;
  anio_v    int;  km int;  precio_ars numeric;  moneda_v text;  precio_v numeric;
  publicada timestamptz;  vendida timestamptz;  nuevo_id bigint;
BEGIN
  PERFORM setseed(0.42);   -- siempre los mismos datos

  -- Si ya se cargaron publicaciones de ejemplo, no se repite.
  IF EXISTS (SELECT 1 FROM public.vehiculo v JOIN public.perfiles p ON p.id_usuario = v.usuario_id
              WHERE p.correo::text LIKE '%@demo.marketcar.com') THEN
    RAISE NOTICE 'Los datos de ejemplo ya estaban cargados.';
    RETURN;
  END IF;

  -- Firma real de public.crear_usuario (la creó 01_auth_usuarios.sql) para
  -- llamarla con los tipos correctos.
  SELECT array_agg(format_type(a.t, NULL) ORDER BY a.n)
    INTO firma
  FROM pg_proc p, unnest(p.proargtypes) WITH ORDINALITY AS a (t, n)
  WHERE p.proname = 'crear_usuario' AND p.pronamespace = 'public'::regnamespace AND p.pronargs = 6;

  IF firma IS NULL THEN
    RAISE EXCEPTION 'No existe public.crear_usuario(…) con 6 parámetros: ejecutá antes 01_auth_usuarios.sql.';
  END IF;

  -- Rol de un vendedor: el de una cuenta no admin existente o el primer valor no admin del enum.
  SELECT rol::text INTO rol_vend FROM public.perfiles WHERE rol::text <> 'admin' LIMIT 1;
  IF rol_vend IS NULL THEN
    SELECT e.enumlabel INTO rol_vend
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'rol_usuario' AND e.enumlabel <> 'admin'
    ORDER BY e.enumsortorder LIMIT 1;
  END IF;

  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO cajas
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'caja_cambios';

  FOR i IN 1 .. array_length(vendedores, 1) LOOP
    v_usuario := vendedores[i][1];
    v_correo  := v_usuario || '@demo.marketcar.com';
    prob      := vendedores[i][5]::numeric;
    cantidad  := vendedores[i][6]::int;

    SELECT c.id INTO v_ciudad FROM public.ciudad c WHERE c.nombre = vendedores[i][4];

    -- Usa la cuenta si ya existe (por ejemplo capital.motors); si no, la crea.
    SELECT id_usuario INTO v_perfil FROM public.perfiles
     WHERE nombre_usuario::text = v_usuario OR correo::text = v_correo LIMIT 1;

    IF v_perfil IS NULL THEN
      EXECUTE format('SELECT public.crear_usuario(%L::%s, %L::%s, %L::%s, %L::%s, %L::%s, %L::%s)',
                     v_correo, firma[1], 'Vendedor123!', firma[2], v_usuario, firma[3],
                     vendedores[i][2], firma[4], vendedores[i][3], firma[5], rol_vend, firma[6]);
      SELECT id_usuario INTO v_perfil FROM public.perfiles WHERE correo::text = v_correo;
      IF v_perfil IS NULL THEN
        RAISE EXCEPTION 'crear_usuario no generó el perfil de %.', v_correo;
      END IF;
    END IF;

    UPDATE public.perfiles SET ciudad_id = v_ciudad WHERE id_usuario = v_perfil;

    IF vendedores[i][3] = 'concesionaria' THEN
      INSERT INTO public.concesionarios (perfil_id, nombre)
      VALUES (v_perfil, vendedores[i][2])
      ON CONFLICT (perfil_id) DO NOTHING;
    END IF;

    -- Publicaciones del vendedor
    FOR k IN 1 .. cantidad LOOP
      r_tipo := CASE WHEN random() < 0.65 THEN 'auto' WHEN random() < 0.55 THEN 'moto' ELSE 'rodado' END;

      SELECT ve.id, t.id, c.precio_base
        INTO r_version, r_tipo_id, r_base
      FROM public.catalogo_ejemplo c
      JOIN public.tipo_vehiculo t ON t.codigo = c.tipo
      JOIN public.marca m         ON lower(m.nombre) = lower(c.marca)
      JOIN public.modelo mo       ON mo.tipo_vehiculo_id = t.id AND mo.marca_id = m.id
                                 AND lower(mo.nombre) = lower(c.modelo)
      JOIN public.version ve      ON ve.modelo_id = mo.id AND lower(ve.nombre) = lower(c.version)
      WHERE c.tipo = r_tipo
      ORDER BY random() LIMIT 1;

      IF random() < 0.12 THEN
        anio_v := 2025;  km := 0;
      ELSE
        anio_v := 2012 + floor(random() * 13)::int;
        km     := ((2026 - anio_v) * (6000 + floor(random() * 12000)))::int;
      END IF;

      precio_ars := round(r_base * greatest(0.35, 1 - 0.055 * (2025 - anio_v))
                          * (0.9 + random() * 0.2)::numeric, -4);

      IF r_tipo <> 'moto' AND random() < 0.15 THEN
        moneda_v := 'USD';  precio_v := round(precio_ars / 1100, -2);
      ELSE
        moneda_v := 'ARS';  precio_v := precio_ars;
      END IF;

      publicada := now() - make_interval(days => 1 + floor(360 * power(random(), 1.8))::int,
                                         hours => floor(random() * 24)::int);

      INSERT INTO public.vehiculo (tipo_vehiculo_id, version_id, anio, kilometros, precio, moneda,
                                   condicion, caja_cambios, usuario_id, created_at, estado)
      VALUES (r_tipo_id, r_version, anio_v, km, precio_v, moneda_v,
              CASE WHEN km = 0 THEN 'nuevo' ELSE 'usado' END,
              CASE WHEN cajas IS NULL THEN NULL
                   ELSE cajas[1 + floor(random() * array_length(cajas, 1))::int] END::public.caja_cambios,
              v_perfil, publicada,
              CASE WHEN random() < 0.08 THEN 'pausada' ELSE 'activa' END::public.estado_publicacion)
      RETURNING id INTO nuevo_id;

      -- ¿Se vendió? Los buenos vendedores venden más y más rápido.
      IF random() < prob THEN
        vendida := publicada + make_interval(days => 3 + floor(random() * (90 - prob * 70))::int);
        IF vendida < now() THEN
          INSERT INTO public.venta (vehiculo_id, fecha, monto_ars, medio_pago)
          VALUES (nuevo_id, vendida, round(precio_ars * (0.92 + random() * 0.08)::numeric, -3),
                  medios[1 + floor(random() * array_length(medios, 1))::int]::public.medio_pago);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.catalogo_ejemplo;

COMMIT;

-- Verificación
SELECT estado, count(*) FROM public.vehiculo GROUP BY estado ORDER BY estado;
SELECT count(*) AS ventas, sum(monto_ars) AS monto_total_ars FROM public.venta;
