/**
 * Supabase connection settings, read at runtime.
 *
 * Deliberately read through a computed key: Next inlines any literal
 * `process.env.NEXT_PUBLIC_*` at BUILD time, which would bake the URL into a
 * Docker image and ignore the container's environment. Nothing in the browser
 * talks to Supabase directly — every call goes through server code — so none
 * of these need to reach the client bundle.
 *
 * Either spelling works: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL, and the
 * same for the anon key.
 */

function env(...names: string[]): string | undefined {
  const source = process.env as Record<string, string | undefined>;
  for (const name of names) {
    const value = source[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function supabaseUrl(): string | undefined {
  return env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/+$/, "");
}

export function supabaseAnonKey(): string | undefined {
  return env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/** Server-only. Bypasses row-level security — used for user management and first-run setup. */
export function supabaseServiceKey(): string | undefined {
  return env("SUPABASE_SERVICE_ROLE_KEY");
}

/**
 * True when the app should run against Supabase. Without both values it runs
 * on the JSON demo store, with no sign-in — see `src/lib/data/store.ts`.
 */
export function isSupabaseEnabled(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}
