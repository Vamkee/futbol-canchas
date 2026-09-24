-- ============================================================================
-- 0005_domain_model.sql
-- Reemplaza el modelo de una sola tabla `canchas` por el modelo de dominio
-- completo: negocios, sedes, unidades físicas y espacios reservables (D8,
-- principio de diseño #1). Ver especificacion-reservas-canchas.md sección 4 y 23.
--
-- No hay datos reales en las tablas anteriores (proyecto sin desplegar), así
-- que se eliminan directamente en vez de migrarlas.
-- ============================================================================

create extension if not exists "btree_gist";

-- ----------------------------------------------------------------------------
-- Limpieza del esquema anterior (0001-0002). Las tablas se dropean primero
-- (con cascade, lo que se lleva sus triggers) y las funciones después: si se
-- intenta al revés, el trigger `reservas_validar_estado` sigue dependiendo
-- de `validar_transicion_estado()` y el drop de la función falla.
-- ----------------------------------------------------------------------------
drop table if exists public.bloqueos cascade;
drop table if exists public.reservas cascade;
drop table if exists public.canchas cascade;
drop table if exists public.admins cascade;

drop type if exists public.reserva_estado;

-- Políticas de storage.objects de 0003 (bucket `comprobantes`): no son parte
-- de una tabla que se dropee arriba, así que bloquean el drop de is_admin()
-- si no se quitan explícitamente. El bucket nuevo (`payment-proofs`) y sus
-- políticas se crean en 0007.
drop policy if exists "comprobantes_anon_upload" on storage.objects;
drop policy if exists "comprobantes_admin_read" on storage.objects;

drop function if exists public.crear_reserva(text, date, time, text, text);
drop function if exists public.adjuntar_comprobante(text, text, text);
drop function if exists public.obtener_reserva(text);
drop function if exists public.reprogramar_reserva(text, date, time);
drop function if exists public.cancelar_reserva(text);
drop function if exists public.franjas_disponibles(bigint, date);
drop function if exists public.liberar_reservas_expiradas();
drop function if exists public.validar_transicion_estado();
drop function if exists public.is_admin();
drop function if exists public.generar_codigo();
drop function if exists public.grant_admin(uuid);

-- ----------------------------------------------------------------------------
-- Tipos
-- ----------------------------------------------------------------------------
create type public.surface as enum ('synthetic', 'natural_grass', 'sand', 'other');

create type public.booking_status as enum (
  'hold',             -- Bloqueo temporal (D5)
  'pending_review',   -- Comprobante subido, esperando verificación humana (D2, D6)
  'pending_approval', -- Requiere aceptación del negocio (E7, E8)
  'confirmed',
  'awaiting_closure', -- Terminó sin check-in ni no-show (H8)
  'completed',
  'no_show',
  'expired',
  'cancelled'
);

create type public.occupancy_kind as enum ('booking', 'block', 'change_hold');

create type public.payment_method as enum ('bank_transfer', 'nequi', 'daviplata', 'cash', 'other');

create type public.payment_status as enum ('submitted', 'approved', 'rejected', 'voided');

create type public.rejection_reason as enum (
  'wrong_amount', 'unreadable', 'wrong_account', 'not_found', 'invalid', 'duplicate'
);

create type public.member_role as enum ('owner', 'admin');

create type public.change_request_status as enum ('pending', 'confirmed', 'expired', 'rejected');

-- "Hoy" en hora de Colombia (R4), sin depender del TimeZone de la sesión.
-- El local de Supabase CLI no siempre aplica [db.settings] timezone del
-- config.toml, así que ningún DEFAULT ni función de este archivo confía en
-- `current_date`/`now()` crudos para nada visible al usuario.
create or replace function public.today_bogota() returns date
  language sql stable
  set search_path = public, pg_temp
as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

-- ----------------------------------------------------------------------------
-- Negocio, sede, zona, unidad, espacio (sección 4)
-- ----------------------------------------------------------------------------
create table public.businesses (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  commercial_name text not null,
  owner_id        uuid references auth.users (id),
  created_at      timestamptz not null default now()
);

create table public.venues (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null,
  address     text,
  lat         numeric(9, 6),
  lng         numeric(9, 6),
  amenities   text[] not null default '{}',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.zones (
  id       uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  name     text not null,
  sort     integer not null default 0
);

create table public.units (
  id         uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id   uuid not null references public.venues (id) on delete cascade,
  zone_id    uuid references public.zones (id) on delete set null,
  name       text not null,
  surface    public.surface not null default 'synthetic',
  covered    boolean not null default false,
  lighting   boolean not null default true,
  length_m   numeric(5, 2),
  width_m    numeric(5, 2),
  active     boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.spaces (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  venue_id     uuid not null references public.venues (id) on delete cascade,
  slug         text not null unique,
  name         text not null,
  description  text,
  photos       text[] not null default '{}',
  capacity     integer,
  min_minutes  integer not null default 60 check (min_minutes > 0),
  step_minutes integer not null default 60 check (step_minutes > 0),
  max_minutes  integer not null default 240 check (max_minutes > 0),
  visible      boolean not null default true,
  active       boolean not null default true,
  archived_at  timestamptz,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint spaces_duration_ok check (min_minutes <= max_minutes)
);

create table public.space_units (
  space_id uuid not null references public.spaces (id) on delete cascade,
  unit_id  uuid not null references public.units (id) on delete cascade,
  primary key (space_id, unit_id)
);

create index space_units_unit_idx on public.space_units (unit_id);

-- ----------------------------------------------------------------------------
-- Catálogo mínimo (K7): deportes y modalidades
-- ----------------------------------------------------------------------------
create table public.sports (
  id     uuid primary key default gen_random_uuid(),
  code   text not null unique,
  name   text not null,
  active boolean not null default true
);

create table public.modalities (
  id       uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports (id) on delete cascade,
  code     text not null,
  name     text not null,
  active   boolean not null default true,
  unique (sport_id, code)
);

create table public.space_modalities (
  space_id    uuid not null references public.spaces (id) on delete cascade,
  modality_id uuid not null references public.modalities (id) on delete cascade,
  primary key (space_id, modality_id)
);

-- ----------------------------------------------------------------------------
-- Horario base y tarifas por tramo (D13)
-- ----------------------------------------------------------------------------
create table public.opening_hours (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues (id) on delete cascade,
  space_id   uuid references public.spaces (id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  open_time  time not null,
  close_time time not null,
  valid_from date not null default public.today_bogota(),
  valid_to   date,
  created_at timestamptz not null default now()
);

create index opening_hours_venue_idx on public.opening_hours (venue_id, weekday);

create table public.rates (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references public.spaces (id) on delete cascade,
  weekdays       smallint[] not null,
  start_time     time not null,
  end_time       time not null,
  price_per_hour integer not null check (price_per_hour >= 0),
  valid_from     date not null default public.today_bogota(),
  valid_to       date,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint rates_time_ok check (end_time > start_time)
);

create index rates_space_idx on public.rates (space_id, active);

-- ----------------------------------------------------------------------------
-- Clientes (R8: único por celular)
-- ----------------------------------------------------------------------------
create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  phone_e164         text not null unique check (phone_e164 ~ '^\+?[0-9]{7,15}$'),
  name               text not null,
  email              text,
  phone_verified_at  timestamptz,
  suspended_at       timestamptz,
  suspension_reason  text,
  anonymized_at      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Políticas y personal del negocio (sección 18, 3)
-- ----------------------------------------------------------------------------
create table public.business_policies (
  business_id                 uuid primary key references public.businesses (id) on delete cascade,
  hold_minutes                integer not null default 15 check (hold_minutes between 10 and 30),
  review_minutes              integer not null default 120 check (review_minutes between 60 and 360),
  min_advance_minutes         integer not null default 60 check (min_advance_minutes between 0 and 1440),
  deposit_percent             integer not null default 50 check (deposit_percent between 0 and 100),
  balance_due_mode            text not null default 'at_arrival' check (balance_due_mode in ('at_arrival', 'before_hours')),
  balance_due_hours           integer,
  manual_approval             boolean not null default false,
  change_until_hours          integer not null default 4,
  max_changes                 integer not null default 2,
  change_requires_approval    boolean not null default false,
  no_show_tolerance_minutes   integer not null default 15 check (no_show_tolerance_minutes between 0 and 60),
  refund_deposit_on_no_show   boolean not null default false,
  cancellation_tiers          jsonb not null default
    '[{"hours":24,"refund_percent":100},{"hours":4,"refund_percent":50},{"hours":0,"refund_percent":0}]'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.member_role not null default 'admin',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table public.payment_accounts (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  kind          public.payment_method not null,
  bank_name     text,
  account_type  text,
  account_number text,
  holder_name   text,
  instructions  text,
  active        boolean not null default true,
  deactivated_at timestamptz,
  created_at    timestamptz not null default now()
);

create index payment_accounts_business_idx on public.payment_accounts (business_id) where active;

-- ----------------------------------------------------------------------------
-- Reservas (sección 5.1)
-- ----------------------------------------------------------------------------
create table public.bookings (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  business_id        uuid not null references public.businesses (id),
  venue_id           uuid not null references public.venues (id),
  space_id           uuid not null references public.spaces (id),
  modality_id        uuid references public.modalities (id),
  customer_id        uuid not null references public.customers (id),
  origin             text not null default 'web' check (origin in ('web', 'manual')),
  status             public.booking_status not null default 'hold',
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  subtotal           integer not null default 0 check (subtotal >= 0),
  discount_total      integer not null default 0 check (discount_total >= 0),
  total              integer not null default 0 check (total >= 0),
  deposit_required   integer not null default 0 check (deposit_required >= 0),
  hold_expires_at    timestamptz,
  review_due_at      timestamptz,
  approval_expires_at timestamptz,
  balance_due_at     timestamptz,
  checked_in_at      timestamptz,
  checked_in_by      uuid references auth.users (id),
  no_show_at         timestamptz,
  no_show_by         uuid references auth.users (id),
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  cancelled_by_type  text check (cancelled_by_type in ('customer', 'staff', 'system')),
  cancelled_by       uuid,
  cancel_reason      text,
  access_token_hash  text not null unique,
  token_revoked_at   timestamptz,
  rejection_count    integer not null default 0,
  change_count       integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint bookings_period_ok check (ends_at > starts_at),
  constraint bookings_total_ok check (total = subtotal - discount_total)
);

create index bookings_business_starts_idx on public.bookings (business_id, starts_at);
create index bookings_hold_expires_idx on public.bookings (hold_expires_at) where status = 'hold';
create index bookings_review_due_idx on public.bookings (review_due_at) where status = 'pending_review';
create index bookings_customer_idx on public.bookings (customer_id);

create table public.booking_price_lines (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings (id) on delete cascade,
  kind           text not null default 'base' check (kind in ('base', 'extension', 'change')),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  rate_id        uuid references public.rates (id),
  price_per_hour integer not null,
  amount         integer not null,
  created_at     timestamptz not null default now()
);

create index booking_price_lines_booking_idx on public.booking_price_lines (booking_id);

-- ----------------------------------------------------------------------------
-- Bloqueos (sección 9)
-- ----------------------------------------------------------------------------
create table public.blocks (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id),
  venue_id     uuid not null references public.venues (id),
  reason_kind  text not null default 'maintenance' check (reason_kind in ('maintenance', 'emergency', 'other')),
  public_label text,
  note         text,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  created_by   uuid references auth.users (id),
  released_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint blocks_period_ok check (ends_at > starts_at)
);

-- ----------------------------------------------------------------------------
-- Cambios (solo G3: el cliente solicita)
-- ----------------------------------------------------------------------------
create table public.change_requests (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings (id) on delete cascade,
  requested_by_type text not null default 'customer' check (requested_by_type in ('customer', 'staff')),
  new_space_id     uuid not null references public.spaces (id),
  new_starts_at    timestamptz not null,
  new_ends_at      timestamptz not null,
  price_difference integer not null default 0,
  status           public.change_request_status not null default 'pending',
  expires_at       timestamptz not null,
  decided_by       uuid references auth.users (id),
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  constraint change_requests_period_ok check (new_ends_at > new_starts_at)
);

create index change_requests_booking_idx on public.change_requests (booking_id);

-- ----------------------------------------------------------------------------
-- Ocupaciones: la tabla que garantiza R1/RNF1 (sección 22.4, 23.5)
-- ----------------------------------------------------------------------------
create table public.occupancies (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id),
  unit_id           uuid not null references public.units (id),
  period            tstzrange not null
                    check (not isempty(period)
                           and lower_inc(period) and not upper_inc(period)),
  kind              public.occupancy_kind not null,
  booking_id        uuid references public.bookings (id),
  block_id          uuid references public.blocks (id),
  change_request_id uuid references public.change_requests (id),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint occupancies_kind_ref_ok check (
    (kind = 'booking'     and booking_id is not null
                          and block_id is null and change_request_id is null) or
    (kind = 'block'       and block_id is not null
                          and booking_id is null and change_request_id is null) or
    (kind = 'change_hold' and change_request_id is not null
                          and booking_id is null and block_id is null)
  ),
  constraint occupancies_no_overlap
    exclude using gist (unit_id with =, period with &&) where (is_active)
);

create index occupancies_booking_idx on public.occupancies (booking_id) where booking_id is not null;
create index occupancies_block_idx on public.occupancies (block_id) where block_id is not null;

-- ----------------------------------------------------------------------------
-- Pagos (sección 7, D2, D7)
-- ----------------------------------------------------------------------------
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references public.bookings (id),
  business_id        uuid not null references public.businesses (id),
  method             public.payment_method not null,
  payment_account_id uuid references public.payment_accounts (id),
  declared_amount    integer not null check (declared_amount >= 0),
  verified_amount    integer check (verified_amount >= 0),
  reference          text,
  status             public.payment_status not null default 'submitted',
  submitted_at       timestamptz not null default now(),
  decided_at         timestamptz,
  decided_by         uuid references auth.users (id),
  rejection_reason   public.rejection_reason,
  rejection_note     text,
  late_report        boolean not null default false,
  voided_at          timestamptz,
  voided_by          uuid references auth.users (id),
  void_reason        text,
  created_at         timestamptz not null default now(),
  constraint payments_approval_requires_person
    check (status <> 'approved' or (verified_amount is not null and decided_by is not null))
);

create index payments_business_submitted_idx on public.payments (business_id, submitted_at) where status = 'submitted';
create index payments_reference_idx on public.payments (business_id, reference);
create index payments_booking_idx on public.payments (booking_id);

create table public.payment_proofs (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references public.payments (id) on delete cascade,
  business_id uuid not null references public.businesses (id),
  storage_path text not null,
  sha256      text not null,
  mime_type   text,
  size_bytes  integer,
  created_at  timestamptz not null default now()
);

create index payment_proofs_dup_idx on public.payment_proofs (business_id, sha256);

-- ----------------------------------------------------------------------------
-- Reembolsos (mínimo: registrar el monto a devolver, sin flujo de confirmación)
-- ----------------------------------------------------------------------------
create table public.refunds (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings (id),
  business_id   uuid not null references public.businesses (id),
  amount        integer not null check (amount >= 0),
  kind          text not null default 'refund' check (kind in ('refund', 'credit')),
  method        text,
  status        text not null default 'pending' check (status in ('pending', 'registered')),
  note          text,
  registered_by uuid references auth.users (id),
  registered_at timestamptz,
  created_at    timestamptz not null default now()
);

create index refunds_booking_idx on public.refunds (booking_id);

-- ----------------------------------------------------------------------------
-- Auditoría (principio de diseño #7, K8)
-- ----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_type  text not null check (actor_type in ('staff', 'customer', 'system')),
  actor_id    uuid,
  business_id uuid,
  entity      text not null,
  entity_id   text,
  action      text not null,
  old_data    jsonb,
  new_data    jsonb,
  ip          text,
  user_agent  text
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_business_idx on public.audit_log (business_id, occurred_at);

-- ----------------------------------------------------------------------------
-- updated_at triggers (reutiliza public.set_updated_at de 0001)
-- ----------------------------------------------------------------------------
create trigger spaces_set_updated_at before update on public.spaces
  for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger business_policies_set_updated_at before update on public.business_policies
  for each row execute function public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();
