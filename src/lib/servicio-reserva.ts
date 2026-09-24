import type { Booking, BookingRow, PaymentAccountInfo, Space } from "@/types";

import { BUCKET_COMPROBANTES } from "./constants";
import { createSupabaseServerClient } from "./supabase/server";

export interface ReservaConEspacio {
  booking: Booking | null;
  space: Space | null;
  paymentAccounts: PaymentAccountInfo[];
  error: string | null;
}

/**
 * Obtiene una reserva por su código y su clave de acceso (token largo) vía el
 * RPC `get_booking_by_token`. El código corto nunca es suficiente por sí
 * solo (AC1, RNF7): sin el token, el RPC responde E_NOTFOUND.
 */
export async function obtenerReservaPorToken(codigo: string, token: string): Promise<ReservaConEspacio> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_booking_by_token", {
    p_code: codigo,
    p_access_token: token,
  });

  if (error || !data) {
    return { booking: null, space: null, paymentAccounts: [], error: error?.message ?? "not found" };
  }

  const result = data as { booking: Booking; space: Space; payment_accounts: PaymentAccountInfo[] };
  return { booking: result.booking, space: result.space, paymentAccounts: result.payment_accounts ?? [], error: null };
}

/** Lista de reservas enriquecidas para el panel del negocio. */
export async function listarReservasAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "*, space:spaces(id, name, slug), customer:customers(name, phone_e164), payments(id, booking_id, method, declared_amount, verified_amount, reference, status, submitted_at, rejection_reason, rejection_note, payment_proofs(id, payment_id, storage_path, sha256))"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return { data: [] as BookingRow[], error };

  const rows = (data ?? []) as unknown as BookingRow[];

  for (const row of rows) {
    row.comprobante_signed_url = null;
    row.payments.sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1));
    const latestProof = row.payments.find((p) => p.payment_proofs?.length)?.payment_proofs?.[0];
    if (latestProof) {
      const { data: signed } = await supabase.storage
        .from(BUCKET_COMPROBANTES)
        .createSignedUrl(latestProof.storage_path, 3600);
      row.comprobante_signed_url = signed?.signedUrl ?? null;
    }
  }

  return { data: rows, error: null };
}
