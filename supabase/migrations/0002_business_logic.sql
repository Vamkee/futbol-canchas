-- ============================================================================
-- 0002_business_logic.sql
-- Funciones de negocio (RPC) y máquina de estados.
-- ============================================================================
-- Nota sobre husos horarios: la plataforma opera en America/Bogota. Las
-- comparaciones entre `date + time` (timestamp sin tz) y `now()` (timestamptz)
-- se resuelven con la zona horaria de la base de datos. Configura el servidor
-- con `timezone = 'America/Bogota'` (ver supabase/config.toml y docs).

-- ----------------------------------------------------------------------------
-- RN-01: Expiración de reservas sin comprobante (15 minutos).
-- ----------------------------------------------------------------------------
create or replace function public.liberar_reservas_expiradas() returns void
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
begin
  update public.reservas
     set estado    = 'CANCELADA',
         motivo_rechazo = coalesce(motivo_rechazo, 'TIMEOUT_COMPROBANTE'),
         expira_en = null
   where estado = 'PENDIENTE_PAGO'
     and comprobante_url is null
     and expira_en is not null
     and expira_en < now();
end;
$$;

-- ----------------------------------------------------------------------------
-- Máquina de estados: evita transiciones inválidas.
-- ----------------------------------------------------------------------------
create or replace function public.validar_transicion_estado() returns trigger
  language plpgsql
as $$
begin
  if new.estado IS DISTINCT FROM old.estado then
    if old.estado in ('CANCELADA', 'RECHAZADA') then
      raise exception 'Estado terminal, la reserva no puede cambiar (E_ESTADO)';
    end if;
    if old.estado = 'CONFIRMADA' and new.estado <> 'CANCELADA' then
      raise exception 'Una reserva confirmada solo puede cancelarse (E_ESTADO)';
    end if;
    if old.estado = 'PENDIENTE_PAGO'
       and new.estado not in ('CONFIRMADA', 'RECHAZADA', 'CANCELADA') then
      raise exception 'Transición de estado inválida (E_ESTADO)';
    end if;
  end if;
  return new;
end;
$$;

create trigger reservas_validar_estado
  before update on public.reservas
  for each row execute function public.validar_transicion_estado();

-- ----------------------------------------------------------------------------
-- Servicio de disponibilidad de franjas (RF-02).
-- Devuelve la parrilla completa de la cancha: LIBRE | OCUPADA | BLOQUEADA.
-- ----------------------------------------------------------------------------
create or replace function public.franjas_disponibles(p_cancha_id bigint, p_fecha date)
  returns table (hora_inicio time, hora_fin time, estado text)
  language plpgsql security definer stable
  set search_path = public, pg_temp
as $$
declare
  v_cancha public.canchas;
  v_base   timestamp := '2020-01-01'::timestamp;
begin
  perform public.liberar_reservas_expiradas();

  select * into v_cancha from public.canchas where id = p_cancha_id;
  if not found then
    raise exception 'Cancha no encontrada (E_CANCHA)';
  end if;

  return query
  with parrilla as (
    select generate_series(
             v_base + v_cancha.horario_apertura,
             v_base + v_cancha.horario_cierre - make_interval(mins => v_cancha.duracion_turno_min),
             make_interval(mins => v_cancha.duracion_turno_min)
           )::time as inicio
  ),
  bloqueadas as (
    select s.inicio
      from parrilla s
      join public.bloqueos b
        on b.cancha_id = p_cancha_id
       and b.fecha = p_fecha
       and b.activo is true
       and b.hora_inicio < s.inicio + make_interval(mins => v_cancha.duracion_turno_min)
       and s.inicio < b.hora_fin
  ),
  ocupadas as (
    select s.inicio
      from parrilla s
      join public.reservas r
        on r.cancha_id = p_cancha_id
       and r.fecha = p_fecha
       and r.estado in ('PENDIENTE_PAGO', 'CONFIRMADA')
       and r.hora_inicio < s.inicio + make_interval(mins => v_cancha.duracion_turno_min)
       and s.inicio < r.hora_fin
  )
  select s.inicio,
         s.inicio + make_interval(mins => v_cancha.duracion_turno_min) as fin,
         case
           when bo.inicio is not null then 'BLOQUEADA'
           when oc.inicio is not null then 'OCUPADA'
           else 'LIBRE'
         end as estado
    from parrilla s
    left join bloqueadas bo on bo.inicio = s.inicio
    left join ocupadas   oc on oc.inicio = s.inicio
   order by s.inicio;
end;
$$;

-- ----------------------------------------------------------------------------
-- CU-01: Crear reserva (bloqueo temporal + Código Único).
-- ----------------------------------------------------------------------------
create or replace function public.crear_reserva(
  p_cancha_slug text,
  p_fecha       date,
  p_hora_inicio time,
  p_nombre_cliente text,
  p_whatsapp    text
) returns public.reservas
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_cancha   public.canchas;
  v_hora_fin time;
  v_reserva  public.reservas;
begin
  perform public.liberar_reservas_expiradas();

  -- Bloquea la fila de la cancha para serializar la creación sobre ella.
  select * into v_cancha
    from public.canchas
   where slug = p_cancha_slug and activa is true
   for update;

  if not found then
    raise exception 'Cancha no encontrada o inactiva (E_CANCHA)';
  end if;

  v_hora_fin := p_hora_inicio + make_interval(mins => v_cancha.duracion_turno_min);

  if p_hora_inicio < v_cancha.horario_apertura or v_hora_fin > v_cancha.horario_cierre then
    raise exception 'Horario fuera de la parrilla de la cancha (E_HORARIO)';
  end if;

  if exists (
    select 1 from public.reservas r
     where r.cancha_id = v_cancha.id
       and r.fecha = p_fecha
       and r.estado in ('PENDIENTE_PAGO', 'CONFIRMADA')
       and r.hora_inicio < v_hora_fin
       and p_hora_inicio < r.hora_fin
  ) then
    raise exception 'Franja horaria ocupada (E_OCUPADA)';
  end if;

  if exists (
    select 1 from public.bloqueos b
     where b.cancha_id = v_cancha.id and b.fecha = p_fecha and b.activo is true
       and b.hora_inicio < v_hora_fin and p_hora_inicio < b.hora_fin
  ) then
    raise exception 'Franja horaria bloqueada (E_BLOQUEADA)';
  end if;

  insert into public.reservas (
    codigo, cancha_id, fecha, hora_inicio, hora_fin,
    nombre_cliente, whatsapp, valor_anticipo, estado, expira_en
  ) values (
    public.generar_codigo(), v_cancha.id, p_fecha, p_hora_inicio, v_hora_fin,
    p_nombre_cliente, p_whatsapp, v_cancha.monto_anticipo,
    'PENDIENTE_PAGO', now() + interval '15 minutes'
  )
  returning * into v_reserva;

  return v_reserva;
end;
$$;

-- ----------------------------------------------------------------------------
-- CU-01: Adjuntar comprobante Nequi (RF-04).
-- Debe ocurrir antes de los 15 minutos (RN-01). Al cargarlo, expira_en = NULL.
-- ----------------------------------------------------------------------------
create or replace function public.adjuntar_comprobante(
  p_codigo        text,
  p_comprobante_url text,
  p_referencia    text default null
) returns public.reservas
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_reserva public.reservas;
begin
  perform public.liberar_reservas_expiradas();

  select * into v_reserva from public.reservas where codigo = p_codigo;
  if not found then
    raise exception 'Reserva no encontrada (E_NOTFOUND)';
  end if;

  if v_reserva.estado <> 'PENDIENTE_PAGO' then
    raise exception 'La reserva no está pendiente de pago (E_ESTADO)';
  end if;

  if v_reserva.comprobante_url is not null then
    raise exception 'Ya existe un comprobante cargado para esta reserva (E_YA_COMPROBANTE)';
  end if;

  if v_reserva.expira_en is not null and v_reserva.expira_en < now() then
    raise exception 'El tiempo de 15 minutos expiró, la franja fue liberada (E_EXPIRADA)';
  end if;

  update public.reservas
     set comprobante_url = p_comprobante_url,
         referencia_pago = p_referencia,
         expira_en       = null
   where id = v_reserva.id
  returning * into v_reserva;

  return v_reserva;
end;
$$;

-- ----------------------------------------------------------------------------
-- RF-06 / CU-03: Obtener reserva por Código Único.
-- ----------------------------------------------------------------------------
create or replace function public.obtener_reserva(p_codigo text)
  returns public.reservas
  language plpgsql security definer stable
  set search_path = public, pg_temp
as $$
declare
  v_reserva public.reservas;
begin
  perform public.liberar_reservas_expiradas();
  select * into v_reserva from public.reservas where codigo = p_codigo;
  return v_reserva;
end;
$$;

-- ----------------------------------------------------------------------------
-- CU-03: Reprogramar reserva (RN-04: faltan más de 6 horas).
-- ----------------------------------------------------------------------------
create or replace function public.reprogramar_reserva(
  p_codigo     text,
  p_nueva_fecha date,
  p_hora_inicio time
) returns public.reservas
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_reserva public.reservas;
  v_cancha  public.canchas;
  v_hora_fin time;
  v_turno_start timestamptz;
begin
  perform public.liberar_reservas_expiradas();

  select * into v_reserva from public.reservas where codigo = p_codigo;
  if not found then
    raise exception 'Reserva no encontrada (E_NOTFOUND)';
  end if;

  if v_reserva.estado not in ('PENDIENTE_PAGO', 'CONFIRMADA') then
    raise exception 'La reserva no admite reprogramación (E_ESTADO)';
  end if;

  v_turno_start := (v_reserva.fecha + v_reserva.hora_inicio)::timestamptz;
  if v_turno_start - now() <= interval '6 hours' then
    raise exception 'Deben faltar más de 6 horas para el turno (E_REPROGRAMAR_6H)';
  end if;

  select * into v_cancha from public.canchas where id = v_reserva.cancha_id;
  v_hora_fin := p_hora_inicio + make_interval(mins => v_cancha.duracion_turno_min);

  if p_hora_inicio < v_cancha.horario_apertura or v_hora_fin > v_cancha.horario_cierre then
    raise exception 'Horario fuera de la parrilla de la cancha (E_HORARIO)';
  end if;

  if exists (
    select 1 from public.reservas r
     where r.cancha_id = v_reserva.cancha_id
       and r.fecha = p_nueva_fecha
       and r.id <> v_reserva.id
       and r.estado in ('PENDIENTE_PAGO', 'CONFIRMADA')
       and r.hora_inicio < v_hora_fin
       and p_hora_inicio < r.hora_fin
  ) then
    raise exception 'Franja horaria ocupada (E_OCUPADA)';
  end if;

  if exists (
    select 1 from public.bloqueos b
     where b.cancha_id = v_reserva.cancha_id and b.fecha = p_nueva_fecha and b.activo is true
       and b.hora_inicio < v_hora_fin and p_hora_inicio < b.hora_fin
  ) then
    raise exception 'Franja horaria bloqueada (E_BLOQUEADA)';
  end if;

  update public.reservas
     set fecha = p_nueva_fecha, hora_inicio = p_hora_inicio, hora_fin = v_hora_fin
   where id = v_reserva.id
  returning * into v_reserva;

  return v_reserva;
end;
$$;

-- ----------------------------------------------------------------------------
-- CU-03: Cancelar reserva (RN-04: faltan más de 6 horas).
-- ----------------------------------------------------------------------------
create or replace function public.cancelar_reserva(p_codigo text)
  returns public.reservas
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_reserva public.reservas;
begin
  select * into v_reserva from public.reservas where codigo = p_codigo;
  if not found then
    raise exception 'Reserva no encontrada (E_NOTFOUND)';
  end if;

  if v_reserva.estado in ('CANCELADA', 'RECHAZADA') then
    raise exception 'La reserva ya está cancelada o rechazada (E_ESTADO)';
  end if;

  if ((v_reserva.fecha + v_reserva.hora_inicio)::timestamptz) - now() <= interval '6 hours' then
    raise exception 'Deben faltar más de 6 horas para el turno (E_REPROGRAMAR_6H)';
  end if;

  update public.reservas set estado = 'CANCELADA' where id = v_reserva.id
  returning * into v_reserva;

  return v_reserva;
end;
$$;

-- ----------------------------------------------------------------------------
-- Otorgar permisos de ejecución sobre los RPC públicos.
-- ----------------------------------------------------------------------------
revoke execute on function public.liberar_reservas_expiradas() from public;
revoke execute on function public.franjas_disponibles(bigint, date) from public;
revoke execute on function public.crear_reserva(text, date, time, text, text) from public;
revoke execute on function public.adjuntar_comprobante(text, text, text) from public;
revoke execute on function public.obtener_reserva(text) from public;
revoke execute on function public.reprogramar_reserva(text, date, time) from public;
revoke execute on function public.cancelar_reserva(text) from public;
revoke execute on function public.is_admin() from public;
revoke execute on function public.generar_codigo() from public;

grant execute on function public.franjas_disponibles(bigint, date) to anon, authenticated;
grant execute on function public.crear_reserva(text, date, time, text, text) to anon, authenticated;
grant execute on function public.adjuntar_comprobante(text, text, text) to anon, authenticated;
grant execute on function public.obtener_reserva(text) to anon, authenticated;
grant execute on function public.reprogramar_reserva(text, date, time) to anon, authenticated;
grant execute on function public.cancelar_reserva(text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;