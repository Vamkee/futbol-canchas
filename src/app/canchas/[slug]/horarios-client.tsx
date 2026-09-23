"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn, esTurnoFuturo, formatCOP, formatHora, hoyLocal } from "@/lib/utils";
import type { FranjaRow } from "@/types";

interface HorariosClientProps {
  canchaId: number;
  slug: string;
  precioHora: number;
  montoAnticipo: number;
}

export function HorariosClient({ canchaId, slug, precioHora }: HorariosClientProps) {
  const [fecha, setFecha] = useState(hoyLocal());
  const [franjas, setFranjas] = useState<FranjaRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let activo = true;

    setCargando(true);
    setError(null);

    supabase
      .rpc("franjas_disponibles", { p_cancha_id: canchaId, p_fecha: fecha })
      .then(({ data, error: rpcError }) => {
        if (!activo) return;
        if (rpcError) {
          setError("No pudimos cargar la disponibilidad.");
          setFranjas([]);
        } else {
          setFranjas((data ?? []) as FranjaRow[]);
        }
        setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [canchaId, fecha]);

  const min = hoyLocal();
  const max = new Date();
  max.setDate(max.getDate() + 30);
  const maxStr = max.toISOString().slice(0, 10);

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
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {franjas.map((f) => {
              const libre = f.estado === "LIBRE";
              const futuro = esTurnoFuturo(fecha, f.hora_inicio, Date.now());
              const habilitada = libre && futuro;

              return (
                <li key={f.hora_inicio}>
                  {habilitada ? (
                    <Link
                      href={`/reservar/${slug}?fecha=${fecha}&hora_inicio=${f.hora_inicio.slice(0, 5)}`}
                      className="block rounded-lg border border-brand-300 bg-brand-50 px-2 py-2 text-center text-sm font-semibold text-brand-800 transition hover:bg-brand-100"
                    >
                      {formatHora(f.hora_inicio)}
                      <span className="block text-xs font-normal text-brand-600">
                        {formatCOP(precioHora)}
                      </span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      aria-label={`Turno ${f.estado.toLowerCase()}`}
                      className={cn(
                        "w-full cursor-not-allowed rounded-lg border px-2 py-2 text-center text-sm",
                        f.estado === "BLOQUEADA"
                          ? "border-slate-200 bg-slate-100 text-slate-400"
                          : f.estado === "OCUPADA"
                            ? "border-slate-200 bg-slate-100 text-slate-400"
                            : "border-dashed border-slate-200 bg-slate-50 text-slate-300"
                      )}
                    >
                      {formatHora(f.hora_inicio)}
                      <span className="block text-xs">
                        {f.estado === "BLOQUEADA" ? "Bloqueada" : f.estado === "OCUPADA" ? "Ocupada" : "Pasado"}
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
        Al reservar se bloquea el turno por 15 minutos mientras confirmas el anticipo por Nequi.
      </p>
    </div>
  );
}