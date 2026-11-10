import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * Designated fallback/bootstrap administrator email address for the eFootball Tournament Platform.
 */
export const PRIMARY_ADMIN_EMAIL = 'ye.agrajj@gmail.com';

export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'streamer';

export const ADMIN_ROLE_RANK: Record<AdminRole, number> = {
  super_admin: 40,
  admin: 30,
  moderator: 20,
  streamer: 10,
};

/**
 * Checks if a user's role meets the minimum required administrative hierarchy.
 * Hierarchy: super_admin (40) > admin (30) > moderator (20) > streamer (10)
 */
export function hasRequiredAdminRole(userRole: string | null | undefined, minRole: AdminRole = 'moderator'): boolean {
  if (!userRole) return false;
  const userRank = ADMIN_ROLE_RANK[userRole as AdminRole] || 0;
  const requiredRank = ADMIN_ROLE_RANK[minRole] || 0;
  return userRank >= requiredRank;
}

/**
 * Pure helper to verify if an email address strictly matches the bootstrap administrator email.
 */
export function isAllowlistedAdminEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  return email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
}

/**
 * Fetches the verified admin record from public.admin_users for an authenticated user ID.
 * Request-scoped memoization ensures single execution per render lifecycle.
 */
export const getAdminUserRecord = cache(async (userId?: string): Promise<{ id: string; email: string; role: AdminRole } | null> => {
  if (!userId) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await (supabase.from('admin_users') as any)
      .select('id, email, role')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      return data as { id: string; email: string; role: AdminRole };
    }
    return null;
  } catch (err) {
    console.error('getAdminUserRecord error:', err);
    return null;
  }
});

/**
 * Ensures the designated administrator is provisioned in public.admin_users.
 */
export async function syncAdminUserRecord(userId: string, email: string): Promise<void> {
  if (!isAllowlistedAdminEmail(email)) return;

  try {
    const supabase = await createClient();
    const { data: existing, error: selectErr } = await (supabase.from('admin_users') as any)
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!selectErr && existing) {
      return;
    }

    await (supabase.from('admin_users') as any).upsert(
      {
        id: userId,
        email: email.trim().toLowerCase(),
        role: 'super_admin',
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.warn('syncAdminUserRecord warning:', err);
  }
}

/**
 * Server-side helper to verify if a user is an authorized administrator.
 * Checks public.admin_users database records with role hierarchy support.
 */
export const checkIsAdmin = cache(async (userId?: string, userEmail?: string | null, minRole: AdminRole = 'moderator'): Promise<boolean> => {
  if (!userId) return false;

  // 1. Check database-backed admin_users table
  const adminRecord = await getAdminUserRecord(userId);
  if (adminRecord && hasRequiredAdminRole(adminRecord.role, minRole)) {
    return true;
  }

  // 2. Fallback to bootstrap allowlisted admin email
  if (isAllowlistedAdminEmail(userEmail)) {
    await syncAdminUserRecord(userId, userEmail!);
    return true;
  }

  return false;
});

async function fetchAuthenticatedUser(): Promise<{
  user: User | null;
  isAdmin: boolean;
  adminRole: AdminRole | null;
}> {
  if (process.env.NODE_ENV !== 'production' && process.env.TEST_AUTH_USER_EMAIL !== undefined) {
    if (!process.env.TEST_AUTH_USER_EMAIL || process.env.TEST_AUTH_USER_EMAIL === 'none') {
      return { user: null, isAdmin: false, adminRole: null };
    }
    const email = process.env.TEST_AUTH_USER_EMAIL;
    const id = process.env.TEST_AUTH_USER_ID || '30080df7-5188-4630-b597-b8493ebe045d';
    const user = { id, email } as User;
    const isAdmin = isAllowlistedAdminEmail(email);
    return { user, isAdmin, adminRole: isAdmin ? 'super_admin' : null };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return { user: null, isAdmin: false, adminRole: null };
    }

    const adminRecord = await getAdminUserRecord(user.id);
    if (adminRecord) {
      return { user, isAdmin: true, adminRole: adminRecord.role };
    }

    if (isAllowlistedAdminEmail(user.email)) {
      await syncAdminUserRecord(user.id, user.email!);
      return { user, isAdmin: true, adminRole: 'super_admin' };
    }

    return { user, isAdmin: false, adminRole: null };
  } catch (err) {
    console.error('getAuthenticatedUser failed:', err);
    return { user: null, isAdmin: false, adminRole: null };
  }
}

/**
 * Server-side helper to get authenticated user and their verified admin status.
 * Uses React request cache to eliminate duplicate auth and database round-trips during a single page render.
 */
export const getAuthenticatedUser = cache(fetchAuthenticatedUser);

/**
 * Require admin authentication on Server Components / Server Actions / Route Handlers.
 * Enforces role hierarchy (default requires 'admin' or 'super_admin').
 */
export async function requireAdmin(minRole: AdminRole = 'admin'): Promise<{ user: User; role: AdminRole }> {
  const { user, isAdmin, adminRole } = (process.env.NODE_ENV !== 'production' && process.env.TEST_AUTH_USER_EMAIL !== undefined)
    ? await fetchAuthenticatedUser()
    : await getAuthenticatedUser();

  if (!user || !isAdmin || !hasRequiredAdminRole(adminRole || (isAllowlistedAdminEmail(user.email) ? 'super_admin' : null), minRole)) {
    throw new Error('Unauthorized: Designated administrator access required.');
  }
  return { user, role: adminRole || 'super_admin' };
}

/**
 * Require financial administrator access (super_admin or admin in public.admin_users).
 */
export async function requireFinancialAdmin(): Promise<{ user: User; role: AdminRole }> {
  return await requireAdmin('admin');
}

