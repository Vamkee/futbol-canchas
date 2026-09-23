-- ============================================================================
-- 0003_rls_storage.sql
-- Row Level Security (RNF-04) y bucket de almacenamiento de comprobantes.
-- ============================================================================

alter table public.canchas  enable row level security;
alter table public.reservas enable row level security;
alter table public.bloqueos enable row level security;
alter table public.admins   enable row level security;

-- ----------------------------------------------------------------------------
-- canchas
-- ----------------------------------------------------------------------------
-- Público: solo canchas activas.
create policy "canchas_publico_read"
  on public.canchas for select
  using (activa is true);

-- Administradores: gestión completa.
create policy "canchas_admin_all"
  on public.canchas for all
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- reservas
-- ----------------------------------------------------------------------------
-- 1) Lectura pública SOLO vía función obtener_reserva(codigo). Sin acceso directo.
-- 2) Escritura pública SOLO vía RPC crear_reserva/adjuntar_comprobante.
-- 3) Administradores: lectura, actualización (aprobar/rechazar) y gestión total.

create policy "reservas_admin_select"
  on public.reservas for select
  using (public.is_admin());

create policy "reservas_admin_update"
  on public.reservas for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "reservas_admin_insert"
  on public.reservas for insert
  with check (public.is_admin());

create policy "reservas_admin_delete"
  on public.reservas for delete
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- bloqueos (RF-08)
-- ----------------------------------------------------------------------------
create policy "bloqueos_public_read"
  on public.bloqueos for select
  using (activo is true);

create policy "bloqueos_admin_all"
  on public.bloqueos for all
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- admins
-- ----------------------------------------------------------------------------
create policy "admins_self_read"
  on public.admins for select
  using (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- Storage: bucket de comprobantes Nequi (privado)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

-- Un anónimo puede subir UN archivo dentro de la carpeta de su código
-- siempre que exista una reserva en PENDIENTE_PAGO con ese código.
create policy "comprobantes_anon_upload"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'comprobantes'
    and exists (
      select 1
      from public.reservas r
      where r.codigo = (storage.foldername(name))[1]
        and r.estado = 'PENDIENTE_PAGO'
    )
  );

-- Lectura: administradores (verificación humana, RN-03).
create policy "comprobantes_admin_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'comprobantes' and public.is_admin());

-- Administradores no borran archivos por error; si es necesario lo hace el
-- dueño del proyecto desde el Dashboard de Supabase (mejor práctica de control).