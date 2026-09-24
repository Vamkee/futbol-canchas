"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { crearReservaSchema } from "@/lib/validations";
import { errorLegible } from "@/lib/business-rules";
import { bogotaISO, formatCOP, formatFechaISO, formatHoraISO } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Quote } from "@/types";

interface ReservaFormProps {
  spaceSlug: string;
  spaceName: string;
  venueId: string;
  modalityCode: string;
  fecha: string;
  horaInicio: string;
  minMinutes: number;
  stepMinutes: number;
  maxMinutes: number;
}

export function ReservaForm({
  spaceSlug,
  spaceName,
  venueId,
  modalityCode,
  fecha,
  horaInicio,
  minMinutes,
  stepMinutes,
  maxMinutes,
}: ReservaFormProps) {
  const router = useRouter();
  const [duracionMin, setDuracionMin] = useState(minMinutes);
  const [nombreCliente, setNombreCliente] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [cotizando, setCotizando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const startsAt = bogotaISO(fecha, horaInicio);
  const endsAt = useMemo(() => new Date(new Date(startsAt).getTime() + duracionMin * 60000).toISOString(), [startsAt, duracionMin]);

  const opcionesDuracion = useMemo(() => {
    const opts: number[] = [];
    for (let m = minMinutes; m <= maxMinutes; m += stepMinutes) opts.push(m);
    return opts;
  }, [minMinutes, maxMinutes, stepMinutes]);

  useEffect(() => {
    let activo = true;
    setCotizando(true);
    const supabase = createSupabaseBrowserClient();
    supabase
      .rpc("quote_booking", { p_space_slug: spaceSlug, p_starts_at: startsAt, p_ends_at: endsAt })
      .then(({ data, error: rpcError }) => {
        if (!activo) return;
        if (rpcError) {
          setError(errorLegible(rpcError));
          setQuote(null);
        } else {
          setQuote(data as Quote);
        }
        setCotizando(false);
      });
    return () => {
      activo = false;
    };
  }, [spaceSlug, startsAt, endsAt]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = crearReservaSchema.safeParse({
      venueId,
      modalityCode,
      spaceSlug,
      fecha,
      horaInicio,
      duracionMin,
      nombreCliente,
      whatsapp,
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Revisa los datos ingresados.");
      return;
    }

    setEnviando(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error: rpcError } = await supabase.rpc("create_hold", {
      p_venue_id: venueId,
      p_modality_code: modalityCode,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_customer_name: nombreCliente.trim(),
      p_customer_phone: whatsapp.trim(),
      p_space_slug: spaceSlug,
    });

    if (rpcError || !data) {
      setError(errorLegible(rpcError));
      setEnviando(false);
      return;
    }

    const result = data as { booking: { code: string }; access_token: string };
    router.push(`/pago/${result.booking.code}?t=${result.access_token}`);
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">{spaceName}</p>
        <p>
          {formatFechaISO(startsAt)} · {formatHoraISO(startsAt)}
        </p>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Duración
        <select
          value={duracionMin}
          onChange={(e) => setDuracionMin(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        >
          {opcionesDuracion.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </label>

      <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
        {cotizando ? (
          "Calculando precio…"
        ) : quote ? (
          <>
            <p>
              Total: <span className="font-semibold">{formatCOP(quote.total)}</span>
            </p>
            <p>
              Anticipo a pagar ahora: <span className="font-semibold">{formatCOP(quote.deposit_required)}</span>
            </p>
            {quote.balance > 0 && <p>Saldo al llegar: {formatCOP(quote.balance)}</p>}
          </>
        ) : (
          "No pudimos calcular el precio para esta franja."
        )}
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Nombre completo
        <input
          type="text"
          value={nombreCliente}
          onChange={(e) => setNombreCliente(e.target.value)}
          placeholder="Ej. Carlos Pérez"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </label>

      <label className="block text-sm font-medium text-slate-700">
        WhatsApp
        <input
          type="tel"
          inputMode="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="573001234567"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <span className="mt-1 block text-xs text-slate-500">Con código de país: 57 + número (Colombia).</span>
      </label>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={enviando || cotizando || !quote}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {enviando ? "Bloqueando turno…" : "Bloquear turno"}
      </button>
    </form>
  );
}
