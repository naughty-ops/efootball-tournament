import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { Database } from '@/types/database';

export const getAuthenticatedUser = cache(async () => {
  try {
    const supabase = await createClient();
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<{ data: { user: null }; error: Error }>((resolve) => {
      timeoutId = setTimeout(() => {
        resolve({ data: { user: null }, error: new Error('Auth verification timeout') });
      }, 5000);
    });

    const {
      data: { user },
      error,
    } = await Promise.race([
      supabase.auth.getUser(),
      timeoutPromise,
    ]);
    if (timeoutId) clearTimeout(timeoutId);
    if (error || !user) return null;
    return user;
  } catch (err) {
    console.warn('getAuthenticatedUser error:', err);
    return null;
  }
});

export async function createClient() {
  let cookieStore: any = null;
  try {
    cookieStore = await cookies();
  } catch {
    // cookies() called outside of request context (e.g. testing / background task)
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL.trim() !== ''
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : 'https://placeholder.supabase.co';

  const supabaseAnonKey =
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim() !== '')
      ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      : (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim() !== '')
      ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.placeholder';

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore ? cookieStore.getAll() : [];
      },
      setAll(cookiesToSet) {
        try {
          if (cookieStore) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          }
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
  });
}

import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';
export { createAdminClient, isServiceRoleConfigured };

/**
 * Resolves the optimal server client for admin and elevated operations:
 * 1. Returns customClient explicitly if provided.
 * 2. Uses createAdminClient() when SUPABASE_SERVICE_ROLE_KEY is configured.
 * 3. Falls back to await createClient() (authenticated SSR client with session cookies).
 * Never falls back to an unauthenticated/anonymous client. All queries through createClient()
 * are strictly governed by PostgreSQL Row Level Security (RLS) based on auth.uid().
 */
export async function getAdminOrAuthClient(customClient?: any) {
  if (customClient) return customClient;
  if (isServiceRoleConfigured()) {
    try {
      return createAdminClient();
    } catch {
      // Fall through to authenticated SSR client
    }
  }
  return await createClient();
}


