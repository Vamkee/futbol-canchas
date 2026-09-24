import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatCOP, formatFechaISO, formatRangoISO } from "@/lib/utils";
import { obtenerReservaPorToken } from "@/lib/servicio-reserva";
import { EstadoBadge } from "@/components/ui/estado-badge";

import { GestionReserva } from "./gestion-reserva";

export const metadata: Metadata = { title: "Detalle de reserva" };
export const dynamic = "force-dynamic";

export default async function ConsultarReservaPage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { codigo } = await params;
  const { t } = await searchParams;

  if (!t) notFound();

  const { booking, space, error } = await obtenerReservaPorToken(codigo, t);
  if (error || !booking || !space) notFound();

  return (
    <section className="mx-auto max-w-xl">
      <Link href="/consultar" className="text-sm text-brand-700 hover:underline">
        ← Buscar otra reserva
      </Link>

      <h1 className="mt-4 text-2xl font-extrabold text-slate-900">
        Reserva <span className="font-mono">{booking.code}</span>
      </h1>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <EstadoBadge estado={booking.status} />
          <dl className="mt-4 space-y-2 text-sm text-slate-700">
            <div className="flex justify-between">
              <dt className="text-slate-500">Espacio</dt>
              <dd className="text-right font-medium">{space.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Fecha</dt>
              <dd className="font-medium">{formatFechaISO(booking.starts_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Turno</dt>
              <dd className="font-medium">{formatRangoISO(booking.starts_at, booking.ends_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Total</dt>
              <dd className="font-medium">{formatCOP(booking.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Anticipo</dt>
              <dd className="font-medium">{formatCOP(booking.deposit_required)}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4">
          {booking.cancel_reason && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold">Motivo:</p>
              <p className="mt-1">{booking.cancel_reason}</p>
            </div>
          )}

          <GestionReserva
            codigo={booking.code}
            token={t}
            status={booking.status}
            spaceSlug={space.slug}
            spaceName={space.name}
            startsAt={booking.starts_at}
            endsAt={booking.ends_at}
          />
        </div>
      </div>
    </section>
  );
}
