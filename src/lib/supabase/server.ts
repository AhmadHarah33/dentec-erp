import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseServiceKey, supabaseUrl } from "./config";

/**
 * A client acting as the signed-in user: their session cookie, their JWT, and
 * therefore their row-level security. This is the client every read and write
 * of business data goes through.
 */
export async function createUserClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(supabaseUrl()!, supabaseAnonKey()!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // A server component cannot set cookies. The middleware refreshes
          // the session on every request, so a token rotated here is not lost.
        }
      },
    },
  });
}

/**
 * The service-role client. It bypasses row-level security, so it is used for
 * exactly two jobs — creating/disabling accounts and first-run setup — and
 * always after the caller's own permission has been checked.
 */
export function createAdminClient(): SupabaseClient {
  const key = supabaseServiceKey();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createPlainClient(supabaseUrl()!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
