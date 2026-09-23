import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase del navegador (uso exclusivo en componentes cliente).
 * Usa la clave anónima pública; RLS protege los datos.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}