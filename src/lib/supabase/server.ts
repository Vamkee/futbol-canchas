import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase server-side con sesión de cookies.
 * Recomendado para Server Components y Route Handlers autenticados.
 * NO usar dentro de funciones con `force-static`.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // ocurre en Server Components durante render estático; el middleware renueva la sesión.
          }
        },
      } satisfies CookieMethodsServer,
    }
  );
}