import type { Cancha, Reserva } from "@/types";

import { createSupabaseServerClient } from "./supabase/server";

export interface ReservaConCancha {
  reserva: Reserva | null;
  cancha: Cancha | null;
  error: import("@supabase/supabase-js").PostgrestError | null;
}

/**
 * Obtiene una reserva por su Código Único usando el RPC seguro
 * `obtener_reserva` (no hay acceso directo por RLS).
 */
export async function obtenerReservaPorCodigo(codigo: string): Promise<ReservaConCancha> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("obtener_reserva", { p_codigo: codigo });
  if (error) return { reserva: null, cancha: null, error };

  const reserva = data as Reserva | null;
  if (!reserva) return { reserva: null, cancha: null, error: null };

  const { data: cancha } = await supabase
    .from("canchas")
    .select("*")
    .eq("id", reserva.cancha_id)
    .maybeSingle();

  return { reserva, cancha: (cancha as Cancha | null) ?? null, error: null };
}

/** Lista de reservas con su cancha para el dashboard del administrador. */
export async function listarReservasAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reservas")
    .select("*, cancha:canchas(id, nombre, slug)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { data: [] as Reserva[], error };
  return { data: (data ?? []) as Reserva[], error: null };
}