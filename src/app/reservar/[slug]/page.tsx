import { notFound } from "next/navigation";

import { crearReservaSchema } from "@/lib/validations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Cancha, FranjaRow } from "@/types";

import { ReservaForm } from "./reserva-form";

export const dynamic = "force-dynamic";

export default async function ReservarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ fecha?: string; hora_inicio?: string }>;
}) {
  const { slug } = await params;
  const { fecha, hora_inicio } = await searchParams;

  const parsed = crearReservaSchema
    .pick({ fecha: true, hora_inicio: true })
    .safeParse({ fecha, hora_inicio });

  if (!parsed.success) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Selecciona una fecha y un horario disponibles para reservar.
      </p>
    );
  }

  const supabase = await createSupabaseServerClient();

  const { data: cancha, error } = await supabase
    .from("canchas")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !cancha) notFound();

  const canchaData = cancha as Cancha;
  const { data: franjas } = await supabase.rpc("franjas_disponibles", {
    p_cancha_id: canchaData.id,
    p_fecha: parsed.data.fecha,
  });
  const franja = (franjas as FranjaRow[] | null)?.find(
    (f) => f.hora_inicio.slice(0, 5) === parsed.data.hora_inicio
  );

  if (!franja || franja.estado !== "LIBRE") {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Ese turno ya no está disponible. Vuelve a la cancha y elige otra franja.
      </p>
    );
  }

  return (
    <section className="mx-auto max-w-xl">
      <a href={`/canchas/${slug}`} className="text-sm text-brand-700 hover:underline">
        ← Volver a {canchaData.nombre}
      </a>
      <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Reserva tu turno</h1>
      <p className="mt-1 text-sm text-slate-600">
        Completa tus datos para bloquear el turno por 15 minutos.
      </p>

      <ReservaForm
        slug={slug}
        fecha={parsed.data.fecha}
        horaInicio={`${parsed.data.hora_inicio}:00`}
        canchaNombre={canchaData.nombre}
        valorAnticipo={canchaData.monto_anticipo}
      />
    </section>
  );
}