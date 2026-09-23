"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ESTADO_META, ERROR_MESSAGES } from "@/lib/constants";
import { formatCOP, formatFecha, formatHora } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { EstadoBadge } from "@/components/ui/estado-badge";
import type { ReservaEstado } from "@/types";

import type { BloqueoFila, ReservaFila } from "./page";
import { FormBloqueo } from "./form-bloqueo";

const FILTROS: ("TODAS" | ReservaEstado)[] = [
  "TODAS",
  "PENDIENTE_PAGO",
  "CONFIRMADA",
  "RECHAZADA",
  "CANCELADA",
];

export function DashboardClient({
  reservas,
  canchas,
  bloqueos,
  adminEmail,
}: {
  reservas: ReservaFila[];
  canchas: { id: number; nombre: string }[];
  bloqueos: BloqueoFila[];
  adminEmail: string;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("PENDIENTE_PAGO");
  const [busqueda, setBusqueda] = useState("");
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [accionando, setAccionando] = useState<number | null>(null);

  const visibles = reservas.filter((r) => {
    if (filtro !== "TODAS" && r.estado !== filtro) return false;
    if (fechaFiltro && r.fecha !== fechaFiltro) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      if (
        !r.codigo.toLowerCase().includes(q) &&
        !r.nombre_cliente.toLowerCase().includes(q) &&
        !(r.whatsapp ?? "").includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  async function cambiarEstado(r: ReservaFila, estado: ReservaEstado, motivo?: string) {
    setAccionando(r.id);
    const supabase = createSupabaseBrowserClient();
    const update: Record<string, string> = { estado };
    if (estado === "RECHAZADA") update.motivo_rechazo = motivo ?? "Pago no verificado";
    if (estado === "CANCELADA") update.motivo_rechazo = "Cancelada por el administrador";

    const { error } = await supabase.from("reservas").update(update).eq("id", r.id);
    if (error) {
      console.error(error);
      alert(ERROR_MESSAGES.default);
    }
    setAccionando(null);
    router.refresh();
  }

  function aprobar(r: ReservaFila) {
    void cambiarEstado(r, "CONFIRMADA");
  }

  function rechazar(r: ReservaFila) {
    const motivo = prompt(
      "Motivo del rechazo (se mostrará al cliente):",
      r.referencia_pago ? "No verificamos el pago con la referencia indicada." : "Pago no verificado."
    );
    if (motivo === null) return;
    void cambiarEstado(r, "RECHAZADA", motivo.trim() || "Pago no verificado");
  }

  function cancelar(r: ReservaFila) {
    if (!confirm(`¿Cancelar la reserva ${r.codigo}? Se libera la franja.`)) return;
    void cambiarEstado(r, "CANCELADA");
  }

  async function cerrarSesion() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Reservas</h1>
          <p className="text-sm text-slate-500">
            Sesión: {adminEmail} · {reservas.length} reservas cargadas
          </p>
        </div>
        <button
          type="button"
          onClick={() => void cerrarSesion()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
        >
          Cerrar sesión
        </button>
      </div>

      {/* Filtros */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                filtro === f
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f === "TODAS" ? "Todas" : ESTADO_META[f].label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código, cliente o WhatsApp…"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm min-w-40 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <input
            type="date"
            value={fechaFiltro}
            onChange={(e) => setFechaFiltro(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Tabla de reservas */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Código / Cliente</th>
                <th className="px-4 py-3">Cancha</th>
                <th className="px-4 py-3">Turno</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Comprobante</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    Sin reservas con los filtros actuales.
                  </td>
                </tr>
              )}
              {visibles.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-mono font-semibold text-slate-900">{r.codigo}</p>
                    <p className="text-slate-600">{r.nombre_cliente}</p>
                    <p className="text-xs text-slate-400">📱 {r.whatsapp}</p>
                    {r.referencia_pago && (
                      <p className="text-xs text-slate-500">Ref: {r.referencia_pago}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">{r.cancha?.nombre ?? "—"}</td>
                  <td className="px-4 py-3">
                    <p>{formatFecha(r.fecha)}</p>
                    <p className="text-slate-500">
                      {formatHora(r.hora_inicio)} – {formatHora(r.hora_fin)}
                    </p>
                    <p className="text-xs text-slate-400">{formatCOP(r.valor_anticipo)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={r.estado} />
                    {r.motivo_rechazo && (
                      <p className="mt-1 max-w-40 text-xs text-slate-500">“{r.motivo_rechazo}”</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.comprobante_signed_url ? (
                      <a
                        href={r.comprobante_signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-700 underline hover:text-brand-800"
                      >
                        Ver comprobante
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">Sin comprobante</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      {r.estado === "PENDIENTE_PAGO" && (
                        <>
                          <button
                            type="button"
                            disabled={accionando === r.id}
                            onClick={() => aprobar(r)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            ✅ Aprobar pago
                          </button>
                          <button
                            type="button"
                            disabled={accionando === r.id}
                            onClick={() => rechazar(r)}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            ✕ Rechazar pago
                          </button>
                        </>
                      )}
                      {r.estado === "CONFIRMADA" && (
                        <button
                          type="button"
                          disabled={accionando === r.id}
                          onClick={() => cancelar(r)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bloqueo manual (RF-08) */}
      <FormBloqueo canchas={canchas} bloqueos={bloqueos} />
    </div>
  );
}