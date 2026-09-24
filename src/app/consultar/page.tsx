"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { consultaSchema } from "@/lib/validations";

export default function ConsultarPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = consultaSchema.safeParse({ codigo, token });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Revisa los datos.");
      return;
    }
    router.push(`/consultar/${parsed.data.codigo}?t=${encodeURIComponent(parsed.data.token)}`);
  }

  return (
    <section className="mx-auto max-w-md">
      <h1 className="text-2xl font-extrabold text-slate-900">Consultar mi reserva</h1>
      <p className="mt-1 text-sm text-slate-600">
        Usa el link que recibiste al reservar. Si lo perdiste, pega aquí el código y la clave de acceso que
        aparecen en él (después de <span className="font-mono">?t=</span>).
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
            maxLength={6}
            placeholder="6 caracteres"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase text-sm tracking-widest focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Clave de acceso
          <input
            type="text"
            value={token}
            onChange={(e) => {
              setToken(e.target.value.trim());
              setError(null);
            }}
            placeholder="La parte larga del link"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
