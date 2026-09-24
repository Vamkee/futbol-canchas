import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Cron (sección 17): expira HOLD/pending_approval vencidos (L1) y cierra
 * reservas confirmadas cuyo horario ya terminó (L4). Ambos procesos son
 * idempotentes: correr esto dos veces no causa daño.
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
  const [expirations, closures] = await Promise.all([
    supabase.rpc("run_expirations"),
    supabase.rpc("run_closures"),
  ]);

  if (expirations.error || closures.error) {
    console.error("cron:", expirations.error?.message, closures.error?.message);
    return NextResponse.json({ error: expirations.error?.message ?? closures.error?.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, expired: expirations.data, closed: closures.data });
}

export async function GET(request: NextRequest) {
  return handler(request);
}

export async function POST(request: NextRequest) {
  return handler(request);
}