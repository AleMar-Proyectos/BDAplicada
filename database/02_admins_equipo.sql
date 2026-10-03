-- =============================================================================
--  MarketCar · Panel de control
--  Script 02 · Alta de los administradores del equipo
--
--  Ejecutar en: Supabase → SQL Editor, DESPUÉS de 01_auth_usuarios.sql.
--  Antes de ejecutar: reemplazar las dos contraseñas (mínimo 8 caracteres).
--  Se puede correr más de una vez: si el correo ya existe, no lo duplica.
-- =============================================================================

do $$
declare
    v_password_alejandro text := 'CAMBIAR_ESTA_CLAVE';   -- ← contraseña de Alejandro
    v_password_federico  text := 'CAMBIAR_ESTA_CLAVE';   -- ← contraseña de Federico
begin
    if 'CAMBIAR_ESTA_CLAVE' in (v_password_alejandro, v_password_federico) then
        raise exception 'Reemplazá las contraseñas antes de ejecutar el script.';
    end if;

    -- Alejandro Marucci
    if not exists (select 1 from auth.users where email = 'alemarucci5@gmail.com') then
        perform public.crear_usuario(
            p_correo          => 'alemarucci5@gmail.com',
            p_password        => v_password_alejandro,
            p_nombre_usuario  => 'alemarucci',
            p_nombre_completo => 'Alejandro Marucci',
            p_tipo_usuario    => 'administrador',
            p_rol             => 'admin');
    end if;

    -- Federico Sebes
    if not exists (select 1 from auth.users where email = 'fedesebes@gmail.com') then
        perform public.crear_usuario(
            p_correo          => 'fedesebes@gmail.com',
            p_password        => v_password_federico,
            p_nombre_usuario  => 'fedesebes',
            p_nombre_completo => 'Federico Sebes',
            p_tipo_usuario    => 'administrador',
            p_rol             => 'admin');
    end if;
end $$;

-- Verificación: ambos con rol admin y contraseña hasheada con bcrypt
select u.nombre_usuario,
       u.nombre_completo,
       u.correo,
       u.rol,
       left(a.encrypted_password, 7) || '…' as hash_bcrypt,
       a.raw_app_meta_data ->> 'rol'         as rol_en_jwt
  from public.perfiles u
  join auth.users     a on a.id = u.id_usuario
 where u.correo in ('alemarucci5@gmail.com', 'fedesebes@gmail.com');
