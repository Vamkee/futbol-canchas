import type { Metadata } from "next";

import { SITE_NAME } from "@/lib/constants";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} · Reserva tu cancha en línea`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Reserva canchas deportivas en línea, bloquea tu turno y confirma tu anticipo por transferencia.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}