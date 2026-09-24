"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ESTADO_META, MOTIVOS_RECHAZO } from "@/lib/constants";
import { errorLegible } from "@/lib/business-rules";
import { formatCOP, formatFechaISO, formatRangoISO } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { EstadoBadge } from "@/components/ui/estado-badge";
import type { BlockRow, BookingRow, BookingStatus } from "@/types";

import { FormBloqueo } from "./form-bloqueo";

const FILTROS: ("TODAS" | BookingStatus)[] = [
  "TODAS",
  "pending_review",
  "pending_approval",
  "hold",
  "confirmed",
  "awaiting_closure",
  "no_show",
  "completed",
  "expired",
  "cancelled",
];

interface DashboardClientProps {
  bookings: BookingRow[];
  venues: { id: string; name: string }[];
  units: { id: string; name: string; venue_id: string }[];
  blocks: BlockRow[];
  businessName: string;
  adminEmail: string;
}

export function DashboardClient({ bookings, venues, units, blocks, businessName, adminEmail }: DashboardClientProps) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("pending_review");
  const [busqueda, setBusqueda] = useState("");
  const [accionando, setAccionando] = useState<string | null>(null);

  const visibles = bookings.filter((b) => {
    if (filtro !== "TODAS" && b.status !== filtro) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      if (
        !b.code.toLowerCase().includes(q) &&
        !(b.customer?.name ?? "").toLowerCase().includes(q) &&
        !(b.customer?.phone_e164 ?? "").includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  async function run(id: string, fn: () => Promise<{ error: { message: string } | null }>) {
    setAccionando(id);
    const { error } = await fn();
    if (error) {
      alert(errorLegible(error));
    }
    setAccionando(null);
    router.refresh();
  }

  function aprobarPago(b: BookingRow) {
    const pago = b.payments.find((p) => p.status === "submitted");
    if (!pago) return;
    const montoStr = prompt("Monto verificado en el banco:", String(pago.declared_amount));
    if (montoStr === null) return;
    const monto = Number(montoStr);
    if (!Number.isFinite(monto) || monto <= 0) {
      alert("Monto inválido.");
      return;
    }
    void run(b.id, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.rpc("review_payment", { p_payment_id: pago.id, p_decision: "approve", p_verified_amount: monto });
    });
  }

  function rechazarPago(b: BookingRow) {
    const pago = b.payments.find((p) => p.status === "submitted");
    if (!pago) return;
    const opciones = MOTIVOS_RECHAZO.map((m, i) => `${i + 1}. ${m.label}`).join("\n");
    const seleccion = prompt(`Motivo del rechazo:\n${opciones}`, "1");
    if (seleccion === null) return;
    const idx = Number(seleccion) - 1;
    const motivo = MOTIVOS_RECHAZO[idx];
    if (!motivo) {
      alert("Selecciona un número válido.");
      return;
    }
    void run(b.id, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.rpc("review_payment", {
        p_payment_id: pago.id,
        p_decision: "reject",
        p_rejection_reason: motivo.value,
      });
    });
  }

  function decidirAprobacion(b: BookingRow, decision: "approve" | "reject") {
    void run(b.id, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.rpc("decide_approval", { p_code: b.code, p_decision: decision });
    });
  }

  function checkIn(b: BookingRow) {
    void run(b.id, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.rpc("check_in", { p_code: b.code });
    });
  }

  function marcarNoShow(b: BookingRow) {
    void run(b.id, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.rpc("mark_no_show", { p_code: b.code });
    });
  }

  function revertirNoShow(b: BookingRow) {
    void run(b.id, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.rpc("revert_no_show", { p_code: b.code });
    });
  }

  function resolverCierre(b: BookingRow, decision: "completed" | "no_show") {
    void run(b.id, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.rpc("resolve_closure", { p_code: b.code, p_decision: decision });
    });
  }

  function cancelar(b: BookingRow) {
    const motivo = prompt("Motivo de la cancelación:", "Cancelada por el negocio");
    if (motivo === null) return;
    void run(b.id, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.rpc("cancel_booking", { p_code: b.code, p_reason: motivo });
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{businessName || "Reservas"}</h1>
          <p className="text-sm text-slate-500">
            Sesión: {adminEmail} · {bookings.length} reservas cargadas
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            const supabase = createSupabaseBrowserClient();
            await supabase.auth.signOut();
            router.push("/admin/login");
            router.refresh();
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
        >
          Cerrar sesión
        </button>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                filtro === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f === "TODAS" ? "Todas" : ESTADO_META[f].label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por código, cliente o WhatsApp…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Código / Cliente</th>
                <th className="px-4 py-3">Espacio</th>
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
              {visibles.map((b) => {
                const pagoEnRevision = b.payments.find((p) => p.status === "submitted");
                const disabled = accionando === b.id;
                return (
                  <tr key={b.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-mono font-semibold text-slate-900">{b.code}</p>
                      <p className="text-slate-600">{b.customer?.name ?? "—"}</p>
                      <p className="text-xs text-slate-400">📱 {b.customer?.phone_e164 ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3">{b.space?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <p>{formatFechaISO(b.starts_at)}</p>
                      <p className="text-slate-500">{formatRangoISO(b.starts_at, b.ends_at)}</p>
                      <p className="text-xs text-slate-400">
                        {formatCOP(b.deposit_required)} anticipo · {formatCOP(b.total)} total
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={b.status} />
                      {pagoEnRevision?.reference && (
                        <p className="mt-1 text-xs text-slate-500">Ref: {pagoEnRevision.reference}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {b.comprobante_signed_url ? (
                        <a
                          href={b.comprobante_signed_url}
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
                        {b.status === "pending_review" && pagoEnRevision && (
                          <>
                            <Boton disabled={disabled} onClick={() => aprobarPago(b)} tono="ok">
                              ✅ Aprobar pago
                            </Boton>
                            <Boton disabled={disabled} onClick={() => rechazarPago(b)} tono="peligro">
                              ✕ Rechazar pago
                            </Boton>
                          </>
                        )}
                        {b.status === "pending_approval" && (
                          <>
                            <Boton disabled={disabled} onClick={() => decidirAprobacion(b, "approve")} tono="ok">
                              ✅ Aceptar reserva
                            </Boton>
                            <Boton disabled={disabled} onClick={() => decidirAprobacion(b, "reject")} tono="peligro">
                              ✕ Rechazar
                            </Boton>
                          </>
                        )}
                        {b.status === "confirmed" && (
                          <>
                            <Boton disabled={disabled} onClick={() => checkIn(b)} tono="ok">
                              Check-in
                            </Boton>
                            <Boton disabled={disabled} onClick={() => marcarNoShow(b)} tono="neutro">
                              No llegó
                            </Boton>
                            <Boton disabled={disabled} onClick={() => cancelar(b)} tono="neutro">
                              Cancelar
                            </Boton>
                          </>
                        )}
                        {b.status === "awaiting_closure" && (
                          <>
                            <Boton disabled={disabled} onClick={() => resolverCierre(b, "completed")} tono="ok">
                              Se completó
                            </Boton>
                            <Boton disabled={disabled} onClick={() => resolverCierre(b, "no_show")} tono="peligro">
                              No llegó
                            </Boton>
                          </>
                        )}
                        {b.status === "no_show" && (
                          <Boton disabled={disabled} onClick={() => revertirNoShow(b)} tono="neutro">
                            Revertir no-show
                          </Boton>
                        )}
                        {b.status === "hold" && (
                          <Boton disabled={disabled} onClick={() => cancelar(b)} tono="neutro">
                            Cancelar
                          </Boton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <FormBloqueo venues={venues} units={units} blocks={blocks} />
    </div>
  );
}

function Boton({
  children,
  onClick,
  disabled,
  tono,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  tono: "ok" | "peligro" | "neutro";
}) {
  const estilos =
    tono === "ok"
      ? "bg-emerald-600 text-white hover:bg-emerald-700"
      : tono === "peligro"
        ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
        : "border border-slate-200 text-slate-600 hover:bg-slate-50";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${estilos}`}
    >
      {children}
    </button>
  );
}
