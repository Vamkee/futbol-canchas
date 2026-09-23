"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { puedeReprogramar, errorLegible } from "@/lib/business-rules";
import { formatHora, hoyLocal } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Franja, ReservaEstado } from "@/types";

interface GestionReservaProps {
  codigo: string;
  estado: ReservaEstado;
  fecha: string;
  horaInicio: string;
  canchaId: number;
  canchaNombre: string;
  hoy: string;
}

export function GestionReserva({
  codigo,
  estado,
  fecha,
  horaInicio,
  canchaId,
  canchaNombre,
  hoy,
}: GestionReservaProps) {
  const router = useRouter();
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState(hoy);
  const [franjas, setFranjas] = useState<Franja[]>([]);
  const [nuevaHora, setNuevaHora] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<"reprogramar" | "cancelar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    setPuedeGestionar(
      estado !== "CANCELADA" && estado !== "RECHAZADA" && puedeReprogramar(fecha, horaInicio)
    );
  }, [estado, fecha, horaInicio]);

  function cargarFranjas(fechaSel: string) {
    setError(null);
    setNuevaHora(null);
    const supabase = createSupabaseBrowserClient();
    supabase
      .rpc("franjas_disponibles", { p_cancha_id: canchaId, p_fecha: fechaSel })
      .then(({ data, error: rpcError }) => {
        if (rpcError) {
          setError("No pudimos cargar la disponibilidad.");
          return;
        }
        const franjas = (data ?? []) as Franja[];
        const libresEnFuturo = franjas.filter((f) => {
          const [y, m, d] = fechaSel.split("-").map(Number);
          const [hh, mm] = f.hora_inicio.split(":").map(Number);
          return f.estado === "LIBRE" && new Date(y, m - 1, d, hh, mm).getTime() > Date.now();
        });
        setFranjas(libresEnFuturo);
      });
  }

  useEffect(() => {
    if (puedeGestionar) cargarFranjas(hoy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeGestionar]);

  if (!puedeGestionar) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Reprogramar o cancelar solo está disponible si faltan más de 6 horas para el turno (RN-04).
      </p>
    );
  }

  async function reprogramar() {
    if (!nuevaHora) return;
    setAccionando("reprogramar");
    setError(null);
    setAviso(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error: rpcError } = await supabase.rpc("reprogramar_reserva", {
      p_codigo: codigo,
      p_nueva_fecha: nuevaFecha,
      p_hora_inicio: nuevaHora,
    });

    if (rpcError || !data) {
      setError(errorLegible(rpcError));
      setAccionando(null);
      return;
    }
    setAviso("Turno reprogramado con éxito.");
    setAccionando(null);
    router.refresh();
  }

  async function cancelar() {
    if (!confirm("¿Seguro que deseas cancelar la reserva? La franja se liberará.")) return;
    setAccionando("cancelar");
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: rpcError } = await supabase.rpc("cancelar_reserva", { p_codigo: codigo });
    if (rpcError) {
      setError(errorLegible(rpcError));
      setAccionando(null);
      return;
    }
    setAccionando(null);
    router.refresh();
  }

  const maxFecha = new Date();
  maxFecha.setDate(maxFecha.getDate() + 30);
  const maxStr = maxFecha.toISOString().slice(0, 10);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="font-bold text-slate-900">Gestionar turno en {canchaNombre}</p>
      <p className="mt-1 text-xs text-slate-500">
        Turno actual: {fecha} · {formatHora(horaInicio)}
      </p>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Nueva fecha
        <input
          type="date"
          value={nuevaFecha}
          min={hoy}
          max={maxStr}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setNuevaFecha(v);
            cargarFranjas(v);
          }}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </label>

      {franjas.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {franjas.map((f) => {
            const activa = nuevaHora === f.hora_inicio.slice(0, 5);
            return (
              <button
                key={f.hora_inicio}
                type="button"
                onClick={() => setNuevaHora(f.hora_inicio.slice(0, 5))}
                className={`rounded-lg border px-2 py-2 text-sm font-semibold ${
                  activa
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100"
                }`}
              >
                {formatHora(f.hora_inicio)}
              </button>
            );
          })}
        </div>
      )}
      {nuevaFecha && franjas.length === 0 && (
        <p className="mt-3 text-xs text-slate-500">Sin turnos libres en esa fecha.</p>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {aviso && (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {aviso}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={!nuevaHora || accionando !== null}
          onClick={() => void reprogramar()}
          className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {accionando === "reprogramar" ? "Reprogramando…" : "Reprogramar turno"}
        </button>
        <button
          type="button"
          disabled={accionando !== null}
          onClick={() => void cancelar()}
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {accionando === "cancelar" ? "Cancelando…" : "Cancelar"}
        </button>
      </div>
    </div>
  );
}