-- ============================================================================
-- 0008_seed_demo.sql
-- Datos simulados: un negocio con el caso combinable de la sección 4.2 (3
-- unidades F5 que arman una F9) más una cancha de vóley playa independiente,
-- para poder probar combinaciones, choques y fragmentación sin datos reales.
-- ============================================================================

do $$
declare
  v_business_id  uuid;
  v_venue_id     uuid;
  v_zone_futbol  uuid;
  v_zone_voley   uuid;
  v_unit1        uuid;
  v_unit2        uuid;
  v_unit3        uuid;
  v_unit_voley   uuid;
  v_space_f5_1   uuid;
  v_space_f5_2   uuid;
  v_space_f5_3   uuid;
  v_space_f9     uuid;
  v_space_voley  uuid;
  v_sport_futbol uuid;
  v_sport_voley  uuid;
  v_mod_f5       uuid;
  v_mod_f9       uuid;
  v_mod_voley    uuid;
begin
  insert into public.businesses (slug, commercial_name)
  values ('canchas-demo', 'Canchas Demo')
  on conflict (slug) do update set commercial_name = excluded.commercial_name
  returning id into v_business_id;

  insert into public.business_policies (business_id) values (v_business_id)
  on conflict (business_id) do nothing;

  insert into public.payment_accounts (business_id, kind, account_number, holder_name, instructions)
  values (v_business_id, 'nequi', '3001234567', 'Canchas Demo', 'Envía el anticipo exacto y guarda el comprobante.');

  insert into public.venues (business_id, name, address, amenities)
  values (v_business_id, 'Sede Principal', 'Calle 10 # 5-30, Neiva', array['parqueadero', 'baños', 'iluminación'])
  returning id into v_venue_id;

  insert into public.opening_hours (venue_id, weekday, open_time, close_time)
  select v_venue_id, d, '06:00', '23:00' from generate_series(0, 6) as d;

  insert into public.zones (venue_id, name, sort) values (v_venue_id, 'Zona fútbol', 1) returning id into v_zone_futbol;
  insert into public.zones (venue_id, name, sort) values (v_venue_id, 'Zona vóley playa', 2) returning id into v_zone_voley;

  insert into public.units (business_id, venue_id, zone_id, name, surface, lighting, sort)
  values (v_business_id, v_venue_id, v_zone_futbol, 'Unidad 1', 'synthetic', true, 1) returning id into v_unit1;
  insert into public.units (business_id, venue_id, zone_id, name, surface, lighting, sort)
  values (v_business_id, v_venue_id, v_zone_futbol, 'Unidad 2', 'synthetic', true, 2) returning id into v_unit2;
  insert into public.units (business_id, venue_id, zone_id, name, surface, lighting, sort)
  values (v_business_id, v_venue_id, v_zone_futbol, 'Unidad 3', 'synthetic', true, 3) returning id into v_unit3;
  insert into public.units (business_id, venue_id, zone_id, name, surface, lighting, sort)
  values (v_business_id, v_venue_id, v_zone_voley, 'Unidad Vóley 1', 'sand', true, 1) returning id into v_unit_voley;

  insert into public.sports (code, name) values ('futbol', 'Fútbol')
    on conflict (code) do update set name = excluded.name returning id into v_sport_futbol;
  insert into public.sports (code, name) values ('voley_playa', 'Vóley playa')
    on conflict (code) do update set name = excluded.name returning id into v_sport_voley;

  insert into public.modalities (sport_id, code, name) values (v_sport_futbol, 'F5', 'Fútbol 5') returning id into v_mod_f5;
  insert into public.modalities (sport_id, code, name) values (v_sport_futbol, 'F9', 'Fútbol 9') returning id into v_mod_f9;
  insert into public.modalities (sport_id, code, name) values (v_sport_voley, 'VP', 'Vóley playa') returning id into v_mod_voley;

  insert into public.spaces (business_id, venue_id, slug, name, description, capacity, sort)
  values (v_business_id, v_venue_id, 'f5-1', 'F5 #1', 'Cancha sintética individual.', 10, 1) returning id into v_space_f5_1;
  insert into public.spaces (business_id, venue_id, slug, name, description, capacity, sort)
  values (v_business_id, v_venue_id, 'f5-2', 'F5 #2', 'Cancha sintética individual.', 10, 2) returning id into v_space_f5_2;
  insert into public.spaces (business_id, venue_id, slug, name, description, capacity, sort)
  values (v_business_id, v_venue_id, 'f5-3', 'F5 #3', 'Cancha sintética individual.', 10, 3) returning id into v_space_f5_3;
  insert into public.spaces (business_id, venue_id, slug, name, description, capacity, sort)
  values (v_business_id, v_venue_id, 'f9-completa', 'Cancha completa F9', 'Las tres unidades unidas para fútbol 9.', 18, 4)
  returning id into v_space_f9;
  insert into public.spaces (business_id, venue_id, slug, name, description, capacity, min_minutes, step_minutes, max_minutes, sort)
  values (v_business_id, v_venue_id, 'voley-1', 'Vóley Playa #1', 'Cancha de arena.', 8, 60, 60, 120, 5)
  returning id into v_space_voley;

  insert into public.space_units (space_id, unit_id) values
    (v_space_f5_1, v_unit1), (v_space_f5_2, v_unit2), (v_space_f5_3, v_unit3),
    (v_space_f9, v_unit1), (v_space_f9, v_unit2), (v_space_f9, v_unit3),
    (v_space_voley, v_unit_voley);

  insert into public.space_modalities (space_id, modality_id) values
    (v_space_f5_1, v_mod_f5), (v_space_f5_2, v_mod_f5), (v_space_f5_3, v_mod_f5),
    (v_space_f9, v_mod_f9), (v_space_voley, v_mod_voley);

  -- Tarifas por tramo (13.1): antes/después de las 17:00. La combinada F9
  -- tiene su propia tarifa, no la suma de las F5.
  insert into public.rates (space_id, weekdays, start_time, end_time, price_per_hour) values
    (v_space_f5_1, array[0,1,2,3,4,5,6]::smallint[], '06:00', '17:00', 70000),
    (v_space_f5_1, array[0,1,2,3,4,5,6]::smallint[], '17:00', '23:00', 100000),
    (v_space_f5_2, array[0,1,2,3,4,5,6]::smallint[], '06:00', '17:00', 70000),
    (v_space_f5_2, array[0,1,2,3,4,5,6]::smallint[], '17:00', '23:00', 100000),
    (v_space_f5_3, array[0,1,2,3,4,5,6]::smallint[], '06:00', '17:00', 70000),
    (v_space_f5_3, array[0,1,2,3,4,5,6]::smallint[], '17:00', '23:00', 100000),
    (v_space_f9,   array[0,1,2,3,4,5,6]::smallint[], '06:00', '17:00', 150000),
    (v_space_f9,   array[0,1,2,3,4,5,6]::smallint[], '17:00', '23:00', 200000),
    (v_space_voley, array[0,1,2,3,4,5,6]::smallint[], '06:00', '23:00', 60000);

  insert into public.customers (phone_e164, name) values ('+573001234567', 'Cliente Demo')
    on conflict (phone_e164) do nothing;
end $$;
