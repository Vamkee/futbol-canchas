import { notFound } from "next/navigation";

import { HORA_REGEX } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bogotaISO } from "@/lib/utils";
import type { AvailabilitySlot, Space } from "@/types";

import { ReservaForm } from "./reserva-form";

export const dynamic = "force-dynamic";

interface SpaceWithModality extends Space {
  space_modalities: { modalities: { code: string; name: string } | null }[];
}

export default async function ReservarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ fecha?: string; hora?: string }>;
}) {
  const { slug } = await params;
  const { fecha, hora } = await searchParams;

  if (!fecha || !hora || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !HORA_REGEX.test(hora)) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Selecciona una fecha y un horario disponibles para reservar.
      </p>
    );
  }

  const supabase = await createSupabaseServerClient();

  const { data: space, error } = await supabase
    .from("spaces")
    .select("*, space_modalities(modalities(code, name))")
    .eq("slug", slug)
    .eq("active", true)
    .eq("visible", true)
    .maybeSingle();

  if (error || !space) notFound();

  const spaceData = space as unknown as SpaceWithModality;
  const modalidad = spaceData.space_modalities[0]?.modalities;
  if (!modalidad) notFound();

  const startsAt = bogotaISO(fecha, hora);
  const startsAtMs = new Date(startsAt).getTime();
  const { data: slotsData } = await supabase.rpc("space_availability", { p_space_slug: slug, p_date: fecha });
  const slots = (slotsData as AvailabilitySlot[] | null) ?? [];
  // Comparar por instante, no por string: el RPC devuelve el offset en UTC
  // (+00:00) mientras que `startsAt` se construye con el offset de Bogotá
  // (-05:00) — son la misma hora pero distintas cadenas.
  const slotIndex = slots.findIndex((s) => new Date(s.starts_at).getTime() === startsAtMs);
  const slot = slotIndex >= 0 ? slots[slotIndex] : undefined;

  if (!slot || slot.status !== "free") {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Ese turno ya no está disponible. Vuelve al espacio y elige otro horario.
      </p>
    );
  }

  // Cuántos minutos consecutivos libres siguen desde este turno (para no
  // ofrecer en el formulario una duración que se salga del horario o choque
  // con otra reserva).
  let minutosLibresSeguidos = 0;
  for (let i = slotIndex; i < slots.length; i++) {
    const actual = slots[i];
    const esperado = new Date(startsAt).getTime() + minutosLibresSeguidos * 60000;
    if (actual.status !== "free" || new Date(actual.starts_at).getTime() !== esperado) break;
    minutosLibresSeguidos += spaceData.step_minutes;
  }

  if (minutosLibresSeguidos < spaceData.min_minutes) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        No hay suficiente tiempo libre seguido desde esa hora para la duración mínima de este espacio
        ({spaceData.min_minutes} min). Elige un horario más temprano.
      </p>
    );
  }

  return (
    <section className="mx-auto max-w-xl">
      <a href={`/canchas/${slug}`} className="text-sm text-brand-700 hover:underline">
        ← Volver a {spaceData.name}
      </a>
      <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Reserva tu turno</h1>
      <p className="mt-1 text-sm text-slate-600">Completa tus datos para bloquear el turno.</p>

      <ReservaForm
        spaceSlug={spaceData.slug}
        spaceName={spaceData.name}
        venueId={spaceData.venue_id}
        modalityCode={modalidad.code}
        fecha={fecha}
        horaInicio={hora}
        minMinutes={spaceData.min_minutes}
        stepMinutes={spaceData.step_minutes}
        maxMinutes={Math.min(spaceData.max_minutes, minutosLibresSeguidos)}
      />
    </section>
  );
}
