"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BUCKET_COMPROBANTES, WHATSAPP_NUMBER } from "@/lib/constants";
import { mensajeReservaToAdmin, whatsappLink } from "@/lib/flujo";
import { formatCOP } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { adjuntarComprobanteSchema } from "@/lib/validations";
import { errorLegible } from "@/lib/business-rules";

interface PagoClientProps {
  codigo: string;
  nombreCliente: string;
  whatsapp: string;
  valorAnticipo: number;
  numeroNequi: string;
  canchaNombre: string;
  fecha: string;
  horaInicio: string;
  referencia: string | null;
  tieneComprobante: boolean;
  expiraEn: string | null;
}

const LIMITE_ARCHIVO_BYTES = 5 * 1024 * 1024; // 5 MiB (matching Supabase)

function mmss(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PagoClient(props: PagoClientProps) {
  const {
    codigo,
    nombreCliente,
    whatsapp,
    valorAnticipo,
    numeroNequi,
    canchaNombre,
    fecha,
    horaInicio,
    referencia: referenciaInicial,
    tieneComprobante: comprobanteInicial,
    expiraEn,
  } = props;

  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [restante, setRestante] = useState(
    expiraEn ? Math.max(0, new Date(expiraEn).getTime() - Date.now()) : null
  );
  const [referenciaPago, setReferenciaPago] = useState(referenciaInicial ?? "");
  const [comprobanteCargado, setComprobanteCargado] = useState(comprobanteInicial);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expiraEn) return;
    const t = setInterval(() => {
      setRestante(Math.max(0, new Date(expiraEn).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [expiraEn]);

  const expirado = restante !== null && restante <= 0;

  async function onFileSeleccionado(file: File) {
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("El comprobante debe ser una imagen (JPG o PNG).");
      return;
    }
    if (file.size > LIMITE_ARCHIVO_BYTES) {
      setError("La imagen supera 5 MB.");
      return;
    }

    const parsed = adjuntarComprobanteSchema
      .pick({ codigo: true, referencia_pago: true })
      .safeParse({ codigo, referencia_pago: referenciaPago });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Revisa la referencia.");
      return;
    }

    setSubiendo(true);
    const supabase = createSupabaseBrowserClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${codigo}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_COMPROBANTES)
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      setError(errorLegible(new Error(uploadError.message)));
      setSubiendo(false);
      return;
    }

    const { error: attachError } = await supabase.rpc("adjuntar_comprobante", {
      p_codigo: codigo,
      p_comprobante_url: path,
      p_referencia: referenciaPago.trim() || null,
    });

    if (attachError) {
      setError(errorLegible(attachError));
      setSubiendo(false);
      return;
    }

    setComprobanteCargado(true);
    setSubiendo(false);
    router.refresh();
  }

  const numeroWhatsApp = WHATSAPP_NUMBER || numeroNequi;
  const mensaje = mensajeReservaToAdmin({
    codigo,
    canchaNombre,
    resumen: `${fecha} · ${horaInicio}`,
    referencia: referenciaPago || null,
  });

  return (
    <div className="mt-6 space-y-5">
      {/* Temporizador RN-01 */}
      {expiraEn && !comprobanteCargado && (
        <div
          className={`rounded-xl border p-4 text-center text-sm font-semibold ${
            expirado
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {expirado
            ? "Se agotó el tiempo de 15 minutos. La franja fue liberada."
            : `Tienes ${mmss(restante ?? 0)} para cargar el comprobante o la franja se libera.`}
        </div>
      )}

      {/* Datos de Nequi */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">1. Haz el anticipo por Nequi</h2>
        <div className="mt-4 rounded-lg bg-brand-50 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Monto del anticipo</p>
          <p className="mt-1 text-3xl font-extrabold text-brand-700">{formatCOP(valorAnticipo)}</p>
          <p className="mt-2 text-xs text-slate-500">Al número Nequi del negocio</p>
          <p className="mt-1 font-mono text-lg font-semibold text-slate-900">{numeroNequi}</p>
          <p className="mt-2 text-xs text-slate-500">Titular: {canchaNombre} · Referencia: {codigo}</p>
        </div>
      </div>

      {/* Cargar comprobante */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">2. Carga tu comprobante o referencia</h2>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Número de referencia de la transacción (opcional)
          <input
            type="text"
            value={referenciaPago}
            onChange={(e) => setReferenciaPago(e.target.value)}
            disabled={comprobanteCargado || expirado}
            placeholder="Ej. 2056839"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50"
          />
        </label>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFileSeleccionado(file);
          }}
        />

        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        {!comprobanteCargado ? (
          <button
            type="button"
            disabled={subiendo || expirado}
            onClick={() => inputRef.current?.click()}
            className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {subiendo ? "Subiendo…" : "Adjuntar foto del comprobante"}
          </button>
        ) : (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
            ✅ Comprobante cargado. Un administrador lo verificará para confirmar tu reserva.
          </p>
        )}
      </div>

      {/* WhatsApp */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">3. ¿Más rápido? Avísanos por WhatsApp</h2>
        <p className="mt-1 text-sm text-slate-600">
          {nombreCliente.split(" ")[0]}, presiona el botón y se enviará un mensaje pre-llenado con tu
          código <span className="font-mono font-semibold">{codigo}</span>.
        </p>
        <a
          href={whatsappLink(numeroWhatsApp, mensaje)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 font-semibold text-white transition hover:bg-[#1ebe5b]"
        >
          <span>💬</span> Notificar por WhatsApp
        </a>
        <p className="mt-2 text-center text-xs text-slate-500">
          WhatsApp: {whatsapp} · Reserva: {codigo}
        </p>
      </div>
    </div>
  );
}