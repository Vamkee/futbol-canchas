"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorLegible } from "@/lib/business-rules";
import { bogotaISO, formatFechaISO, formatRangoISO, hoyLocal } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AffectedBooking, BlockRow } from "@/types";

interface FormBloqueoProps {
  venues: { id: string; name: string }[];
  units: { id: string; name: string; venue_id: string }[];
  blocks: BlockRow[];
}

export function FormBloqueo({ venues, units, blocks }: FormBloqueoProps) {
  const router = useRouter();
  const [venueId, setVenueId] = useState(venues[0]?.id ?? "");
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [fecha, setFecha] = useState(hoyLocal());
  const [horaInicio, setHoraInicio] = useState("18:00");
  const [horaFin, setHoraFin] = useState("19:00");
  const [motivo, setMotivo] = useState("Mantenimiento");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [afectadas, setAfectadas] = useState<AffectedBooking[] | null>(null);

  const unidadesDeLaSede = units.filter((u) => u.venue_id === venueId);

  function toggleUnidad(id: string) {
    setUnitIds((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]));
  }

  async function crearBloqueo(resoluciones: { booking_id: string; action: "cancel" }[] = []) {
    setError(null);
    if (!venueId || unitIds.length === 0) {
      setError("Selecciona la sede y al menos una unidad.");
      return;
    }
    if (!motivo.trim()) {
      setError("Indica un motivo.");
      return;
    }

    setEnviando(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error: rpcError } = await supabase.rpc("create_block", {
      p_venue_id: venueId,
      p_unit_ids: unitIds,
      p_starts_at: bogotaISO(fecha, horaInicio),
      p_ends_at: bogotaISO(fecha, horaFin),
      p_reason_kind: "maintenance",
      p_public_label: "No disponible",
      p_note: motivo.trim(),
      p_resolutions: resoluciones,
    });

    if (rpcError) {
      setError(errorLegible(rpcError));
      setEnviando(false);
      return;
    }

    const result = data as { block: unknown; affected: AffectedBooking[] };
    if (!result.block && result.affected.length > 0) {
      setAfectadas(result.affected);
      setEnviando(false);
      return;
    }

    setAfectadas(null);
    setUnitIds([]);
    setEnviando(false);
    router.refresh();
  }

  async function liberar(id: string) {
    if (!confirm("¿Liberar este bloqueo?")) return;
    const supabase = createSupabaseBrowserClient();
    const { error: rpcError } = await supabase.rpc("release_block", { p_block_id: id });
    if (rpcError) alert(errorLegible(rpcError));
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void crearBloqueo();
        }}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="font-bold text-slate-900">Bloquear horario</h2>
        <p className="mt-1 text-xs text-slate-500">
          Mantenimiento, emergencias o reservas presenciales: ocupa la franja manualmente sobre las unidades
          físicas elegidas.
        </p>

        <div className="mt-4 grid gap-3">
          <label className="block text-sm font-medium text-slate-700">
            Sede
            <select
              value={venueId}
              onChange={(e) => {
                setVenueId(e.target.value);
                setUnitIds([]);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="text-sm font-medium text-slate-700">Unidades</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {unidadesDeLaSede.map((u) => (
                <label
                  key={u.id}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${
                    unitIds.includes(u.id)
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 text-slate-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={unitIds.includes(u.id)}
                    onChange={() => toggleUnidad(u.id)}
                    className="hidden"
                  />
                  {u.name}
                </label>
              ))}
            </div>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            Fecha
            <input
              type="date"
              value={fecha}
              min={hoyLocal()}
              onChange={(e) => e.target.value && setFecha(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-slate-700">
              Desde
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Hasta
              <input
                type="time"
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            Motivo
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}

          {afectadas && afectadas.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-semibold">
                Hay {afectadas.length} reserva(s) activas en esa franja. El bloqueo no se guarda hasta que se
                resuelvan (IND1):
              </p>
              <ul className="mt-2 space-y-1">
                {afectadas.map((a) => (
                  <li key={a.booking_id} className="font-mono">
                    {a.code} · {a.status}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={enviando}
                onClick={() =>
                  void crearBloqueo(afectadas.map((a) => ({ booking_id: a.booking_id, action: "cancel" })))
                }
                className="mt-3 w-full rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Cancelar esas reservas y crear el bloqueo
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {enviando ? "Guardando…" : "Bloquear franja"}
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">Bloqueos activos</h2>
        <ul className="mt-4 space-y-2">
          {blocks.length === 0 && <li className="text-sm text-slate-500">No hay bloqueos activos.</li>}
          {blocks.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-slate-800">
                  {b.venue?.name ?? "Sede"} · {formatFechaISO(b.starts_at)}
                </p>
                <p className="text-slate-500">
                  {formatRangoISO(b.starts_at, b.ends_at)} · {b.note}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void liberar(b.id)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Liberar
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
