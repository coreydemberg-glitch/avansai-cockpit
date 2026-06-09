import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazily-constructed service-role client. Server-side only — bypasses RLS,
// so the service-role key must never reach the browser. We build it on first
// use (not at import) so a missing env var fails at request time rather than
// breaking the build.
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable'
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false },
    // Bypass Next.js's fetch Data Cache so reads always reflect the live DB.
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
  return cached;
}
