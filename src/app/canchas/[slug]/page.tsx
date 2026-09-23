import { notFound } from "next/navigation";
import Link from "next/link";

import { formatCOP } from "@/lib/utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Cancha } from "@/types";

import { HorariosClient } from "./horarios-client";

export const dynamic = "force-dynamic";

export default async function CanchaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: cancha, error } = await supabase
    .from("canchas")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !cancha) notFound();

  const canchaData = cancha as Cancha;

  return (
    <section>
      <Link href="/" className="text-sm text-brand-700 hover:underline">
        ← Todas las canchas
      </Link>

      <div className="mt-4 grid gap-8 md:grid-cols-[1fr_320px]">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">{canchaData.nombre}</h1>
          {canchaData.direccion && (
            <p className="mt-1 text-sm text-slate-500">📍 {canchaData.direccion}</p>
          )}
          {canchaData.descripcion && (
            <p className="mt-3 text-slate-600">{canchaData.descripcion}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-700">
              {formatCOP(canchaData.precio_por_hora)} / hora
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700">
              Anticipo Nequi: {formatCOP(canchaData.monto_anticipo)}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              Turnos de {canchaData.duracion_turno_min} min ·{" "}
              {canchaData.horario_apertura.slice(0, 5)} a {canchaData.horario_cierre.slice(0, 5)}
            </span>
          </div>
        </div>

        <HorariosClient
          canchaId={canchaData.id}
          slug={canchaData.slug}
          precioHora={canchaData.precio_por_hora}
          montoAnticipo={canchaData.monto_anticipo}
        />
      </div>
    </section>
  );
}