import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Cron (RN-01): libera automáticamente las reservas cuya franja de 15 minutos
 * expiró sin comprobante cargado.
 *
 * Seguridad:
 * - Si CRON_SECRET está definido, exige `Authorization: Bearer <secret>`.
 * - Vercel Cron inyecta el header reservado `x-vercel-cron`, que no puede
 *   falsificarse desde internet.
 */
async function handler(request: NextRequest) {
  const esCronVercel = request.headers.get("x-vercel-cron") === "1";
  const secret = process.env.CRON_SECRET;

  if (!esCronVercel && secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("liberar_reservas_expiradas");
  if (error) {
    console.error("cron liberar_reservas_expiradas:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  return handler(request);
}

export async function POST(request: NextRequest) {
  return handler(request);
}