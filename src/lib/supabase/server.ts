import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";

// One client per request, bound to the request's auth cookies. Use it in
// Server Components, Server Functions, and Route Handlers.
export async function createSupabaseServerClient() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet)
            cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot write cookies. The proxy refreshes the
          // session before rendering, so a failed write here is harmless.
        }
      },
    },
  });
}
