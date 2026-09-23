import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Cancha } from "@/types";

import { CanchaCard } from "@/components/cancha-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const { data: canchas, error } = await supabase
    .from("canchas")
    .select("*")
    .order("nombre");

  if (error) {
    return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Error cargando las canchas.</p>;
  }

  return (
    <section>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900">
          Reserva tu cancha en minutos
        </h1>
        <p className="mt-2 text-slate-600">
          Elige establecimiento, bloquea tu turno y confirma el anticipo por Nequi.
        </p>
      </div>

      {canchas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
          Aún no hay canchas disponibles. Vuelve pronto.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(canchas as Cancha[]).map((cancha) => (
            <CanchaCard key={cancha.id} cancha={cancha} />
          ))}
        </div>
      )}
    </section>
  );
}