"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { consultaSchema } from "@/lib/validations";

export default function ConsultarPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = consultaSchema.safeParse({ codigo });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Código inválido.");
      return;
    }
    router.push(`/consultar/${parsed.data.codigo}`);
  }

  return (
    <section className="mx-auto max-w-md">
      <h1 className="text-2xl font-extrabold text-slate-900">Consultar mi reserva</h1>
      <p className="mt-1 text-sm text-slate-600">
        Ingresa tu Código Único de Reserva (ej. <span className="font-mono">K2X7PL9W</span>).
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">
          Código de reserva
          <input
            type="text"
            value={codigo}
            onChange={(e) => {
              setCodigo(e.target.value.toUpperCase());
              setError(null);
            }}
            maxLength={8}
            placeholder="8 caracteres"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase text-sm tracking-widest focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white transition hover:bg-brand-700"
        >
          Buscar reserva
        </button>
      </form>
    </section>
  );
}