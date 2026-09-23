import type { Metadata } from "next";

export const metadata: Metadata = { title: "Panel del administrador" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-8 flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-lg bg-slate-900 text-white">🛡️</span>
        <div>
          <p className="font-bold text-slate-900">Panel del administrador</p>
          <p className="text-xs text-slate-500">Acceso restringido · RLS + JWT</p>
        </div>
      </div>
      {children}
    </div>
  );
}