"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatFecha, formatHora, hoyLocal } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import type { BloqueoFila } from "./page";

interface FormBloqueoProps {
  canchas: { id: number; nombre: string }[];
  bloqueos: BloqueoFila[];
}

export function FormBloqueo({ canchas, bloqueos }: FormBloqueoProps) {
  const router = useRouter();
  const [canchaId, setCanchaId] = useState("");
  const [fecha, setFecha] = useState(hoyLocal());
  const [horaInicio, setHoraInicio] = useState("18:00");
  const [horaFin, setHoraFin] = useState("19:00");
  const [motivo, setMotivo] = useState("Reserva presencial");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crearBloqueo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!canchaId) {
      setError("Selecciona una cancha.");
      return;
    }
    if (!motivo.trim()) {
      setError("Indica un motivo.");
      return;
    }

    setEnviando(true);
    const supabase = createSupabaseBrowserClient();
    const { error: insertError } = await supabase.from("bloqueos").insert({
      cancha_id: Number(canchaId),
      fecha,
      hora_inicio: `${horaInicio}:00`,
      hora_fin: `${horaFin}:00`,
      motivo: motivo.trim(),
    });

    if (insertError) {
      setError(insertError.message);
      setEnviando(false);
      return;
    }
    setEnviando(false);
    router.refresh();
  }

  async function quitarBloqueo(id: number) {
    if (!confirm("¿Eliminar este bloqueo?")) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("bloqueos").update({ activo: false }).eq("id", id);
    router.refresh();
  }

  const activos = bloqueos.filter((b) => b.activo);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={crearBloqueo} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">Bloquear horario (RF-08)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Reservas presenciales o por llamada: ocupa la franja manualmente.
        </p>

        <div className="mt-4 grid gap-3">
          <label className="block text-sm font-medium text-slate-700">
            Cancha
            <select
              value={canchaId}
              onChange={(e) => setCanchaId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">Selecciona…</option>
              {canchas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>

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
          {activos.length === 0 && (
            <li className="text-sm text-slate-500">No hay bloqueos activos.</li>
          )}
          {activos.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-slate-800">
                  {b.cancha?.nombre ?? "Cancha"} · {formatFecha(b.fecha)}
                </p>
                <p className="text-slate-500">
                  {formatHora(b.hora_inicio)} – {formatHora(b.hora_fin)} · {b.motivo}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void quitarBloqueo(b.id)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}