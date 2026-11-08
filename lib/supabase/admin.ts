import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Creates an elevated Supabase client with SUPABASE_SERVICE_ROLE_KEY.
 * Pure server-side client without any dependency on next/headers cookies.
 */
export function createAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL.trim() !== ''
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : 'https://placeholder.supabase.co';

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    throw new Error('createAdminClient: SUPABASE_SERVICE_ROLE_KEY is not defined in server environment');
  }

  return createSupabaseJsClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
