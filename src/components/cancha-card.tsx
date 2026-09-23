import Image from "next/image";
import Link from "next/link";

import { formatCOP } from "@/lib/utils";
import type { Cancha } from "@/types";

export function CanchaCard({ cancha }: { cancha: Cancha }) {
  const foto = cancha.fotos[0];
  return (
    <Link
      href={`/canchas/${cancha.slug}`}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-slate-100">
        {foto ? (
          <Image
            src={foto}
            alt={cancha.nombre}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-4xl">⚽</div>
        )}
      </div>
      <div className="p-4">
        <h2 className="font-bold text-slate-900 group-hover:text-brand-700">{cancha.nombre}</h2>
        <p className="mt-1 text-sm text-slate-500 line-clamp-2">{cancha.descripcion}</p>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="font-semibold text-brand-700">{formatCOP(cancha.precio_por_hora)}/hora</span>
          <span className="text-slate-500">Anticipo {formatCOP(cancha.monto_anticipo)}</span>
        </div>
      </div>
    </Link>
  );
}