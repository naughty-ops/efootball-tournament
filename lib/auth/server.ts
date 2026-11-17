import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * Designated fallback/bootstrap administrator email address for initial setup only.
 * IMPORTANT: This constant is NOT used for ongoing authorization bypass.
 * Authorization is strictly determined by public.admin_users records in PostgreSQL.
 */
export const PRIMARY_ADMIN_EMAIL = 'ye.agrajj@gmail.com';

export type AdminRole =
  | 'super_admin'
  | 'admin'
  | 'finance_admin'
  | 'support_admin'
  | 'moderator'
  | 'streamer';

export const ADMIN_ROLE_RANK: Record<AdminRole, number> = {
  super_admin: 50,
  admin: 40,
  finance_admin: 30,
  support_admin: 20,
  moderator: 15,
  streamer: 10,
};

/**
 * Checks if a user's role meets the required administrative domain or hierarchy.
 * Enforces domain isolation matching PostgreSQL has_admin_role().
 */
export function hasRequiredAdminRole(userRole: string | null | undefined, minRole: AdminRole = 'moderator'): boolean {
  if (!userRole) return false;
  const role = userRole as AdminRole;

  // 1. super_admin satisfies any administrative role
  if (role === 'super_admin') return true;

  // 2. Exact match
  if (role === minRole) return true;

  // 3. Any active administrator satisfies base staff/streamer requirement (used for base admin layout / dashboard)
  if (minRole === 'streamer') {
    return ['admin', 'finance_admin', 'support_admin', 'moderator', 'streamer'].includes(role);
  }

  // 4. Operations admin satisfies operational hierarchy (admin, moderator)
  // Admin CANNOT satisfy finance_admin or support_admin
  if (role === 'admin' && minRole === 'moderator') {
    return true;
  }

  // 5. Support admin satisfies support & dispute resolution duties (support_admin, moderator)
  // Support admin CANNOT satisfy admin, streamer, or finance_admin
  if (role === 'support_admin' && minRole === 'moderator') {
    return true;
  }

  return false;
}

/**
 * Legacy reference helper.
 * @deprecated Use database-authoritative role verification via getAdminUserRecord / getCurrentAdminRole.
 */
export function isAllowlistedAdminEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  return email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
}

export interface AdminUserRecord {
  id: string;
  email: string;
  role: AdminRole;
  is_active?: boolean;
}

/**
 * Fetches the verified admin record from public.admin_users for an authenticated user ID.
 * Request-scoped memoization ensures single execution per render lifecycle.
 * Rejects revoked or inactive administrator records.
 */
export const getAdminUserRecord = cache(async (userId?: string): Promise<AdminUserRecord | null> => {
  if (!userId) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await (supabase.from('admin_users') as any)
      .select('id, email, role, is_active')
      .eq('id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (!error && data && data.role) {
      return data as AdminUserRecord;
    }
    return null;
  } catch (err) {
    console.error('[getAdminUserRecord] Database lookup error:', err);
    return null;
  }
});

/**
 * Returns the current authenticated administrator's role from the database.
 * Returns null if not authenticated or not an active administrator.
 */
export const getCurrentAdminRole = cache(async (userId?: string): Promise<AdminRole | null> => {
  if (!userId) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      userId = user.id;
    } catch {
      return null;
    }
  }
  const record = await getAdminUserRecord(userId);
  return record?.role || null;
});

/**
 * Server-side helper to verify if a user is an authorized administrator.
 * Strictly queries public.admin_users with role hierarchy support.
 * Fails closed on error.
 */
export const checkIsAdmin = cache(async (userId?: string, _userEmail?: string | null, minRole: AdminRole = 'moderator'): Promise<boolean> => {
  if (!userId) return false;

  const adminRecord = await getAdminUserRecord(userId);
  if (adminRecord && hasRequiredAdminRole(adminRecord.role, minRole)) {
    return true;
  }

  return false;
});

/**
 * Fetch authenticated user and evaluate database administrator status.
 * Never performs implicit auto-upsert or promotion on routine login.
 */
async function fetchAuthenticatedUser(): Promise<{
  user: User | null;
  isAdmin: boolean;
  adminRole: AdminRole | null;
}> {
  // Testing environment override support
  if (process.env.NODE_ENV !== 'production' && process.env.TEST_AUTH_USER_EMAIL !== undefined) {
    if (!process.env.TEST_AUTH_USER_EMAIL || process.env.TEST_AUTH_USER_EMAIL === 'none') {
      return { user: null, isAdmin: false, adminRole: null };
    }
    const email = process.env.TEST_AUTH_USER_EMAIL;
    const id = process.env.TEST_AUTH_USER_ID || '30080df7-5188-4630-b597-b8493ebe045d';
    const roleOverride = (process.env.TEST_AUTH_ADMIN_ROLE as AdminRole) || null;
    const user = { id, email } as User;
    return { user, isAdmin: !!roleOverride, adminRole: roleOverride };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return { user: null, isAdmin: false, adminRole: null };
    }

    // Database is the sole source of truth
    const adminRecord = await getAdminUserRecord(user.id);
    if (adminRecord && adminRecord.role) {
      return { user, isAdmin: true, adminRole: adminRecord.role };
    }

    return { user, isAdmin: false, adminRole: null };
  } catch (err) {
    console.error('[getAuthenticatedUser] Evaluation error:', err);
    return { user: null, isAdmin: false, adminRole: null };
  }
}

/**
 * Server-side helper to get authenticated user and their verified admin status.
 * Uses React request cache to eliminate duplicate auth and database round-trips during a single page render.
 */
export const getAuthenticatedUser = cache(fetchAuthenticatedUser);

/**
 * Require a specific minimum administrator role on Server Components / Server Actions / Route Handlers.
 * Enforces role hierarchy (super_admin > admin > moderator > streamer).
 */
export async function requireAdminRole(minRole: AdminRole): Promise<{ user: User; role: AdminRole }> {
  const { user, isAdmin, adminRole } = (process.env.NODE_ENV !== 'production' && process.env.TEST_AUTH_USER_EMAIL !== undefined)
    ? await fetchAuthenticatedUser()
    : await getAuthenticatedUser();

  if (!user) {
    throw new Error('Authentication required.');
  }

  if (!isAdmin || !adminRole || !hasRequiredAdminRole(adminRole, minRole)) {
    throw new Error(`Unauthorized: Requires at least '${minRole}' administrative privileges.`);
  }

  return { user, role: adminRole };
}

/**
 * Require admin authentication on Server Components / Server Actions / Route Handlers.
 * Defaults to 'admin' role unless a different minimum role is explicitly specified.
 */
export async function requireAdmin(minRole: AdminRole = 'admin'): Promise<{ user: User; role: AdminRole }> {
  return await requireAdminRole(minRole);
}

/**
 * Require financial administrator access (super_admin or finance_admin in public.admin_users).
 */
export async function requireFinancialAdmin(): Promise<{ user: User; role: AdminRole }> {
  const { user, isAdmin, adminRole } = (process.env.NODE_ENV !== 'production' && process.env.TEST_AUTH_USER_EMAIL !== undefined)
    ? await fetchAuthenticatedUser()
    : await getAuthenticatedUser();

  if (!user) {
    throw new Error('Authentication required.');
  }

  if (!isAdmin || !adminRole || (adminRole !== 'super_admin' && adminRole !== 'finance_admin')) {
    throw new Error("Unauthorized: Requires financial administrator privileges.");
  }

  return { user, role: adminRole };
}

/**
 * Require support administrator access (super_admin, admin, or support_admin in public.admin_users).
 */
export async function requireSupportAdmin(): Promise<{ user: User; role: AdminRole }> {
  const { user, isAdmin, adminRole } = (process.env.NODE_ENV !== 'production' && process.env.TEST_AUTH_USER_EMAIL !== undefined)
    ? await fetchAuthenticatedUser()
    : await getAuthenticatedUser();

  if (!user) {
    throw new Error('Authentication required.');
  }

  if (!isAdmin || !adminRole || (adminRole !== 'super_admin' && adminRole !== 'admin' && adminRole !== 'support_admin')) {
    throw new Error("Unauthorized: Requires support administrator privileges.");
  }

  return { user, role: adminRole };
}

/**
 * Require super_admin access (highest privilege level, can manage admin roles).
 */
export async function requireSuperAdmin(): Promise<{ user: User; role: AdminRole }> {
  return await requireAdminRole('super_admin');
}

/**
 * Explicit one-time bootstrap helper for initial system owner setup.
 * ONLY provisions if NO active super_admins exist in the database, or when invoked by an existing super_admin.
 * Never runs implicitly on normal user login.
 */
export async function explicitBootstrapInitialSuperAdmin(userId: string, email: string): Promise<{ success: boolean; message: string }> {
  try {
    const supabase = await createClient();

    // Check count of active super admins in database
    const { count, error: countErr } = await (supabase.from('admin_users') as any)
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin');

    if (countErr) {
      return { success: false, message: `Database error checking super_admin count: ${countErr.message}` };
    }

    if (count && count > 0) {
      // If super_admins already exist, verify caller is an authorized active super_admin
      const { user, isAdmin, adminRole } = await getAuthenticatedUser();
      if (!user || !isAdmin || adminRole !== 'super_admin') {
        return { success: false, message: 'Forbidden: Super administrators already exist. Only an active super_admin can provision roles.' };
      }
    }

    // Execute provisioning
    const { error: upsertErr } = await (supabase.from('admin_users') as any).upsert(
      {
        id: userId,
        email: email.trim().toLowerCase(),
        role: 'super_admin',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      return { success: false, message: `Failed provisioning super_admin: ${upsertErr.message}` };
    }

    return { success: true, message: `Super administrator successfully provisioned for ${email}.` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown bootstrap error';
    return { success: false, message: msg };
  }
}
