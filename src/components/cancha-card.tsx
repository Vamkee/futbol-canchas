import Image from "next/image";
import Link from "next/link";

import type { Space } from "@/types";

export function CanchaCard({ space }: { space: Space }) {
  const foto = space.photos[0];
  return (
    <Link
      href={`/canchas/${space.slug}`}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-slate-100">
        {foto ? (
          <Image
            src={foto}
            alt={space.name}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-4xl">⚽</div>
        )}
      </div>
      <div className="p-4">
        <h2 className="font-bold text-slate-900 group-hover:text-brand-700">{space.name}</h2>
        <p className="mt-1 text-sm text-slate-500 line-clamp-2">{space.description}</p>
        {space.capacity && (
          <p className="mt-3 text-sm text-slate-500">Capacidad: {space.capacity} jugadores</p>
        )}
      </div>
    </Link>
  );
}
