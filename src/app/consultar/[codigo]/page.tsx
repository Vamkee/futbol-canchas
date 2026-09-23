import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatCOP, formatFecha, formatHora, hoyLocal } from "@/lib/utils";
import { obtenerReservaPorCodigo } from "@/lib/servicio-reserva";
import { EstadoBadge } from "@/components/ui/estado-badge";

import { GestionReserva } from "./gestion-reserva";

export const metadata: Metadata = { title: "Detalle de reserva" };
export const dynamic = "force-dynamic";

export default async function ConsultarReservaPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const { reserva, cancha, error } = await obtenerReservaPorCodigo(codigo);

  if (error || !reserva || !cancha) notFound();

  return (
    <section className="mx-auto max-w-xl">
      <Link href="/consultar" className="text-sm text-brand-700 hover:underline">
        ← Buscar otra reserva
      </Link>

      <h1 className="mt-4 text-2xl font-extrabold text-slate-900">
        Reserva <span className="font-mono">{reserva.codigo}</span>
      </h1>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <EstadoBadge estado={reserva.estado} />
          <dl className="mt-4 space-y-2 text-sm text-slate-700">
            <div className="flex justify-between">
              <dt className="text-slate-500">Cancha</dt>
              <dd className="text-right font-medium">{cancha.nombre}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Fecha</dt>
              <dd className="font-medium">{formatFecha(reserva.fecha)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Turno</dt>
              <dd className="font-medium">
                {formatHora(reserva.hora_inicio)} – {formatHora(reserva.hora_fin)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Cliente</dt>
              <dd className="font-medium">{reserva.nombre_cliente}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Anticipo</dt>
              <dd className="font-medium">{formatCOP(reserva.valor_anticipo)}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4">
          {reserva.motivo_rechazo && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold">Motivo del rechazo:</p>
              <p className="mt-1">{reserva.motivo_rechazo}</p>
            </div>
          )}

          <GestionReserva
            codigo={reserva.codigo}
            estado={reserva.estado}
            fecha={reserva.fecha}
            horaInicio={reserva.hora_inicio}
            canchaId={cancha.id}
            canchaNombre={cancha.nombre}
            hoy={hoyLocal()}
          />
        </div>
      </div>
    </section>
  );
}