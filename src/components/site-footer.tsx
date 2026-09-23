import { SITE_NAME } from "@/lib/constants";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white py-8 mt-12">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 text-sm text-slate-500">
        <p className="font-medium text-slate-600">{SITE_NAME}</p>
        <p>
          Reserva tu cancha en línea y confirma tu anticipo por Nequi en pocos minutos.
        </p>
      </div>
    </footer>
  );
}