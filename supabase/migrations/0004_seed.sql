-- ============================================================================
-- 0004_seed.sql
-- Datos de ejemplo (canchas) y utilidad para dar permisos de administrador.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Bootstrap de administradores
-- 1) Crea el usuario en Supabase Auth (Dashboard -> Authentication -> Users).
-- 2) Copia su UUID y ejecuta:
--    select public.grant_admin('<UUID_DEL_USUARIO>');
-- ----------------------------------------------------------------------------
create or replace function public.grant_admin(p_user_uuid uuid) returns void
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
begin
  insert into public.admins (id) values (p_user_uuid)
  on conflict (id) do nothing;
end;
$$;

revoke execute on function public.grant_admin(uuid) from public;
grant execute on function public.grant_admin(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Canchas de ejemplo (idempotente por slug; reemplazar con datos reales)
-- ----------------------------------------------------------------------------
insert into public.canchas (
  nombre, slug, descripcion, direccion, fotos, precio_por_hora,
  monto_anticipo, numero_nequi, horario_apertura, horario_cierre, duracion_turno_min
) values
  (
    'Cancha Sintética El Campín',
    'cancha-sintetica-el-campin',
    'Cancha de fútbol 5 en grama sintética con iluminación LED y tablero.',
    'Calle 63 # 45 - 20, Bogotá',
    array['https://images.unsplash.com/photo-1529900748604-b075746a11a8'],
    90000,
    30000,
    '573001234567',
    '06:00',
    '22:00',
    60
  ),
  (
    'Microfutbol Los Robles',
    'microfutbol-los-robles',
    'Cancha cubierta de microfútbol ideal para ligas y entrenamientos.',
    'Carrera 20 # 34 - 12, Medellín',
    array['https://images.unsplash.com/photo-1574629810360-7efbbe195018'],
    70000,
    20000,
    '573001234567',
    '08:00',
    '23:00',
    60
  )
on conflict (slug) do nothing;