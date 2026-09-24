import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatCOP, formatFechaISO, formatRangoISO } from "@/lib/utils";
import { obtenerReservaPorToken } from "@/lib/servicio-reserva";
import { EstadoBadge } from "@/components/ui/estado-badge";

import { PagoClient } from "./pago-client";

export const metadata: Metadata = { title: "Confirma tu pago" };
export const dynamic = "force-dynamic";

export default async function PagoPage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { codigo } = await params;
  const { t } = await searchParams;

  if (!t) notFound();

  const { booking, space, paymentAccounts, error } = await obtenerReservaPorToken(codigo, t);
  if (error || !booking || !space) notFound();

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="text-2xl font-extrabold text-slate-900">Confirma tu anticipo</h1>
      <p className="mt-1 text-sm text-slate-600">
        Reserva <span className="font-mono font-semibold text-slate-900">{booking.code}</span> · {space.name}
      </p>

      <div className="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <EstadoBadge estado={booking.status} />
        <span>
          {formatFechaISO(booking.starts_at)} · {formatRangoISO(booking.starts_at, booking.ends_at)}
        </span>
      </div>

      <PagoClient
        codigo={booking.code}
        token={t}
        businessId={booking.business_id}
        status={booking.status}
        depositRequired={booking.deposit_required}
        totalFormateado={formatCOP(booking.total)}
        spaceName={space.name}
        resumen={formatRangoISO(booking.starts_at, booking.ends_at)}
        paymentAccounts={paymentAccounts}
        holdExpiresAt={booking.hold_expires_at}
      />
    </section>
  );
}
