import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export function isServiceRoleConfigured(): boolean {
  if (typeof window !== 'undefined') return false;
  return Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim()
  );
}

/**
 * Creates an elevated Supabase client with SUPABASE_SERVICE_ROLE_KEY.
 * Pure server-only client without any dependency on next/headers cookies.
 * Strictly fails closed if the service-role secret is not configured.
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient cannot be called from browser context.');
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL.trim() !== ''
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : 'https://placeholder.supabase.co';

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim();

  if (!serviceRoleKey) {
    throw new Error(
      'Configuration Error: SUPABASE_SERVICE_ROLE_KEY is required for elevated administrative operations. Ensure this environment variable is configured in the production deployment.'
    );
  }

  return createSupabaseJsClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
