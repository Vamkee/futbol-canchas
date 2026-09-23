import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con la clave de service role (bypass de RLS).
 * SOLO para uso server-side: tareas de mantenimiento, cron y operaciones de
 * confianza. NUNCA importar desde componentes cliente ni páginas.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Nunca expongas la service role key al cliente."
    );
  }

  return createClient(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}