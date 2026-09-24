"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn, formatHoraISO, hoyLocal } from "@/lib/utils";
import type { AvailabilitySlot } from "@/types";

interface HorariosClientProps {
  slug: string;
  stepMinutes: number;
}

export function HorariosClient({ slug, stepMinutes }: HorariosClientProps) {
  const [fecha, setFecha] = useState(hoyLocal());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let activo = true;

    setCargando(true);
    setError(null);

    supabase
      .rpc("space_availability", { p_space_slug: slug, p_date: fecha })
      .then(({ data, error: rpcError }) => {
        if (!activo) return;
        if (rpcError) {
          setError("No pudimos cargar la disponibilidad.");
          setSlots([]);
        } else {
          setSlots((data ?? []) as AvailabilitySlot[]);
        }
        setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [slug, fecha]);

  const min = hoyLocal();
  const max = new Date();
  max.setDate(max.getDate() + 30);
  const maxStr = max.toISOString().slice(0, 10);
  const ahora = Date.now();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-900">Disponibilidad</h2>
      <label className="mt-3 block text-sm font-medium text-slate-600">Fecha del turno</label>
      <input
        type="date"
        value={fecha}
        min={min}
        max={maxStr}
        onChange={(e) => e.target.value && setFecha(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />

      <div className="mt-4">
        {cargando ? (
          <p className="text-sm text-slate-500">Cargando turnos…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-slate-500">Este espacio no abre ese día.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {slots.map((s) => {
              const libre = s.status === "free";
              const futuro = new Date(s.starts_at).getTime() > ahora;
              const habilitada = libre && futuro;
              const horaHHmm = new Date(s.starts_at).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Bogota",
              });

              return (
                <li key={s.starts_at}>
                  {habilitada ? (
                    <Link
                      href={`/reservar/${slug}?fecha=${fecha}&hora=${horaHHmm}`}
                      className="block rounded-lg border border-brand-300 bg-brand-50 px-2 py-2 text-center text-sm font-semibold text-brand-800 transition hover:bg-brand-100"
                    >
                      {formatHoraISO(s.starts_at)}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      aria-label={`Turno ${s.status}`}
                      className={cn(
                        "w-full cursor-not-allowed rounded-lg border px-2 py-2 text-center text-sm",
                        s.status === "closed"
                          ? "border-dashed border-slate-200 bg-slate-50 text-slate-300"
                          : "border-slate-200 bg-slate-100 text-slate-400"
                      )}
                    >
                      {formatHoraISO(s.starts_at)}
                      <span className="block text-xs">
                        {!futuro ? "Pasado" : s.status === "occupied" ? "Ocupada" : "Cerrado"}
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Cada casilla dura {stepMinutes} min. Al reservar eliges la duración completa.
      </p>
    </div>
  );
}
