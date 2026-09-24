import { notFound } from "next/navigation";
import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Space } from "@/types";

import { HorariosClient } from "./horarios-client";

export const dynamic = "force-dynamic";

interface SpaceWithModality extends Space {
  space_modalities: { modalities: { code: string; name: string } | null }[];
}

export default async function CanchaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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

  return (
    <section>
      <Link href="/" className="text-sm text-brand-700 hover:underline">
        ← Todos los espacios
      </Link>

      <div className="mt-4 grid gap-8 md:grid-cols-[1fr_360px]">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">{spaceData.name}</h1>
          {spaceData.description && <p className="mt-3 text-slate-600">{spaceData.description}</p>}

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {modalidad && (
              <span className="rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-700">
                {modalidad.name}
              </span>
            )}
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              Turnos de {spaceData.min_minutes} a {spaceData.max_minutes} min
            </span>
            {spaceData.capacity && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                Hasta {spaceData.capacity} jugadores
              </span>
            )}
          </div>
        </div>

        <HorariosClient slug={spaceData.slug} stepMinutes={spaceData.step_minutes} />
      </div>
    </section>
  );
}
