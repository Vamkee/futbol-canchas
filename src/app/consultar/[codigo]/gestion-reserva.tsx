"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { errorLegible } from "@/lib/business-rules";
import { formatHoraISO, hoyLocal } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AvailabilitySlot, BookingStatus } from "@/types";

interface GestionReservaProps {
  codigo: string;
  token: string;
  status: BookingStatus;
  spaceSlug: string;
  spaceName: string;
  startsAt: string;
  endsAt: string;
}

const ESTADOS_TERMINALES: BookingStatus[] = ["cancelled", "expired", "completed", "no_show"];

export function GestionReserva({ codigo, token, status, spaceSlug, spaceName, startsAt, endsAt }: GestionReservaProps) {
  const router = useRouter();
  const duracionMin = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);

  const [nuevaFecha, setNuevaFecha] = useState(hoyLocal());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [nuevaHoraISO, setNuevaHoraISO] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<"cambiar" | "cancelar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const gestionable = !ESTADOS_TERMINALES.includes(status) && new Date(startsAt).getTime() > Date.now();

  function cargarSlots(fecha: string) {
    setError(null);
    setNuevaHoraISO(null);
    const supabase = createSupabaseBrowserClient();
    supabase
      .rpc("space_availability", { p_space_slug: spaceSlug, p_date: fecha })
      .then(({ data, error: rpcError }) => {
        if (rpcError) {
          setError("No pudimos cargar la disponibilidad.");
          return;
        }
        const libres = ((data ?? []) as AvailabilitySlot[]).filter(
          (s) => s.status === "free" && new Date(s.starts_at).getTime() > Date.now()
        );
        setSlots(libres);
      });
  }

  useEffect(() => {
    if (gestionable) cargarSlots(hoyLocal());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestionable]);

  if (!gestionable) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Esta reserva ya no admite cambios ni cancelación.
      </p>
    );
  }

  async function cambiar() {
    if (!nuevaHoraISO) return;
    setAccionando("cambiar");
    setError(null);
    setAviso(null);
    const supabase = createSupabaseBrowserClient();
    const nuevoFin = new Date(new Date(nuevaHoraISO).getTime() + duracionMin * 60000).toISOString();
    const { error: rpcError } = await supabase.rpc("request_change", {
      p_code: codigo,
      p_access_token: token,
      p_new_space_slug: spaceSlug,
      p_new_starts_at: nuevaHoraISO,
      p_new_ends_at: nuevoFin,
    });

    if (rpcError) {
      setError(errorLegible(rpcError));
      setAccionando(null);
      return;
    }
    setAviso("Turno cambiado con éxito.");
    setAccionando(null);
    router.refresh();
  }

  async function cancelar() {
    if (!confirm("¿Seguro que deseas cancelar la reserva? La franja se liberará.")) return;
    setAccionando("cancelar");
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: rpcError } = await supabase.rpc("cancel_booking", {
      p_code: codigo,
      p_access_token: token,
    });
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
      <p className="font-bold text-slate-900">Gestionar turno en {spaceName}</p>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Nueva fecha
        <input
          type="date"
          value={nuevaFecha}
          min={hoyLocal()}
          max={maxStr}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setNuevaFecha(v);
            cargarSlots(v);
          }}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </label>

      {slots.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {slots.map((s) => {
            const activa = nuevaHoraISO === s.starts_at;
            return (
              <button
                key={s.starts_at}
                type="button"
                onClick={() => setNuevaHoraISO(s.starts_at)}
                className={`rounded-lg border px-2 py-2 text-sm font-semibold ${
                  activa
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100"
                }`}
              >
                {formatHoraISO(s.starts_at)}
              </button>
            );
          })}
        </div>
      )}
      {nuevaFecha && slots.length === 0 && (
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
          disabled={!nuevaHoraISO || accionando !== null}
          onClick={() => void cambiar()}
          className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {accionando === "cambiar" ? "Cambiando…" : "Cambiar turno"}
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
