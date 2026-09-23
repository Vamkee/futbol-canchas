import Link from "next/link";

import { SITE_NAME } from "@/lib/constants";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-brand-700">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white">⚽</span>
          <span>{SITE_NAME}</span>
        </Link>
        <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
          <Link href="/" className="hover:text-brand-700">
            Canchas
          </Link>
          <Link href="/consultar" className="hover:text-brand-700">
            Consultar reserva
          </Link>
        </div>
      </nav>
    </header>
  );
}