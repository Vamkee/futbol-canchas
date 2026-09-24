-- ============================================================================
-- 0007_domain_rls.sql
-- RLS (RNF11: aislamiento entre negocios) y bucket de comprobantes. Las tablas
-- operativas (bookings, occupancies, payments, refunds, audit_log...) no
-- aceptan escritura directa de nadie (22.5.3): solo lectura para el personal
-- del negocio. Toda escritura pasa por las funciones security definer de
-- 0006, que corren como dueño de las tablas y por lo tanto no quedan sujetas
-- a estas políticas (mismo patrón que 0003 con las funciones anteriores).
-- ============================================================================

alter table public.businesses         enable row level security;
alter table public.venues             enable row level security;
alter table public.zones              enable row level security;
alter table public.units              enable row level security;
alter table public.spaces             enable row level security;
alter table public.space_units        enable row level security;
alter table public.sports             enable row level security;
alter table public.modalities         enable row level security;
alter table public.space_modalities   enable row level security;
alter table public.opening_hours      enable row level security;
alter table public.rates              enable row level security;
alter table public.customers          enable row level security;
alter table public.business_policies  enable row level security;
alter table public.business_members   enable row level security;
alter table public.payment_accounts   enable row level security;
alter table public.bookings           enable row level security;
alter table public.booking_price_lines enable row level security;
alter table public.blocks             enable row level security;
alter table public.change_requests    enable row level security;
alter table public.occupancies        enable row level security;
alter table public.payments           enable row level security;
alter table public.payment_proofs     enable row level security;
alter table public.refunds            enable row level security;
alter table public.audit_log          enable row level security;

-- ----------------------------------------------------------------------------
-- Catálogo público (para el buscador y la página del negocio, D1-D3)
-- ----------------------------------------------------------------------------
create policy "businesses_public_read" on public.businesses for select using (true);
create policy "businesses_member_all" on public.businesses for all
  using (public.is_member(id)) with check (public.is_member(id));

create policy "venues_public_read" on public.venues for select using (active);
create policy "venues_member_all" on public.venues for all
  using (public.is_member(business_id)) with check (public.is_member(business_id));

create policy "zones_public_read" on public.zones for select using (true);
create policy "zones_member_all" on public.zones for all
  using (public.is_member((select business_id from public.venues v where v.id = venue_id)))
  with check (public.is_member((select business_id from public.venues v where v.id = venue_id)));

create policy "units_public_read" on public.units for select using (active);
create policy "units_member_all" on public.units for all
  using (public.is_member(business_id)) with check (public.is_member(business_id));

create policy "spaces_public_read" on public.spaces for select using (visible and active);
create policy "spaces_member_all" on public.spaces for all
  using (public.is_member(business_id)) with check (public.is_member(business_id));

create policy "space_units_public_read" on public.space_units for select using (true);
create policy "space_units_member_all" on public.space_units for all
  using (public.is_member((select business_id from public.spaces s where s.id = space_id)))
  with check (public.is_member((select business_id from public.spaces s where s.id = space_id)));

create policy "sports_public_read" on public.sports for select using (active);
create policy "modalities_public_read" on public.modalities for select using (active);
create policy "space_modalities_public_read" on public.space_modalities for select using (true);
create policy "space_modalities_member_all" on public.space_modalities for all
  using (public.is_member((select business_id from public.spaces s where s.id = space_id)))
  with check (public.is_member((select business_id from public.spaces s where s.id = space_id)));

create policy "opening_hours_public_read" on public.opening_hours for select using (true);
create policy "opening_hours_member_all" on public.opening_hours for all
  using (public.is_member((select business_id from public.venues v where v.id = venue_id)))
  with check (public.is_member((select business_id from public.venues v where v.id = venue_id)));

create policy "rates_public_read" on public.rates for select using (active);
create policy "rates_member_all" on public.rates for all
  using (public.is_member((select business_id from public.spaces s where s.id = space_id)))
  with check (public.is_member((select business_id from public.spaces s where s.id = space_id)));

-- ----------------------------------------------------------------------------
-- Clientes: sin lectura pública (datos personales). El personal solo ve
-- clientes con reservas en su propio negocio (RNF11).
-- ----------------------------------------------------------------------------
create policy "customers_member_read" on public.customers for select
  using (exists (
    select 1 from public.bookings b
     where b.customer_id = customers.id and public.is_member(b.business_id)
  ));

-- ----------------------------------------------------------------------------
-- Configuración y personal del negocio
-- ----------------------------------------------------------------------------
create policy "business_policies_member_all" on public.business_policies for all
  using (public.is_member(business_id)) with check (public.is_member(business_id));

create policy "business_members_self_read" on public.business_members for select
  using (public.is_member(business_id));

create policy "payment_accounts_member_all" on public.payment_accounts for all
  using (public.is_member(business_id)) with check (public.is_member(business_id));

-- ----------------------------------------------------------------------------
-- Tablas operativas: solo lectura para el personal del negocio, sin
-- escritura directa de nadie (22.5.3) — toda escritura pasa por 0006.
-- ----------------------------------------------------------------------------
create policy "bookings_member_read" on public.bookings for select using (public.is_member(business_id));
create policy "booking_price_lines_member_read" on public.booking_price_lines for select
  using (public.is_member((select business_id from public.bookings b where b.id = booking_id)));
create policy "blocks_member_read" on public.blocks for select using (public.is_member(business_id));
create policy "change_requests_member_read" on public.change_requests for select
  using (public.is_member((select business_id from public.bookings b where b.id = booking_id)));
create policy "occupancies_member_read" on public.occupancies for select using (public.is_member(business_id));
create policy "payments_member_read" on public.payments for select using (public.is_member(business_id));
create policy "payment_proofs_member_read" on public.payment_proofs for select using (public.is_member(business_id));
create policy "refunds_member_read" on public.refunds for select using (public.is_member(business_id));
create policy "audit_log_member_read" on public.audit_log for select using (public.is_member(business_id));

-- ----------------------------------------------------------------------------
-- Storage: bucket de comprobantes de pago (RNF5)
-- Ruta: {business_id}/{codigo_reserva}/{archivo}
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

create policy "payment_proofs_anon_upload"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'payment-proofs'
    and exists (
      select 1
        from public.bookings b
       where b.business_id::text = (storage.foldername(name))[1]
         and b.code = (storage.foldername(name))[2]
         and b.status = 'hold'
    )
  );

create policy "payment_proofs_member_read_storage"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and public.is_member((storage.foldername(name))[1]::uuid)
  );
