import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Space } from "@/types";

import { CanchaCard } from "@/components/cancha-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const { data: spaces, error } = await supabase
    .from("spaces")
    .select("*")
    .eq("visible", true)
    .eq("active", true)
    .order("sort");

  if (error) {
    return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Error cargando los espacios.</p>;
  }

  return (
    <section>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900">Reserva tu cancha en minutos</h1>
        <p className="mt-2 text-slate-600">
          Elige espacio, bloquea tu turno y confirma el anticipo por transferencia.
        </p>
      </div>

      {spaces.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
          Aún no hay espacios disponibles. Vuelve pronto.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(spaces as Space[]).map((space) => (
            <CanchaCard key={space.id} space={space} />
          ))}
        </div>
      )}
    </section>
  );
}
