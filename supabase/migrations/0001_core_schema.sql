-- ============================================================================
-- 0001_core_schema.sql
-- Esquema núcleo: tablas, enums, índices y helpers de identidad.
-- ============================================================================

-- pgcrypto: usado para generar códigos aleatorios seguros.
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Tipos
-- ----------------------------------------------------------------------------
create type public.reserva_estado as enum (
  'PENDIENTE_PAGO', -- Reserva temporal bloqueada (timer 15 min si no hay comprobante)
  'CONFIRMADA',     -- Pago verificado por el administrador (RN-03)
  'RECHAZADA',      -- Pago rechazado por el administrador
  'CANCELADA'       -- Cancelada por el cliente (RN-04) o expirada (RN-01)
);

-- ----------------------------------------------------------------------------
-- Canchas (establecimientos)
-- ----------------------------------------------------------------------------
create table public.canchas (
  id                 bigint generated always as identity primary key,
  nombre             text        not null,
  slug               text        not null unique,
  descripcion        text,
  direccion          text,
  fotos              text[]      not null default '{}',
  precio_por_hora    numeric(10, 2) not null default 0 check (precio_por_hora >= 0),
  monto_anticipo     numeric(10, 2) not null default 0 check (monto_anticipo >= 0),
  numero_nequi       text        not null,
  horario_apertura   time        not null default '06:00',
  horario_cierre     time        not null default '23:00',
  duracion_turno_min integer     not null default 60 check (duracion_turno_min between 30 and 240),
  activa             boolean     not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Reservas
-- ----------------------------------------------------------------------------
create table public.reservas (
  id             bigint generated always as identity primary key,
  codigo         text        not null unique,
  cancha_id      bigint      not null references public.canchas (id) on delete cascade,
  fecha          date        not null,
  hora_inicio    time        not null,
  hora_fin       time        not null,
  nombre_cliente text        not null,
  whatsapp       text        not null check (whatsapp ~ '^\+?[0-9]{7,15}$'),
  valor_anticipo numeric(10, 2) not null check (valor_anticipo >= 0),
  estado         public.reserva_estado not null default 'PENDIENTE_PAGO',
  -- URL (path) del comprobante dentro del bucket `comprobantes/{codigo}/...`
  comprobante_url  text,
  referencia_pago  text,
  motivo_rechazo   text,
  -- RN-01: fecha límite para cargar el comprobante (15 min desde la creación).
  -- Una vez cargado el comprobante se pone a NULL (queda esperando validación humana).
  expira_en        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint reservas_horario_ok  check (hora_fin > hora_inicio),
  constraint reservas_fecha_futura check (fecha >= current_date - 1)
);

-- RN-05: Prevención de doble reserva a nivel de base de datos.
-- Índice único parcial => la franja (cancha, fecha, hora_inicio) solo puede
-- pertenecer a UNA reserva activa. Es el bloqueo atómico que garantiza exclusividad.
create unique index reservas_turno_exclusivo
  on public.reservas (cancha_id, fecha, hora_inicio)
  where estado in ('PENDIENTE_PAGO', 'CONFIRMADA');

create index reservas_estado_idx on public.reservas (estado);
create index reservas_cancha_fecha_idx on public.reservas (cancha_id, fecha);
create index reservas_codigo_idx on public.reservas (codigo);

-- ----------------------------------------------------------------------------
-- Bloqueos manuales (RF-08: personas que reservan presencial o por llamada)
-- ----------------------------------------------------------------------------
create table public.bloqueos (
  id          bigint generated always as identity primary key,
  cancha_id   bigint  not null references public.canchas (id) on delete cascade,
  fecha       date    not null,
  hora_inicio time    not null,
  hora_fin    time    not null,
  motivo      text    not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint bloqueos_horario_ok check (hora_fin > hora_inicio)
);

create index bloqueos_cancha_fecha_idx on public.bloqueos (cancha_id, fecha);

-- ----------------------------------------------------------------------------
-- Administradores (RNF-04: autenticación JWT + RLS)
-- ----------------------------------------------------------------------------
create table public.admins (
  id         uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

-- Genera un Código Único de Reserva legible (sin caracteres ambiguos).
create or replace function public.generar_codigo() returns text
  language plpgsql volatile
  set search_path = public, pg_temp
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code     text;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substring(v_alphabet from (1 + floor(random() * length(v_alphabet)))::int for 1);
    end loop;
    if not exists (select 1 from public.reservas where codigo = v_code) then
      return v_code;
    end if;
  end loop;
end;
$$;

-- Mantiene updated_at.
create or replace function public.set_updated_at() returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger canchas_set_updated_at
  before update on public.canchas
  for each row execute function public.set_updated_at();

create trigger reservas_set_updated_at
  before update on public.reservas
  for each row execute function public.set_updated_at();

-- Quién es administrador (usado por las políticas RLS).
create or replace function public.is_admin() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admins where id = auth.uid());
$$;

comment on function public.is_admin() is 'Retorna true si el usuario autenticado pertenece a la tabla public.admins.';