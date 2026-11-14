import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export function isServiceRoleConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim()
  );
}

/**
 * Creates an elevated Supabase client with SUPABASE_SERVICE_ROLE_KEY.
 * Pure server-side client without any dependency on next/headers cookies.
 */
export function createAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL.trim() !== ''
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : 'https://placeholder.supabase.co';

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    'placeholder';

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && !process.env.SUPABASE_SERVICE_KEY?.trim()) {
    console.warn('createAdminClient: SUPABASE_SERVICE_ROLE_KEY not configured, falling back to public key.');
  }

  return createSupabaseJsClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
