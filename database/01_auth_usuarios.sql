-- =============================================================================
--  MarketCar · Panel de control
--  Script 01 · Usuarios, roles y autenticación (Supabase / PostgreSQL)
--
--  Ejecutar en: Supabase → SQL Editor (se puede correr más de una vez).
--
--  Decisiones de diseño
--  ---------------------------------------------------------------------------
--  * Las credenciales viven en auth.users (tabla de Supabase Auth). La contraseña
--    NUNCA se guarda en texto plano: se almacena como hash bcrypt (pgcrypto,
--    crypt + gen_salt('bf', 10)), que incluye una sal aleatoria por usuario.
--  * public.perfiles es el PERFIL de negocio (nombre de usuario, rol, estado).
--    Relación 1 a 1 con auth.users por la misma clave (uuid).
--  * El rol se replica en auth.users.raw_app_meta_data, por eso viaja firmado
--    dentro del JWT (claim app_metadata.rol). Así la API .NET puede autorizar
--    sin consultar la base en cada request. app_metadata solo lo puede
--    modificar el servidor (a diferencia de user_metadata).
--  * RLS activado: con la anon key nadie puede listar usuarios.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext   with schema extensions;

-- -----------------------------------------------------------------------------
-- Tipo enumerado de roles
-- -----------------------------------------------------------------------------
do $$
begin
    create type public.rol_usuario as enum ('admin', 'vendedor');
exception
    when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- Si ya existe una tabla "perfiles" ANTERIOR con otra estructura (por ejemplo,
-- la de una plantilla de Supabase), no se borra: se renombra para conservar
-- sus datos y se crea la nueva.
-- -----------------------------------------------------------------------------
do $$
declare
    v_nombre text := 'perfiles_anterior_' || to_char(now(), 'YYYYMMDD_HH24MISS');
begin
    if to_regclass('public.perfiles') is not null
       and not exists (select 1 from information_schema.columns
                        where table_schema = 'public' and table_name = 'perfiles'
                          and column_name = 'nombre_usuario') then
        execute format('alter table public.perfiles rename to %I', v_nombre);
        raise notice 'La tabla perfiles anterior se renombró a "%" (sus datos se conservan).', v_nombre;
    end if;
end $$;

-- -----------------------------------------------------------------------------
-- Tabla de perfiles (usuarios del sistema)
-- -----------------------------------------------------------------------------
create table if not exists public.perfiles (
    id_usuario       uuid                 not null,
    nombre_usuario   extensions.citext    not null,
    correo           extensions.citext    not null,
    nombre_completo  varchar(120)         not null,
    tipo_usuario     varchar(20)          not null default 'independiente',
    rol              public.rol_usuario   not null default 'vendedor',
    activo           boolean              not null default true,
    fecha_alta       timestamptz          not null default now(),
    ultimo_acceso    timestamptz,

    constraint pk_perfiles         primary key (id_usuario),
    constraint fk_perfiles_auth    foreign key (id_usuario) references auth.users (id) on delete cascade,
    constraint uq_perfiles_nombre   unique (nombre_usuario),
    constraint uq_perfiles_correo   unique (correo),
    constraint ck_perfiles_nombre   check  (nombre_usuario::text ~ '^[a-z0-9._-]{3,30}$'),
    constraint ck_perfiles_correo   check  (correo::text ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    constraint ck_perfiles_tipo     check  (tipo_usuario in ('administrador', 'concesionaria', 'independiente'))
);

comment on table  public.perfiles                is 'Perfil de negocio de cada cuenta de Supabase Auth (1 a 1 con auth.users).';
comment on column public.perfiles.rol            is 'admin: accede al panel de control · vendedor: solo marketplace.';
comment on column public.perfiles.ultimo_acceso  is 'Fecha del último inicio de sesión exitoso en el panel.';

create index if not exists ix_perfiles_rol on public.perfiles (rol) where activo;

-- -----------------------------------------------------------------------------
-- Trigger: replica rol y estado en app_metadata → viajan dentro del JWT
-- -----------------------------------------------------------------------------
create or replace function public.fn_perfiles_sincronizar_jwt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                               || jsonb_build_object('rol',    new.rol::text,
                                                     'activo', new.activo)
     where id = new.id_usuario;
    return new;
end;
$$;

drop trigger if exists tg_perfiles_sincronizar_jwt on public.perfiles;
create trigger tg_perfiles_sincronizar_jwt
    after insert or update of rol, activo on public.perfiles
    for each row execute function public.fn_perfiles_sincronizar_jwt();

-- -----------------------------------------------------------------------------
-- Alta de usuarios desde SQL (para los datos iniciales con INSERT)
--   Inserta en auth.users (hash bcrypt), auth.identities (proveedor email)
--   y public.perfiles en una sola transacción.
-- -----------------------------------------------------------------------------
create or replace function public.crear_usuario(
    p_correo           text,
    p_password         text,
    p_nombre_usuario   text,
    p_nombre_completo  text,
    p_tipo_usuario     text               default 'independiente',
    p_rol              public.rol_usuario default 'vendedor'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id     uuid := gen_random_uuid();
    v_correo text := lower(trim(p_correo));
begin
    if length(coalesce(p_password, '')) < 8 then
        raise exception 'La contraseña debe tener al menos 8 caracteres';
    end if;

    insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_correo,
        extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
        now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('nombre_usuario', lower(p_nombre_usuario)),
        now(), now(),
        '', '', '', ''
    );

    insert into auth.identities (
        id, user_id, provider_id, provider, identity_data,
        last_sign_in_at, created_at, updated_at
    ) values (
        gen_random_uuid(), v_id, v_id::text, 'email',
        jsonb_build_object('sub', v_id::text, 'email', v_correo, 'email_verified', true),
        now(), now(), now()
    );

    insert into public.perfiles (id_usuario, nombre_usuario, correo, nombre_completo, tipo_usuario, rol)
    values (v_id, lower(p_nombre_usuario), v_correo, p_nombre_completo, p_tipo_usuario, p_rol);

    return v_id;
end;
$$;

-- Solo el dueño de la base (SQL Editor / backend) puede crear usuarios.
revoke all on function public.crear_usuario(text, text, text, text, text, public.rol_usuario)
    from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.perfiles enable row level security;

drop policy if exists perfiles_ver_propio on public.perfiles;
create policy perfiles_ver_propio
    on public.perfiles for select
    to authenticated
    using (id_usuario = (select auth.uid()));

drop policy if exists perfiles_admin_ver_todos on public.perfiles;
create policy perfiles_admin_ver_todos
    on public.perfiles for select
    to authenticated
    using (((select auth.jwt()) -> 'app_metadata' ->> 'rol') = 'admin');

-- Sin políticas de insert/update/delete: no hay ABM desde el cliente.

-- -----------------------------------------------------------------------------
-- Datos iniciales (INSERT a través de la función)
-- -----------------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from auth.users where email = 'admin@marketcar.com') then
        perform public.crear_usuario('admin@marketcar.com', 'Admin123!',
                                     'admin', 'Administrador MarketCar',
                                     'administrador', 'admin');
    end if;

    -- Cuenta SIN permiso de administrador: sirve para demostrar el rechazo (403).
    if not exists (select 1 from auth.users where email = 'capital.motors@demo.marketcar.com') then
        perform public.crear_usuario('capital.motors@demo.marketcar.com', 'Vendedor123!',
                                     'capital.motors', 'Capital Motors',
                                     'concesionaria', 'vendedor');
    end if;
end $$;

-- Verificación: la contraseña quedó hasheada (empieza con $2a$ / $2b$, nunca texto plano)
select u.nombre_usuario,
       u.correo,
       u.rol,
       left(a.encrypted_password, 7) || '…'  as hash_bcrypt,
       a.raw_app_meta_data ->> 'rol'          as rol_en_jwt
  from public.perfiles u
  join auth.users     a on a.id = u.id_usuario
 order by u.rol, u.nombre_usuario;
