"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { crearReservaSchema } from "@/lib/validations";
import { errorLegible } from "@/lib/business-rules";
import { formatCOP, formatFecha, formatHora } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface ReservaFormProps {
  slug: string;
  fecha: string;
  horaInicio: string;
  canchaNombre: string;
  valorAnticipo: number;
}

export function ReservaForm({ slug, fecha, horaInicio, canchaNombre, valorAnticipo }: ReservaFormProps) {
  const router = useRouter();
  const [nombreCliente, setNombreCliente] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = crearReservaSchema.safeParse({
      slug,
      fecha,
      hora_inicio: horaInicio.slice(0, 5),
      nombre_cliente: nombreCliente,
      whatsapp,
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Revisa los datos ingresados.");
      return;
    }

    setEnviando(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error: rpcError } = await supabase.rpc("crear_reserva", {
      p_cancha_slug: slug,
      p_fecha: fecha,
      p_hora_inicio: horaInicio.slice(0, 5),
      p_nombre_cliente: nombreCliente.trim(),
      p_whatsapp: whatsapp.trim(),
    });

    if (rpcError || !data) {
      setError(errorLegible(rpcError));
      setEnviando(false);
      return;
    }

    const codigo = (data as { codigo: string }).codigo;
    router.push(`/pago/${codigo}`);
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">{canchaNombre}</p>
        <p>{formatFecha(fecha)} · {formatHora(horaInicio)}</p>
        <p className="mt-1 text-amber-700">Anticipo a pagar por Nequi: {formatCOP(valorAnticipo)}</p>
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
        disabled={enviando}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {enviando ? "Bloqueando turno…" : "Bloquear turno"}
      </button>

      <p className="text-center text-xs text-slate-500">
        Al confirmar, tu turno queda bloqueado por 15 minutos (RN-01).
      </p>
    </form>
  );
}