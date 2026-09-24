import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listarReservasAdmin } from "@/lib/servicio-reserva";
import type { BlockRow } from "@/types";

import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: membership } = await supabase
    .from("business_members")
    .select("business_id, role, business:businesses(id, commercial_name)")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!membership) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <p className="font-bold">Acceso denegado.</p>
        <p className="mt-1">
          Este usuario no tiene membresía en ningún negocio. Pídele al dueño del proyecto que ejecute{" "}
          <code className="font-mono">
            select public.grant_business_member(&apos;canchas-demo&apos;, &apos;{user.id}&apos;, &apos;owner&apos;);
          </code>{" "}
          en Supabase.
        </p>
      </div>
    );
  }

  const businessId = membership.business_id as string;
  const businessName = (membership.business as unknown as { commercial_name: string } | null)?.commercial_name ?? "";

  const [{ data: bookings }, { data: venues }, { data: units }, { data: blocks }] = await Promise.all([
    listarReservasAdmin(),
    supabase.from("venues").select("id, name").eq("business_id", businessId),
    supabase.from("units").select("id, name, venue_id").eq("business_id", businessId).eq("active", true),
    supabase
      .from("blocks")
      .select("*, venue:venues(id, name)")
      .eq("business_id", businessId)
      .is("released_at", null)
      .order("starts_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <DashboardClient
      bookings={bookings ?? []}
      venues={venues ?? []}
      units={units ?? []}
      blocks={(blocks ?? []) as BlockRow[]}
      businessName={businessName}
      adminEmail={user.email ?? ""}
    />
  );
}
