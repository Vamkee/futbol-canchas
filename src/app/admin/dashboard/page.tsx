import { redirect } from "next/navigation";

import { BUCKET_COMPROBANTES } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Bloqueo, Cancha, Reserva } from "@/types";

import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export interface ReservaFila extends Reserva {
  cancha: Pick<Cancha, "id" | "nombre" | "slug"> | null;
  comprobante_signed_url: string | null;
}

export interface BloqueoFila extends Bloqueo {
  cancha: Pick<Cancha, "id" | "nombre"> | null;
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: adminRow } = await supabase
    .from("admins")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRow) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <p className="font-bold">Acceso denegado.</p>
        <p className="mt-1">
          Este usuario no está registrado como administrador. Pídele al dueño del proyecto que ejecute
          {" "}<code className="font-mono">select public.grant_admin(&apos;{user.id}&apos;);</code> en Supabase.
        </p>
      </div>
    );
  }

  const [reservasResult, canchasResult, bloqueosResult] = await Promise.all([
    supabase
      .from("reservas")
      .select("*, cancha:canchas(id, nombre, slug)")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("canchas").select("*").order("nombre"),
    supabase
      .from("bloqueos")
      .select("*, cancha:canchas(id, nombre)")
      .order("fecha", { ascending: false })
      .limit(300),
  ]);

  const reservas = (reservasResult.data ?? []) as ReservaFila[];
  const canchas = (canchasResult.data ?? []) as Cancha[];
  const bloqueos = (bloqueosResult.data ?? []) as BloqueoFila[];

  // Firmas de URL para visualizar los comprobantes (bucket privado).
  for (const r of reservas) {
    r.comprobante_signed_url = null;
    if (r.comprobante_url) {
      const { data } = await supabase.storage
        .from(BUCKET_COMPROBANTES)
        .createSignedUrl(r.comprobante_url, 3600);
      r.comprobante_signed_url = data?.signedUrl ?? null;
    }
  }

  return (
    <DashboardClient
      reservas={reservas}
      canchas={canchas}
      bloqueos={bloqueos}
      adminEmail={user.email ?? ""}
    />
  );
}