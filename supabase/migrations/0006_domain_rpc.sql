-- ============================================================================
-- 0006_domain_rpc.sql
-- Funciones de negocio (RPC) sobre el nuevo modelo: cotización, HOLD con
-- asignación automática de unidad (23.7), pagos con verificación humana,
-- cambios (G3), bloqueos con resolución (IND1), día del partido (sección 10)
-- y procesos automáticos idempotentes (sección 17). Todas auditadas (K8).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
create or replace function public.is_member(p_business_id uuid) returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.business_members m
     where m.business_id = p_business_id and m.user_id = auth.uid() and m.active
  );
$$;

create or replace function public.log_audit(
  p_actor_type text, p_actor_id uuid, p_business_id uuid,
  p_entity text, p_entity_id text, p_action text,
  p_old jsonb default null, p_new jsonb default null
) returns void
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
begin
  insert into public.audit_log (actor_type, actor_id, business_id, entity, entity_id, action, old_data, new_data)
  values (p_actor_type, p_actor_id, p_business_id, p_entity, p_entity_id, p_action, p_old, p_new);
end;
$$;

create or replace function public.generate_booking_code() returns text
  language plpgsql volatile security definer
  set search_path = public, pg_temp
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sin O,0,I,1 (23.10)
  v_code     text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substring(v_alphabet from (1 + floor(random() * length(v_alphabet)))::int for 1);
    end loop;
    if not exists (select 1 from public.bookings where code = v_code) then
      return v_code;
    end if;
  end loop;
end;
$$;

-- pgcrypto (digest, gen_random_bytes) vive en el esquema `extensions` en
-- Supabase por convención, no en `public`; se incluye explícitamente aquí.
create or replace function public.hash_token(p_token text) returns text
  language sql immutable security definer
  set search_path = public, extensions, pg_temp
as $$
  select encode(digest(p_token, 'sha256'), 'hex');
$$;

create or replace function public.random_token() returns text
  language sql volatile security definer
  set search_path = public, extensions, pg_temp
as $$
  select encode(gen_random_bytes(32), 'hex');
$$;

-- Ventana horaria del espacio (o su sede) para un intervalo, con cruce de
-- medianoche (R5): close_time <= open_time significa que cierra al día siguiente.
create or replace function public.space_covers_interval(
  p_space_id uuid, p_starts_at timestamptz, p_ends_at timestamptz
) returns boolean
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  v_venue_id uuid;
  v_weekday  smallint;
  v_day      date;
  v_row      record;
  v_win_start timestamptz;
  v_win_end   timestamptz;
begin
  select venue_id into v_venue_id from public.spaces where id = p_space_id;
  v_day := (p_starts_at at time zone 'America/Bogota')::date;
  v_weekday := extract(dow from (p_starts_at at time zone 'America/Bogota'))::smallint;

  for v_row in
    select open_time, close_time
      from public.opening_hours
     where weekday = v_weekday
       and valid_from <= v_day
       and (valid_to is null or valid_to >= v_day)
       and (space_id = p_space_id or (space_id is null and venue_id = v_venue_id))
     order by space_id nulls last
  loop
    v_win_start := (v_day + v_row.open_time) at time zone 'America/Bogota';
    if v_row.close_time <= v_row.open_time then
      v_win_end := (v_day + 1 + v_row.close_time) at time zone 'America/Bogota';
    else
      v_win_end := (v_day + v_row.close_time) at time zone 'America/Bogota';
    end if;
    if v_win_start <= p_starts_at and p_ends_at <= v_win_end then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

-- Cotización por tramos (13.1). No aparta nada.
create or replace function public.compute_booking_price(
  p_space_id uuid, p_starts_at timestamptz, p_ends_at timestamptz
) returns table (line_starts_at timestamptz, line_ends_at timestamptz, rate_id uuid, price_per_hour integer, amount integer)
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
begin
  if exists (
    with steps as (
      select generate_series(p_starts_at, p_ends_at - interval '15 minutes', interval '15 minutes') as slice_start
    )
    select 1
      from steps s
      left join lateral (
        select r.id
          from public.rates r
         where r.space_id = p_space_id
           and r.active
           and (extract(dow from (s.slice_start at time zone 'America/Bogota'))::smallint) = any (r.weekdays)
           and r.start_time <= (s.slice_start at time zone 'America/Bogota')::time
           and (s.slice_start at time zone 'America/Bogota')::time < r.end_time
           and r.valid_from <= (s.slice_start at time zone 'America/Bogota')::date
           and (r.valid_to is null or r.valid_to >= (s.slice_start at time zone 'America/Bogota')::date)
         order by r.valid_from desc
         limit 1
      ) r on true
     where r.id is null
  ) then
    raise exception 'No hay tarifa configurada para ese horario (E_SIN_TARIFA)';
  end if;

  return query
  with steps as (
    select generate_series(p_starts_at, p_ends_at - interval '15 minutes', interval '15 minutes') as slice_start
  ),
  matched as (
    select s.slice_start,
           s.slice_start + interval '15 minutes' as slice_end,
           r.id as rate_id,
           r.price_per_hour
      from steps s
      left join lateral (
        select r.id, r.price_per_hour
          from public.rates r
         where r.space_id = p_space_id
           and r.active
           and (extract(dow from (s.slice_start at time zone 'America/Bogota'))::smallint) = any (r.weekdays)
           and r.start_time <= (s.slice_start at time zone 'America/Bogota')::time
           and (s.slice_start at time zone 'America/Bogota')::time < r.end_time
           and r.valid_from <= (s.slice_start at time zone 'America/Bogota')::date
           and (r.valid_to is null or r.valid_to >= (s.slice_start at time zone 'America/Bogota')::date)
         order by r.valid_from desc
         limit 1
      ) r on true
  ),
  -- "Gaps and islands": lag() y sum() son ambas funciones de ventana, y
  -- Postgres no permite anidar una dentro de otra directamente, así que el
  -- cambio de grupo se calcula en un paso separado antes de acumularlo.
  flagged as (
    select m.*,
           (case when m.rate_id is distinct from lag(m.rate_id) over (order by m.slice_start) then 1 else 0 end) as is_new_group
      from matched m
  ),
  grouped as (
    select f.*,
           sum(f.is_new_group) over (order by f.slice_start) as grp
      from flagged f
  )
  select min(grouped.slice_start), max(grouped.slice_end), grouped.rate_id, grouped.price_per_hour,
         round(sum(grouped.price_per_hour * 0.25))::integer as amount
    from grouped
   group by grouped.grp, grouped.rate_id, grouped.price_per_hour
   order by min(grouped.slice_start);
end;
$$;

-- Redondeo del anticipo al múltiplo de $1.000 hacia arriba, sin superar el total (D20).
create or replace function public.round_deposit(p_total integer, p_percent integer) returns integer
  language sql immutable security definer
  set search_path = public, pg_temp
as $$
  select least(p_total, (ceil((p_total * p_percent / 100.0) / 1000.0) * 1000)::integer);
$$;

-- Recalcula el estado de una reserva a partir de lo efectivamente aprobado (5.3, F1/F11a).
create or replace function public.recompute_booking_after_payment(p_booking_id uuid) returns void
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings;
  v_policy  public.business_policies;
  v_paid    integer;
  v_required integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  select * into v_policy from public.business_policies where business_id = v_booking.business_id;

  select coalesce(sum(verified_amount), 0) into v_paid
    from public.payments
   where booking_id = p_booking_id and status = 'approved';

  v_required := case when v_booking.deposit_required > 0 then v_booking.deposit_required else v_booking.total end;

  if v_booking.status in ('hold', 'pending_review') then
    if v_paid >= v_required then
      update public.bookings
         set status = 'confirmed', hold_expires_at = null, review_due_at = null
       where id = p_booking_id;
    else
      update public.bookings
         set status = 'hold', hold_expires_at = now() + make_interval(mins => v_policy.hold_minutes), review_due_at = null
       where id = p_booking_id;
    end if;
  end if;
end;
$$;

-- Libera las ocupaciones activas de una reserva (usado por expiración, rechazo y cancelación).
create or replace function public.release_booking_occupancies(p_booking_id uuid) returns void
  language sql security definer
  set search_path = public, pg_temp
as $$
  update public.occupancies set is_active = false where booking_id = p_booking_id and is_active;
$$;

-- Reubica una reserva a otro espacio equivalente (y opcionalmente a otra
-- franja), sin liberar lo anterior hasta asegurar lo nuevo (sección 8):
-- inserta primero, y solo desactiva las ocupaciones antiguas ya identificadas
-- por id (nunca por período: con un cambio de solo espacio, el período nuevo
-- y el viejo son iguales, así que emparejar por período reactivaría ambas).
create or replace function public.internal_relocate_booking(
  p_booking_id uuid, p_new_space_id uuid,
  p_new_starts_at timestamptz default null, p_new_ends_at timestamptz default null
) returns void
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings;
  v_old_ids uuid[];
  v_starts  timestamptz;
  v_ends    timestamptz;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  v_starts := coalesce(p_new_starts_at, v_booking.starts_at);
  v_ends := coalesce(p_new_ends_at, v_booking.ends_at);

  select array_agg(id) into v_old_ids
    from public.occupancies
   where booking_id = v_booking.id and kind = 'booking' and is_active;

  begin
    insert into public.occupancies (business_id, unit_id, period, kind, booking_id)
    select v_booking.business_id, su.unit_id, tstzrange(v_starts, v_ends, '[)'), 'booking', v_booking.id
      from public.space_units su
     where su.space_id = p_new_space_id;
  exception when exclusion_violation then
    raise exception 'La franja ya no está libre en el espacio de destino (E_OCUPADA)';
  end;

  update public.occupancies set is_active = false where id = any (v_old_ids);
  update public.bookings set space_id = p_new_space_id, starts_at = v_starts, ends_at = v_ends where id = v_booking.id;
end;
$$;

-- ----------------------------------------------------------------------------
-- CU-01: Cotizar (público, no aparta nada)
-- ----------------------------------------------------------------------------
create or replace function public.quote_booking(p_space_slug text, p_starts_at timestamptz, p_ends_at timestamptz)
  returns jsonb
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  v_space  public.spaces;
  v_policy public.business_policies;
  v_lines  jsonb;
  v_subtotal integer;
  v_deposit  integer;
begin
  select * into v_space from public.spaces where slug = p_space_slug and active and visible;
  if not found then
    raise exception 'Espacio no encontrado o inactivo (E_ESPACIO)';
  end if;

  if not public.space_covers_interval(v_space.id, p_starts_at, p_ends_at) then
    raise exception 'Ese horario se sale de la parrilla del espacio (E_HORARIO)';
  end if;

  select * into v_policy from public.business_policies where business_id = v_space.business_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'starts_at', line_starts_at, 'ends_at', line_ends_at,
           'price_per_hour', price_per_hour, 'amount', amount
         ) order by line_starts_at), '[]'::jsonb),
         coalesce(sum(amount), 0)
    into v_lines, v_subtotal
    from public.compute_booking_price(v_space.id, p_starts_at, p_ends_at);

  v_deposit := public.round_deposit(v_subtotal, v_policy.deposit_percent);

  return jsonb_build_object(
    'lines', v_lines,
    'subtotal', v_subtotal,
    'discount_total', 0,
    'total', v_subtotal,
    'deposit_required', v_deposit,
    'balance', v_subtotal - v_deposit
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Grilla de disponibilidad de un espacio para un día (público, D1/D2).
-- ----------------------------------------------------------------------------
-- No se marca `stable`: internamente libera HOLDs vencidos (efecto de escritura).
create or replace function public.space_availability(p_space_slug text, p_date date)
  returns table (starts_at timestamptz, ends_at timestamptz, status text)
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_space public.spaces;
begin
  perform public.run_expirations();

  select * into v_space from public.spaces where slug = p_space_slug and active and visible;
  if not found then
    raise exception 'Espacio no encontrado (E_ESPACIO)';
  end if;

  return query
  with slots as (
    select gs as slot_start, gs + make_interval(mins => v_space.step_minutes) as slot_end
      from generate_series(
             (p_date::timestamp) at time zone 'America/Bogota',
             (p_date::timestamp) at time zone 'America/Bogota' + interval '1 day' - make_interval(mins => v_space.step_minutes),
             make_interval(mins => v_space.step_minutes)
           ) as gs
  ),
  covered as (
    select s.slot_start, s.slot_end, public.space_covers_interval(v_space.id, s.slot_start, s.slot_end) as is_open
      from slots s
  ),
  occ as (
    select distinct c.slot_start
      from covered c
      join public.space_units su on su.space_id = v_space.id
      join public.occupancies o on o.unit_id = su.unit_id and o.is_active
                                 and o.period && tstzrange(c.slot_start, c.slot_end, '[)')
     where c.is_open
  )
  select c.slot_start, c.slot_end,
         case when not c.is_open then 'closed'
              when o.slot_start is not null then 'occupied'
              else 'free' end
    from covered c
    left join occ o on o.slot_start = c.slot_start
   order by c.slot_start;
end;
$$;

-- ----------------------------------------------------------------------------
-- CU-01: Crear HOLD con asignación automática de unidad (D9, 23.7)
-- ----------------------------------------------------------------------------
create or replace function public.create_hold(
  p_venue_id       uuid,
  p_modality_code  text,
  p_starts_at      timestamptz,
  p_ends_at        timestamptz,
  p_customer_name  text,
  p_customer_phone text,
  p_space_slug     text default null
) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_modality_id uuid;
  v_space       public.spaces;
  v_policy      public.business_policies;
  v_customer_id uuid;
  v_booking     public.bookings;
  v_code        text;
  v_token       text;
  v_lines       record;
  v_subtotal    integer := 0;
  v_deposit     integer;
  v_status      public.booking_status;
begin
  perform public.run_expirations();

  select business_id into v_business_id from public.venues where id = p_venue_id and active;
  if not found then
    raise exception 'Sede no encontrada (E_ESPACIO)';
  end if;

  select m.id into v_modality_id
    from public.modalities m
   where m.code = p_modality_code and m.active;
  if not found then
    raise exception 'Modalidad no encontrada (E_ESPACIO)';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'Horario inválido (E_HORARIO)';
  end if;

  -- Selección de espacio: específico, o el que menos fragmenta (23.7).
  if p_space_slug is not null then
    select * into v_space
      from public.spaces
     where slug = p_space_slug and venue_id = p_venue_id and active and visible
     for update;
    if not found then
      raise exception 'Espacio no encontrado (E_ESPACIO)';
    end if;
    if exists (
      select 1 from public.space_units su
      join public.occupancies o on o.unit_id = su.unit_id and o.is_active
                                 and o.period && tstzrange(p_starts_at, p_ends_at, '[)')
       where su.space_id = v_space.id
    ) then
      raise exception 'Franja horaria ocupada (E_OCUPADA)';
    end if;
  else
    with candidates as (
      select s.id as space_id, s.sort
        from public.spaces s
        join public.space_modalities sm on sm.space_id = s.id and sm.modality_id = v_modality_id
       where s.venue_id = p_venue_id and s.active and s.visible
    ),
    free_candidates as (
      select c.space_id, c.sort
        from candidates c
       where not exists (
         select 1 from public.space_units su
         join public.occupancies o on o.unit_id = su.unit_id and o.is_active
                                    and o.period && tstzrange(p_starts_at, p_ends_at, '[)')
          where su.space_id = c.space_id
       )
    ),
    venue_free_spaces as (
      select s.id as space_id
        from public.spaces s
       where s.venue_id = p_venue_id and s.active and s.visible
         and not exists (
           select 1 from public.space_units su
           join public.occupancies o on o.unit_id = su.unit_id and o.is_active
                                      and o.period && tstzrange(p_starts_at, p_ends_at, '[)')
            where su.space_id = s.id
         )
    ),
    scored as (
      select fc.space_id, fc.sort,
        (select count(distinct other.space_id)
           from venue_free_spaces other
          where other.space_id <> fc.space_id
            and exists (
              select 1 from public.space_units a
              join public.space_units b on b.unit_id = a.unit_id
               where a.space_id = fc.space_id and b.space_id = other.space_id
            )
        ) as blocked_count
        from free_candidates fc
    )
    select s.* into v_space
      from scored
      join public.spaces s on s.id = scored.space_id
     order by scored.blocked_count asc, scored.sort asc
     limit 1;

    if not found then
      raise exception 'Sin disponibilidad para esa modalidad en ese horario (E_OCUPADA)';
    end if;

    perform 1 from public.spaces where id = v_space.id for update;
  end if;

  if not public.space_covers_interval(v_space.id, p_starts_at, p_ends_at) then
    raise exception 'Horario fuera de la parrilla del espacio (E_HORARIO)';
  end if;

  if extract(epoch from (p_ends_at - p_starts_at)) / 60 < v_space.min_minutes
     or extract(epoch from (p_ends_at - p_starts_at)) / 60 > v_space.max_minutes
     or mod(extract(epoch from (p_ends_at - p_starts_at))::integer / 60, v_space.step_minutes) <> 0 then
    raise exception 'Duración fuera de las reglas del espacio (E_HORARIO)';
  end if;

  select * into v_policy from public.business_policies where business_id = v_business_id;

  select coalesce(sum(amount), 0) into v_subtotal
    from public.compute_booking_price(v_space.id, p_starts_at, p_ends_at);
  v_deposit := public.round_deposit(v_subtotal, v_policy.deposit_percent);

  insert into public.customers (phone_e164, name)
  values (p_customer_phone, p_customer_name)
  on conflict (phone_e164) do update set name = excluded.name, updated_at = now()
  returning id into v_customer_id;

  v_code := public.generate_booking_code();
  v_token := public.random_token();

  if p_starts_at - now() < make_interval(mins => v_policy.min_advance_minutes) then
    v_status := 'pending_approval';
  else
    v_status := 'hold';
  end if;

  insert into public.bookings (
    code, business_id, venue_id, space_id, modality_id, customer_id, origin, status,
    starts_at, ends_at, subtotal, discount_total, total, deposit_required,
    hold_expires_at, approval_expires_at, access_token_hash
  ) values (
    v_code, v_business_id, p_venue_id, v_space.id, v_modality_id, v_customer_id, 'web', v_status,
    p_starts_at, p_ends_at, v_subtotal, 0, v_subtotal, v_deposit,
    case when v_status = 'hold' then now() + make_interval(mins => v_policy.hold_minutes) end,
    case when v_status = 'pending_approval' then least(p_starts_at, now() + interval '2 hours') end,
    public.hash_token(v_token)
  ) returning * into v_booking;

  begin
    insert into public.occupancies (business_id, unit_id, period, kind, booking_id)
    select v_business_id, su.unit_id, tstzrange(p_starts_at, p_ends_at, '[)'), 'booking', v_booking.id
      from public.space_units su
     where su.space_id = v_space.id;
  exception when exclusion_violation then
    raise exception 'Franja horaria ocupada (E_OCUPADA)';
  end;

  insert into public.booking_price_lines (booking_id, kind, starts_at, ends_at, rate_id, price_per_hour, amount)
  select v_booking.id, 'base', line_starts_at, line_ends_at, rate_id, price_per_hour, amount
    from public.compute_booking_price(v_space.id, p_starts_at, p_ends_at);

  perform public.log_audit('customer', null, v_business_id, 'bookings', v_booking.id::text, 'create_hold', null, to_jsonb(v_booking));

  return jsonb_build_object(
    'booking', to_jsonb(v_booking),
    'access_token', v_token,
    'space', jsonb_build_object('slug', v_space.slug, 'name', v_space.name),
    'payment_accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', pa.id, 'kind', pa.kind, 'bank_name', pa.bank_name, 'account_type', pa.account_type,
               'account_number', pa.account_number, 'holder_name', pa.holder_name, 'instructions', pa.instructions
             )), '[]'::jsonb)
        from public.payment_accounts pa
       where pa.business_id = v_business_id and pa.active
    )
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Acceso del cliente por token (AC1) — el código corto es solo referencia.
-- ----------------------------------------------------------------------------
-- No se marca `stable`: internamente libera HOLDs vencidos (efecto de escritura).
create or replace function public.get_booking_by_token(p_code text, p_access_token text)
  returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings;
begin
  perform public.run_expirations();

  select * into v_booking from public.bookings where code = upper(p_code);
  if not found or v_booking.token_revoked_at is not null
     or v_booking.access_token_hash <> public.hash_token(p_access_token) then
    raise exception 'Reserva no encontrada (E_NOTFOUND)';
  end if;

  return jsonb_build_object(
    'booking', to_jsonb(v_booking),
    'space', (select to_jsonb(s) from public.spaces s where s.id = v_booking.space_id),
    'payments', (select coalesce(jsonb_agg(to_jsonb(p) order by p.submitted_at desc), '[]'::jsonb)
                   from public.payments p where p.booking_id = v_booking.id),
    'payment_accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', pa.id, 'kind', pa.kind, 'bank_name', pa.bank_name, 'account_type', pa.account_type,
               'account_number', pa.account_number, 'holder_name', pa.holder_name, 'instructions', pa.instructions
             )), '[]'::jsonb)
        from public.payment_accounts pa
       where pa.business_id = v_booking.business_id and pa.active
    )
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- F1-F5: Subir comprobante
-- ----------------------------------------------------------------------------
create or replace function public.submit_payment(
  p_code text, p_access_token text, p_method text, p_declared_amount integer,
  p_payment_account_id uuid, p_reference text, p_storage_path text, p_sha256 text,
  p_mime_type text, p_size_bytes integer
) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings;
  v_policy  public.business_policies;
  v_payment public.payments;
begin
  select * into v_booking from public.bookings where code = upper(p_code) for update;
  if not found or v_booking.access_token_hash <> public.hash_token(p_access_token) then
    raise exception 'Reserva no encontrada (E_NOTFOUND)';
  end if;

  if v_booking.status <> 'hold' then
    raise exception 'La reserva no está pendiente de pago (E_ESTADO)';
  end if;

  if exists (select 1 from public.payments where booking_id = v_booking.id and status = 'submitted') then
    raise exception 'Ya existe un comprobante en revisión para esta reserva (E_YA_COMPROBANTE)';
  end if;

  select * into v_policy from public.business_policies where business_id = v_booking.business_id;

  insert into public.payments (booking_id, business_id, method, payment_account_id, declared_amount, reference, status)
  values (v_booking.id, v_booking.business_id, p_method::public.payment_method, p_payment_account_id, p_declared_amount, nullif(p_reference, ''), 'submitted')
  returning * into v_payment;

  insert into public.payment_proofs (payment_id, business_id, storage_path, sha256, mime_type, size_bytes)
  values (v_payment.id, v_booking.business_id, p_storage_path, p_sha256, p_mime_type, p_size_bytes);

  update public.bookings
     set status = 'pending_review',
         review_due_at = greatest(now() + interval '15 minutes',
                                   least(now() + make_interval(mins => v_policy.review_minutes), ends_at - interval '1 hour')),
         hold_expires_at = null
   where id = v_booking.id;

  perform public.log_audit('customer', null, v_booking.business_id, 'payments', v_payment.id::text, 'submit_payment', null, to_jsonb(v_payment));

  return jsonb_build_object('payment', to_jsonb(v_payment));
end;
$$;

-- ----------------------------------------------------------------------------
-- F1/F7/F11: Revisión de comprobante por el negocio
-- ----------------------------------------------------------------------------
create or replace function public.review_payment(
  p_payment_id uuid, p_decision text, p_verified_amount integer default null,
  p_rejection_reason text default null, p_rejection_note text default null
) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_payment public.payments;
  v_booking public.bookings;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Pago no encontrado (E_NOTFOUND)';
  end if;
  if not public.is_member(v_payment.business_id) then
    raise exception 'Sin permiso sobre este negocio (E_PERM)';
  end if;
  if v_payment.status <> 'submitted' then
    raise exception 'El pago ya fue decidido (E_ESTADO)';
  end if;

  select * into v_booking from public.bookings where id = v_payment.booking_id for update;

  if p_decision = 'approve' then
    if p_verified_amount is null then
      raise exception 'Falta el monto verificado (E_ESTADO)';
    end if;
    update public.payments
       set status = 'approved', verified_amount = p_verified_amount, decided_at = now(), decided_by = auth.uid()
     where id = v_payment.id;

    perform public.recompute_booking_after_payment(v_booking.id);
  elsif p_decision = 'reject' then
    if p_rejection_reason is null then
      raise exception 'Falta el motivo de rechazo (E_ESTADO)';
    end if;
    update public.payments
       set status = 'rejected', decided_at = now(), decided_by = auth.uid(),
           rejection_reason = p_rejection_reason::public.rejection_reason, rejection_note = p_rejection_note
     where id = v_payment.id;

    update public.bookings set rejection_count = rejection_count + 1 where id = v_booking.id;
    select * into v_booking from public.bookings where id = v_booking.id;

    if v_booking.rejection_count >= 3 then
      update public.bookings set status = 'expired' where id = v_booking.id;
      perform public.release_booking_occupancies(v_booking.id);
    else
      update public.bookings
         set status = 'hold',
             hold_expires_at = now() + make_interval(mins => (select hold_minutes from public.business_policies where business_id = v_booking.business_id)),
             review_due_at = null
       where id = v_booking.id;
    end if;
  else
    raise exception 'Decisión inválida (E_ESTADO)';
  end if;

  perform public.log_audit('staff', auth.uid(), v_payment.business_id, 'payments', v_payment.id::text, 'review_payment_' || p_decision, null, jsonb_build_object('decision', p_decision));

  return jsonb_build_object(
    'payment', (select to_jsonb(p) from public.payments p where p.id = v_payment.id),
    'booking', (select to_jsonb(b) from public.bookings b where b.id = v_booking.id)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- J6: Registrar pago manual (efectivo/transferencia ya verificada) — nace aprobado.
-- ----------------------------------------------------------------------------
create or replace function public.register_payment(
  p_code text, p_method text, p_amount integer, p_reference text default null
) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings;
  v_payment public.payments;
begin
  select * into v_booking from public.bookings where code = upper(p_code) for update;
  if not found then
    raise exception 'Reserva no encontrada (E_NOTFOUND)';
  end if;
  if not public.is_member(v_booking.business_id) then
    raise exception 'Sin permiso sobre este negocio (E_PERM)';
  end if;

  insert into public.payments (booking_id, business_id, method, declared_amount, verified_amount, reference, status, decided_at, decided_by)
  values (v_booking.id, v_booking.business_id, p_method::public.payment_method, p_amount, p_amount, nullif(p_reference, ''), 'approved', now(), auth.uid())
  returning * into v_payment;

  perform public.recompute_booking_after_payment(v_booking.id);
  perform public.log_audit('staff', auth.uid(), v_booking.business_id, 'payments', v_payment.id::text, 'register_payment', null, to_jsonb(v_payment));

  return jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'booking', (select to_jsonb(b) from public.bookings b where b.id = v_booking.id)
  );
end;
$$;

create or replace function public.void_payment(p_payment_id uuid, p_reason text) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'approved' then
    raise exception 'Pago no encontrado o no aprobado (E_ESTADO)';
  end if;
  if not public.is_member(v_payment.business_id) then
    raise exception 'Sin permiso sobre este negocio (E_PERM)';
  end if;

  update public.payments
     set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
   where id = v_payment.id;

  perform public.log_audit('staff', auth.uid(), v_payment.business_id, 'payments', v_payment.id::text, 'void_payment', null, jsonb_build_object('reason', p_reason));

  return jsonb_build_object('payment', (select to_jsonb(p) from public.payments p where p.id = v_payment.id));
end;
$$;

-- ----------------------------------------------------------------------------
-- G5/G7: Cancelar (cliente por token, o personal por membresía)
-- ----------------------------------------------------------------------------
create or replace function public.cancel_booking(
  p_code text, p_access_token text default null, p_reason text default null
) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings;
  v_policy  public.business_policies;
  v_is_staff boolean := false;
  v_paid integer;
  v_hours numeric;
  v_pct  numeric;
  v_tier jsonb;
  v_refund integer;
begin
  select * into v_booking from public.bookings where code = upper(p_code) for update;
  if not found then
    raise exception 'Reserva no encontrada (E_NOTFOUND)';
  end if;

  if p_access_token is not null then
    if v_booking.access_token_hash <> public.hash_token(p_access_token) then
      raise exception 'Reserva no encontrada (E_NOTFOUND)';
    end if;
  else
    if not public.is_member(v_booking.business_id) then
      raise exception 'Sin permiso sobre este negocio (E_PERM)';
    end if;
    v_is_staff := true;
  end if;

  if v_booking.status in ('cancelled', 'expired', 'completed', 'no_show') then
    raise exception 'La reserva ya está en un estado terminal (E_ESTADO)';
  end if;

  if not v_is_staff and v_booking.starts_at <= now() then
    raise exception 'La reserva ya empezó, no se puede cancelar (E_ESTADO)';
  end if;

  select * into v_policy from public.business_policies where business_id = v_booking.business_id;
  select coalesce(sum(verified_amount), 0) into v_paid from public.payments where booking_id = v_booking.id and status = 'approved';

  if v_is_staff then
    v_pct := 100;
  else
    v_hours := extract(epoch from (v_booking.starts_at - now())) / 3600.0;
    select value into v_tier
      from jsonb_array_elements(v_policy.cancellation_tiers) value
     where (value->>'hours')::numeric <= v_hours
     order by (value->>'hours')::numeric desc
     limit 1;
    v_pct := coalesce((v_tier->>'refund_percent')::numeric, 0);
  end if;

  v_refund := round(v_paid * v_pct / 100.0)::integer;

  if v_refund > 0 then
    insert into public.refunds (booking_id, business_id, amount, kind, status)
    values (v_booking.id, v_booking.business_id, v_refund, 'refund', 'pending');
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(),
         cancelled_by_type = case when v_is_staff then 'staff' else 'customer' end,
         cancelled_by = auth.uid(), cancel_reason = p_reason
   where id = v_booking.id;

  perform public.release_booking_occupancies(v_booking.id);
  perform public.log_audit(
    case when v_is_staff then 'staff' else 'customer' end, auth.uid(), v_booking.business_id,
    'bookings', v_booking.id::text, 'cancel_booking', null, jsonb_build_object('refund', v_refund, 'reason', p_reason)
  );

  return jsonb_build_object(
    'booking', (select to_jsonb(b) from public.bookings b where b.id = v_booking.id),
    'refund_amount', v_refund
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- E7/E8: el negocio acepta o rechaza una reserva en pending_approval
-- ----------------------------------------------------------------------------
create or replace function public.decide_approval(p_code text, p_decision text) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where code = upper(p_code) for update;
  if not found then
    raise exception 'Reserva no encontrada (E_NOTFOUND)';
  end if;
  if not public.is_member(v_booking.business_id) then
    raise exception 'Sin permiso sobre este negocio (E_PERM)';
  end if;
  if v_booking.status <> 'pending_approval' then
    raise exception 'La reserva no está esperando aprobación (E_ESTADO)';
  end if;

  if p_decision = 'approve' then
    update public.bookings set status = 'confirmed', approval_expires_at = null where id = v_booking.id;
  elsif p_decision = 'reject' then
    update public.bookings
       set status = 'cancelled', cancelled_at = now(), cancelled_by_type = 'staff',
           cancelled_by = auth.uid(), cancel_reason = 'Rechazada por el negocio'
     where id = v_booking.id;
    perform public.release_booking_occupancies(v_booking.id);
  else
    raise exception 'Decisión inválida (E_ESTADO)';
  end if;

  perform public.log_audit('staff', auth.uid(), v_booking.business_id, 'bookings', v_booking.id::text, 'decide_approval_' || p_decision);

  return jsonb_build_object('booking', (select to_jsonb(b) from public.bookings b where b.id = v_booking.id));
end;
$$;

-- ----------------------------------------------------------------------------
-- G3: El cliente solicita un cambio de hora/fecha/espacio
-- ----------------------------------------------------------------------------
create or replace function public.request_change(
  p_code text, p_access_token text, p_new_space_slug text,
  p_new_starts_at timestamptz, p_new_ends_at timestamptz
) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_booking  public.bookings;
  v_policy   public.business_policies;
  v_new_space public.spaces;
  v_new_subtotal integer;
  v_new_deposit integer;
  v_cr public.change_requests;
begin
  select * into v_booking from public.bookings where code = upper(p_code) for update;
  if not found or v_booking.access_token_hash <> public.hash_token(p_access_token) then
    raise exception 'Reserva no encontrada (E_NOTFOUND)';
  end if;
  if v_booking.status not in ('hold', 'confirmed') then
    raise exception 'La reserva no admite cambios en su estado actual (E_ESTADO)';
  end if;

  select * into v_policy from public.business_policies where business_id = v_booking.business_id;

  if extract(epoch from (v_booking.starts_at - now())) / 3600.0 < v_policy.change_until_hours then
    raise exception 'Ya no se puede cambiar esta reserva por el tiempo restante (E_CAMBIO)';
  end if;
  if v_booking.change_count >= v_policy.max_changes then
    raise exception 'Se alcanzó el máximo de cambios permitidos (E_CAMBIO)';
  end if;

  select * into v_new_space from public.spaces where slug = p_new_space_slug and active and visible;
  if not found then
    raise exception 'Espacio no encontrado (E_ESPACIO)';
  end if;
  if not public.space_covers_interval(v_new_space.id, p_new_starts_at, p_new_ends_at) then
    raise exception 'Horario fuera de la parrilla del espacio (E_HORARIO)';
  end if;

  select coalesce(sum(amount), 0) into v_new_subtotal
    from public.compute_booking_price(v_new_space.id, p_new_starts_at, p_new_ends_at);
  v_new_deposit := public.round_deposit(v_new_subtotal, v_policy.deposit_percent);

  insert into public.change_requests (booking_id, requested_by_type, new_space_id, new_starts_at, new_ends_at, price_difference, status, expires_at)
  values (v_booking.id, 'customer', v_new_space.id, p_new_starts_at, p_new_ends_at, v_new_subtotal - v_booking.total,
          case when v_policy.change_requires_approval then 'pending' else 'confirmed' end,
          now() + interval '2 hours')
  returning * into v_cr;

  if v_policy.change_requires_approval then
    begin
      insert into public.occupancies (business_id, unit_id, period, kind, change_request_id)
      select v_booking.business_id, su.unit_id, tstzrange(p_new_starts_at, p_new_ends_at, '[)'), 'change_hold', v_cr.id
        from public.space_units su
       where su.space_id = v_new_space.id;
    exception when exclusion_violation then
      update public.change_requests set status = 'rejected' where id = v_cr.id;
      raise exception 'La nueva franja ya no está libre (E_OCUPADA)';
    end;
  else
    perform public.internal_relocate_booking(v_booking.id, v_new_space.id, p_new_starts_at, p_new_ends_at);
    update public.bookings
       set subtotal = v_new_subtotal, total = v_new_subtotal, deposit_required = v_new_deposit,
           change_count = change_count + 1
     where id = v_booking.id;
    delete from public.booking_price_lines where booking_id = v_booking.id and kind = 'base';
    insert into public.booking_price_lines (booking_id, kind, starts_at, ends_at, rate_id, price_per_hour, amount)
    select v_booking.id, 'base', line_starts_at, line_ends_at, rate_id, price_per_hour, amount
      from public.compute_booking_price(v_new_space.id, p_new_starts_at, p_new_ends_at);
  end if;

  perform public.log_audit('customer', null, v_booking.business_id, 'bookings', v_booking.id::text, 'request_change', null, to_jsonb(v_cr));

  return jsonb_build_object(
    'change_request', to_jsonb(v_cr),
    'booking', (select to_jsonb(b) from public.bookings b where b.id = v_booking.id)
  );
end;
$$;

create or replace function public.decide_change(p_change_request_id uuid, p_decision text) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_cr public.change_requests;
  v_booking public.bookings;
begin
  select * into v_cr from public.change_requests where id = p_change_request_id for update;
  if not found or v_cr.status <> 'pending' then
    raise exception 'Solicitud de cambio no encontrada o ya decidida (E_ESTADO)';
  end if;
  select * into v_booking from public.bookings where id = v_cr.booking_id;
  if not public.is_member(v_booking.business_id) then
    raise exception 'Sin permiso sobre este negocio (E_PERM)';
  end if;

  if p_decision = 'approve' then
    perform public.internal_relocate_booking(v_booking.id, v_cr.new_space_id, v_cr.new_starts_at, v_cr.new_ends_at);
    update public.bookings
       set total = total + v_cr.price_difference, subtotal = subtotal + v_cr.price_difference,
           change_count = change_count + 1
     where id = v_booking.id;
    update public.occupancies set is_active = false where change_request_id = v_cr.id;
    update public.change_requests set status = 'confirmed', decided_by = auth.uid(), decided_at = now() where id = v_cr.id;
  else
    update public.occupancies set is_active = false where change_request_id = v_cr.id;
    update public.change_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = v_cr.id;
  end if;

  perform public.log_audit('staff', auth.uid(), v_booking.business_id, 'change_requests', v_cr.id::text, 'decide_change_' || p_decision);

  return jsonb_build_object('change_request', (select to_jsonb(c) from public.change_requests c where c.id = v_cr.id));
end;
$$;

-- ----------------------------------------------------------------------------
-- IND1: Bloqueos con resolución obligatoria de reservas afectadas
-- ----------------------------------------------------------------------------
create or replace function public.create_block(
  p_venue_id uuid, p_unit_ids uuid[], p_starts_at timestamptz, p_ends_at timestamptz,
  p_reason_kind text, p_public_label text, p_note text, p_resolutions jsonb default '[]'
) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_block public.blocks;
  v_affected jsonb;
  v_res jsonb;
  v_booking_id uuid;
begin
  select business_id into v_business_id from public.venues where id = p_venue_id;
  if not public.is_member(v_business_id) then
    raise exception 'Sin permiso sobre este negocio (E_PERM)';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('booking_id', b.id, 'code', b.code, 'status', b.status)), '[]'::jsonb)
    into v_affected
    from (
      select distinct b.*
        from public.occupancies o
        join public.bookings b on b.id = o.booking_id
       where o.unit_id = any (p_unit_ids)
         and o.is_active
         and o.period && tstzrange(p_starts_at, p_ends_at, '[)')
         and b.status in ('hold', 'pending_review', 'pending_approval', 'confirmed')
    ) b;

  if jsonb_array_length(v_affected) > 0 and jsonb_array_length(p_resolutions) < jsonb_array_length(v_affected) then
    return jsonb_build_object('block', null, 'affected', v_affected);
  end if;

  for v_res in select * from jsonb_array_elements(p_resolutions)
  loop
    v_booking_id := (v_res->>'booking_id')::uuid;
    if v_res->>'action' = 'cancel' then
      perform public.cancel_booking((select code from public.bookings where id = v_booking_id), null, 'Bloqueo del espacio');
    elsif v_res->>'action' = 'relocate' then
      perform public.internal_relocate_booking(v_booking_id, (v_res->>'new_space_id')::uuid);
    end if;
  end loop;

  insert into public.blocks (business_id, venue_id, reason_kind, public_label, note, starts_at, ends_at, created_by)
  values (v_business_id, p_venue_id, p_reason_kind, p_public_label, p_note, p_starts_at, p_ends_at, auth.uid())
  returning * into v_block;

  insert into public.occupancies (business_id, unit_id, period, kind, block_id)
  select v_business_id, unnest(p_unit_ids), tstzrange(p_starts_at, p_ends_at, '[)'), 'block', v_block.id;

  perform public.log_audit('staff', auth.uid(), v_business_id, 'blocks', v_block.id::text, 'create_block', null, to_jsonb(v_block));

  return jsonb_build_object('block', to_jsonb(v_block), 'affected', v_affected);
end;
$$;

create or replace function public.release_block(p_block_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_block public.blocks;
begin
  select * into v_block from public.blocks where id = p_block_id;
  if not found then
    raise exception 'Bloqueo no encontrado (E_NOTFOUND)';
  end if;
  if not public.is_member(v_block.business_id) then
    raise exception 'Sin permiso sobre este negocio (E_PERM)';
  end if;

  update public.blocks set released_at = now() where id = p_block_id;
  update public.occupancies set is_active = false where block_id = p_block_id;

  perform public.log_audit('staff', auth.uid(), v_block.business_id, 'blocks', v_block.id::text, 'release_block');

  return jsonb_build_object('block', (select to_jsonb(b) from public.blocks b where b.id = p_block_id));
end;
$$;

-- ----------------------------------------------------------------------------
-- Sección 10: día del partido
-- ----------------------------------------------------------------------------
create or replace function public.check_in(p_code text) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where code = upper(p_code) for update;
  if not found then
    raise exception 'Reserva no encontrada (E_NOTFOUND)';
  end if;
  if not public.is_member(v_booking.business_id) then
    raise exception 'Sin permiso sobre este negocio (E_PERM)';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'La reserva no está confirmada (E_ESTADO)';
  end if;
  if now() < v_booking.starts_at - interval '30 minutes' or now() > v_booking.ends_at then
    raise exception 'Fuera de la ventana de check-in (E_ESTADO)';
  end if;

  update public.bookings set checked_in_at = now(), checked_in_by = auth.uid() where id = v_booking.id;
  perform public.log_audit('staff', auth.uid(), v_booking.business_id, 'bookings', v_booking.id::text, 'check_in');

  return jsonb_build_object('booking', (select to_jsonb(b) from public.bookings b where b.id = v_booking.id));
end;
$$;

create or replace function public.mark_no_show(p_code text) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings;
  v_tolerance integer;
begin
  select * into v_booking from public.bookings where code = upper(p_code) for update;
  if not found then
    raise exception 'Reserva no encontrada (E_NOTFOUND)';
  end if;
  if not public.is_member(v_booking.business_id) then
    raise exception 'Sin permiso sobre este negocio (E_PERM)';
  end if;
  if v_booking.status <> 'confirmed' or v_booking.checked_in_at is not null then
    raise exception 'La reserva no admite marcar no-show (E_ESTADO)';
  end if;

  select no_show_tolerance_minutes into v_tolerance from public.business_policies where business_id = v_booking.business_id;
  if now() < v_booking.starts_at + make_interval(mins => v_tolerance) then
    raise exception 'Aún no pasa la tolerancia de no-show (E_ESTADO)';
  end if;

  update public.bookings set status = 'no_show', no_show_at = now(), no_show_by = auth.uid() where id = v_booking.id;
  update public.occupancies
     set period = tstzrange(lower(period), now(), '[)')
   where booking_id = v_booking.id and is_active;

  perform public.log_audit('staff', auth.uid(), v_booking.business_id, 'bookings', v_booking.id::text, 'mark_no_show');

  return jsonb_build_object('booking', (select to_jsonb(b) from public.bookings b where b.id = v_booking.id));
end;
$$;

create or replace function public.revert_no_show(p_code text) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where code = upper(p_code) for update;
  if not found then
    raise exception 'Reserva no encontrada (E_NOTFOUND)';
  end if;
  if not public.is_member(v_booking.business_id) then
    raise exception 'Sin permiso sobre este negocio (E_PERM)';
  end if;
  if v_booking.status <> 'no_show' or now() > v_booking.ends_at then
    raise exception 'La reserva no admite revertir el no-show (E_ESTADO)';
  end if;

  begin
    update public.occupancies
       set period = tstzrange(lower(period), v_booking.ends_at, '[)')
     where booking_id = v_booking.id and is_active;
  exception when exclusion_violation then
    raise exception 'La franja ya fue ocupada, no se puede revertir (E_OCUPADA)';
  end;

  update public.bookings
     set status = 'confirmed', no_show_at = null, no_show_by = null, checked_in_at = now(), checked_in_by = auth.uid()
   where id = v_booking.id;

  perform public.log_audit('staff', auth.uid(), v_booking.business_id, 'bookings', v_booking.id::text, 'revert_no_show');

  return jsonb_build_object('booking', (select to_jsonb(b) from public.bookings b where b.id = v_booking.id));
end;
$$;

create or replace function public.extend_booking(p_code text, p_extra_minutes integer) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings;
  v_new_ends timestamptz;
  v_extra integer;
begin
  select * into v_booking from public.bookings where code = upper(p_code) for update;
  if not found then
    raise exception 'Reserva no encontrada (E_NOTFOUND)';
  end if;
  if not public.is_member(v_booking.business_id) then
    raise exception 'Sin permiso sobre este negocio (E_PERM)';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'La reserva no está confirmada (E_ESTADO)';
  end if;

  v_new_ends := v_booking.ends_at + make_interval(mins => p_extra_minutes);

  begin
    update public.occupancies
       set period = tstzrange(lower(period), v_new_ends, '[)')
     where booking_id = v_booking.id and is_active;
  exception when exclusion_violation then
    raise exception 'Esa franja está ocupada, no se puede extender (E_OCUPADA)';
  end;

  select coalesce(sum(amount), 0) into v_extra
    from public.compute_booking_price(v_booking.space_id, v_booking.ends_at, v_new_ends);

  insert into public.booking_price_lines (booking_id, kind, starts_at, ends_at, rate_id, price_per_hour, amount)
  select v_booking.id, 'extension', line_starts_at, line_ends_at, rate_id, price_per_hour, amount
    from public.compute_booking_price(v_booking.space_id, v_booking.ends_at, v_new_ends);

  update public.bookings
     set ends_at = v_new_ends, subtotal = subtotal + v_extra, total = total + v_extra
   where id = v_booking.id;

  perform public.log_audit('staff', auth.uid(), v_booking.business_id, 'bookings', v_booking.id::text, 'extend_booking', null, jsonb_build_object('extra_minutes', p_extra_minutes));

  return jsonb_build_object('booking', (select to_jsonb(b) from public.bookings b where b.id = v_booking.id));
end;
$$;

create or replace function public.resolve_closure(p_code text, p_decision text) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where code = upper(p_code) for update;
  if not found then
    raise exception 'Reserva no encontrada (E_NOTFOUND)';
  end if;
  if not public.is_member(v_booking.business_id) then
    raise exception 'Sin permiso sobre este negocio (E_PERM)';
  end if;
  if v_booking.status <> 'awaiting_closure' then
    raise exception 'La reserva no está esperando cierre (E_ESTADO)';
  end if;

  if p_decision = 'completed' then
    update public.bookings set status = 'completed', completed_at = now() where id = v_booking.id;
  elsif p_decision = 'no_show' then
    update public.bookings set status = 'no_show', no_show_at = now(), no_show_by = auth.uid() where id = v_booking.id;
  else
    raise exception 'Decisión inválida (E_ESTADO)';
  end if;

  perform public.log_audit('staff', auth.uid(), v_booking.business_id, 'bookings', v_booking.id::text, 'resolve_closure_' || p_decision);

  return jsonb_build_object('booking', (select to_jsonb(b) from public.bookings b where b.id = v_booking.id));
end;
$$;

-- ----------------------------------------------------------------------------
-- Sección 17: procesos automáticos idempotentes
-- ----------------------------------------------------------------------------
create or replace function public.run_expirations() returns integer
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_rec record;
  v_count integer := 0;
begin
  for v_rec in
    select id, business_id from public.bookings
     where (status = 'hold' and hold_expires_at is not null and hold_expires_at < now())
        or (status = 'pending_approval' and approval_expires_at is not null and approval_expires_at < now())
  loop
    update public.bookings set status = 'expired' where id = v_rec.id;
    perform public.release_booking_occupancies(v_rec.id);
    perform public.log_audit('system', null, v_rec.business_id, 'bookings', v_rec.id::text, 'run_expirations');
    v_count := v_count + 1;
  end loop;

  -- L10: libera retenciones (change_hold) de solicitudes de cambio vencidas;
  -- la reserva original sigue igual.
  for v_rec in
    select cr.id, b.business_id
      from public.change_requests cr
      join public.bookings b on b.id = cr.booking_id
     where cr.status = 'pending' and cr.expires_at < now()
  loop
    update public.change_requests set status = 'expired' where id = v_rec.id;
    update public.occupancies set is_active = false where change_request_id = v_rec.id;
    perform public.log_audit('system', null, v_rec.business_id, 'change_requests', v_rec.id::text, 'run_expirations');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.run_closures() returns integer
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_rec record;
  v_count integer := 0;
begin
  for v_rec in
    select id, business_id, checked_in_at from public.bookings
     where status = 'confirmed' and ends_at < now()
  loop
    if v_rec.checked_in_at is not null then
      update public.bookings set status = 'completed', completed_at = now() where id = v_rec.id;
    else
      update public.bookings set status = 'awaiting_closure' where id = v_rec.id;
    end if;
    perform public.log_audit('system', null, v_rec.business_id, 'bookings', v_rec.id::text, 'run_closures');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- Bootstrap: dar membresía de negocio a un usuario de Supabase Auth ya creado
-- (Dashboard -> Authentication -> Users), igual que el antiguo grant_admin.
--   select public.grant_business_member('canchas-demo', '<UUID_DEL_USUARIO>', 'owner');
-- ----------------------------------------------------------------------------
create or replace function public.grant_business_member(
  p_business_slug text, p_user_id uuid, p_role text default 'owner'
) returns void
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
begin
  select id into v_business_id from public.businesses where slug = p_business_slug;
  if not found then
    raise exception 'Negocio no encontrado (E_NOTFOUND)';
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (v_business_id, p_user_id, p_role::public.member_role)
  on conflict (business_id, user_id) do update set role = excluded.role, active = true;
end;
$$;

revoke execute on function public.grant_business_member(text, uuid, text) from public;
grant execute on function public.grant_business_member(text, uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- Permisos de ejecución
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;

grant execute on function public.space_availability(text, date) to anon, authenticated;
grant execute on function public.quote_booking(text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.create_hold(uuid, text, timestamptz, timestamptz, text, text, text) to anon, authenticated;
grant execute on function public.get_booking_by_token(text, text) to anon, authenticated;
grant execute on function public.submit_payment(text, text, text, integer, uuid, text, text, text, text, integer) to anon, authenticated;
grant execute on function public.cancel_booking(text, text, text) to anon, authenticated;
grant execute on function public.request_change(text, text, text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.run_expirations() to anon, authenticated;
grant execute on function public.run_closures() to anon, authenticated;

grant execute on function public.decide_approval(text, text) to authenticated;
grant execute on function public.review_payment(uuid, text, integer, text, text) to authenticated;
grant execute on function public.register_payment(text, text, integer, text) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;
grant execute on function public.decide_change(uuid, text) to authenticated;
grant execute on function public.create_block(uuid, uuid[], timestamptz, timestamptz, text, text, text, jsonb) to authenticated;
grant execute on function public.release_block(uuid) to authenticated;
grant execute on function public.check_in(text) to authenticated;
grant execute on function public.mark_no_show(text) to authenticated;
grant execute on function public.revert_no_show(text) to authenticated;
grant execute on function public.extend_booking(text, integer) to authenticated;
grant execute on function public.resolve_closure(text, text) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
