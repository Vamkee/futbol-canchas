"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BUCKET_COMPROBANTES, WHATSAPP_NUMBER } from "@/lib/constants";
import { mensajeReservaToAdmin, whatsappLink } from "@/lib/flujo";
import { formatCOP } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { errorLegible } from "@/lib/business-rules";
import type { BookingStatus, PaymentAccountInfo } from "@/types";

interface PagoClientProps {
  codigo: string;
  token: string;
  businessId: string;
  status: BookingStatus;
  depositRequired: number;
  totalFormateado: string;
  spaceName: string;
  resumen: string;
  paymentAccounts: PaymentAccountInfo[];
  holdExpiresAt: string | null;
}

const LIMITE_ARCHIVO_BYTES = 5 * 1024 * 1024; // 5 MiB

function mmss(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function PagoClient(props: PagoClientProps) {
  const {
    codigo,
    token,
    businessId,
    status,
    depositRequired,
    spaceName,
    resumen,
    paymentAccounts,
    holdExpiresAt,
  } = props;

  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const cuenta = paymentAccounts.find((a) => a.kind !== "cash") ?? paymentAccounts[0] ?? null;

  const [restante, setRestante] = useState(
    holdExpiresAt ? Math.max(0, new Date(holdExpiresAt).getTime() - Date.now()) : null
  );
  const [referencia, setReferencia] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(status !== "hold");

  useEffect(() => {
    if (!holdExpiresAt || status !== "hold") return;
    const t = setInterval(() => {
      setRestante(Math.max(0, new Date(holdExpiresAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [holdExpiresAt, status]);

  const expirado = status === "expired" || (restante !== null && restante <= 0 && status === "hold");

  async function onFileSeleccionado(file: File) {
    setError(null);
    if (!cuenta) {
      setError("Este negocio aún no configuró una cuenta de pago.");
      return;
    }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("El comprobante debe ser una imagen o un PDF.");
      return;
    }
    if (file.size > LIMITE_ARCHIVO_BYTES) {
      setError("El archivo supera 5 MB.");
      return;
    }

    setSubiendo(true);
    const supabase = createSupabaseBrowserClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${businessId}/${codigo}/${crypto.randomUUID()}.${ext}`;
    const sha256 = await sha256Hex(file);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_COMPROBANTES)
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      setError(errorLegible(new Error(uploadError.message)));
      setSubiendo(false);
      return;
    }

    const { error: rpcError } = await supabase.rpc("submit_payment", {
      p_code: codigo,
      p_access_token: token,
      p_method: cuenta.kind,
      p_declared_amount: depositRequired,
      p_payment_account_id: cuenta.id,
      p_reference: referencia.trim() || null,
      p_storage_path: path,
      p_sha256: sha256,
      p_mime_type: file.type,
      p_size_bytes: file.size,
    });

    if (rpcError) {
      setError(errorLegible(rpcError));
      setSubiendo(false);
      return;
    }

    setEnviado(true);
    setSubiendo(false);
    router.refresh();
  }

  const numeroWhatsApp = WHATSAPP_NUMBER || cuenta?.account_number || "";
  const mensaje = mensajeReservaToAdmin({
    codigo,
    espacioNombre: spaceName,
    resumen,
    referencia: referencia || null,
  });

  return (
    <div className="mt-6 space-y-5">
      {status === "hold" && holdExpiresAt && (
        <div
          className={`rounded-xl border p-4 text-center text-sm font-semibold ${
            expirado ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {expirado
            ? "Se agotó el tiempo para pagar. La franja fue liberada."
            : `Tienes ${mmss(restante ?? 0)} para cargar el comprobante o la franja se libera.`}
        </div>
      )}

      {status !== "hold" && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-center text-sm font-semibold text-sky-800">
          {status === "pending_review" && "Tu comprobante está en revisión. Te avisaremos cuando se confirme."}
          {status === "confirmed" && "¡Reserva confirmada!"}
          {status === "expired" && "Esta reserva expiró."}
          {status === "cancelled" && "Esta reserva fue cancelada."}
          {status === "pending_approval" && "Esperando que el negocio acepte tu reserva."}
        </div>
      )}

      {status === "hold" && !expirado && cuenta && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">1. Haz el anticipo</h2>
          <div className="mt-4 rounded-lg bg-brand-50 p-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Monto del anticipo</p>
            <p className="mt-1 text-3xl font-extrabold text-brand-700">{formatCOP(depositRequired)}</p>
            <p className="mt-2 text-xs text-slate-500">
              {cuenta.kind === "nequi" ? "Nequi" : cuenta.kind === "daviplata" ? "Daviplata" : "Transferencia"}
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-slate-900">{cuenta.account_number}</p>
            <p className="mt-2 text-xs text-slate-500">
              Titular: {cuenta.holder_name} · Referencia: {codigo}
            </p>
            {cuenta.instructions && <p className="mt-2 text-xs text-slate-500">{cuenta.instructions}</p>}
          </div>
        </div>
      )}

      {status === "hold" && !expirado && !enviado && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">2. Carga tu comprobante</h2>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Número de referencia de la transacción (opcional)
            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej. 2056839"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFileSeleccionado(file);
            }}
          />

          {error && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}

          <button
            type="button"
            disabled={subiendo}
            onClick={() => inputRef.current?.click()}
            className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {subiendo ? "Subiendo…" : "Adjuntar comprobante"}
          </button>
        </div>
      )}

      {numeroWhatsApp && status === "hold" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">3. ¿Más rápido? Avísanos por WhatsApp</h2>
          <a
            href={whatsappLink(numeroWhatsApp, mensaje)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 font-semibold text-white transition hover:bg-[#1ebe5b]"
          >
            <span>💬</span> Notificar por WhatsApp
          </a>
        </div>
      )}

      <p className="text-center text-xs text-slate-500">
        Guarda este link: es la única forma de volver a tu reserva.
      </p>
    </div>
  );
}
