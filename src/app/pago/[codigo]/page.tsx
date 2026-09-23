import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatCOP, formatFecha, formatHora } from "@/lib/utils";
import { obtenerReservaPorCodigo } from "@/lib/servicio-reserva";
import { EstadoBadge } from "@/components/ui/estado-badge";

import { PagoClient } from "./pago-client";

export const metadata: Metadata = { title: "Pago por Nequi" };
export const dynamic = "force-dynamic";

export default async function PagoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const { reserva, cancha, error } = await obtenerReservaPorCodigo(codigo);

  if (error || !reserva || !cancha) notFound();

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="text-2xl font-extrabold text-slate-900">Confirma tu anticipo por Nequi</h1>
      <p className="mt-1 text-sm text-slate-600">
        Reserva <span className="font-mono font-semibold text-slate-900">{reserva.codigo}</span> ·{" "}
        {cancha.nombre}
      </p>

      <div className="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <EstadoBadge estado={reserva.estado} />
        <span>
          {formatFecha(reserva.fecha)} · {formatHora(reserva.hora_inicio)}
        </span>
      </div>

      <PagoClient
        codigo={reserva.codigo}
        nombreCliente={reserva.nombre_cliente}
        whatsapp={reserva.whatsapp}
        valorAnticipo={reserva.valor_anticipo}
        numeroNequi={cancha.numero_nequi}
        canchaNombre={cancha.nombre}
        fecha={reserva.fecha}
        horaInicio={reserva.hora_inicio}
        referencia={reserva.referencia_pago}
        tieneComprobante={Boolean(reserva.comprobante_url)}
        expiraEn={reserva.expira_en}
      />
    </section>
  );
}