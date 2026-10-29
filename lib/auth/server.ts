import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * The ONLY designated administrator email address for the eFootball Tournament Platform.
 */
export const PRIMARY_ADMIN_EMAIL = 'ye.agrajj@gmail.com';

/**
 * Pure helper to verify if an email address strictly matches the administrator allowlist.
 * Performs safe case-insensitive and whitespace-trimmed comparison.
 */
export function isAllowlistedAdminEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  return email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
}

/**
 * Ensures the designated administrator is provisioned in public.admin_users
 */
export async function syncAdminUserRecord(userId: string, email: string): Promise<void> {
  if (!isAllowlistedAdminEmail(email)) return;

  try {
    const supabase = await createClient();
    await (supabase.from('admin_users') as any).upsert(
      {
        id: userId,
        email: email.trim().toLowerCase(),
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    // Non-fatal if RLS restricts insert via anon client; migration provisions it in database
    console.warn('syncAdminUserRecord warning:', err);
  }
}

/**
 * Server-side helper to verify if a user is an authorized administrator.
 * Validates:
 * 1. Verified email strictly matches PRIMARY_ADMIN_EMAIL
 * 2. Attempts DB provisioning sync if needed
 */
export async function checkIsAdmin(userId?: string, userEmail?: string | null): Promise<boolean> {
  if (!userId) return false;

  // 1. Strict allowlist check: Reject immediately if not ye.agrajj@gmail.com
  if (userEmail && !isAllowlistedAdminEmail(userEmail)) {
    return false;
  }

  try {
    const supabase = await createClient();
    let emailToVerify = userEmail;

    // If email is not passed, fetch verified user from Supabase Auth directly
    if (!emailToVerify) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user || user.id !== userId) {
        return false;
      }
      emailToVerify = user.email;
    }

    if (!isAllowlistedAdminEmail(emailToVerify)) {
      return false;
    }

    // 2. Verified admin confirmed: ensure public.admin_users has row
    await syncAdminUserRecord(userId, emailToVerify!);
    return true;
  } catch (err) {
    console.error('Server checkIsAdmin failed:', err);
    // If verified email strictly matches allowlist, trust Supabase Auth verified email
    return isAllowlistedAdminEmail(userEmail);
  }
}

/**
 * Server-side helper to get authenticated user and their verified admin status
 */
export async function getAuthenticatedUser(): Promise<{
  user: User | null;
  isAdmin: boolean;
}> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return { user: null, isAdmin: false };
    }

    // Fast-fail if email is not the allowlisted admin
    if (!isAllowlistedAdminEmail(user.email)) {
      return { user, isAdmin: false };
    }

    const isAdmin = await checkIsAdmin(user.id, user.email);
    return { user, isAdmin };
  } catch (err) {
    console.error('getAuthenticatedUser failed:', err);
    return { user: null, isAdmin: false };
  }
}

/**
 * Require admin authentication on Server Components / Server Actions / Route Handlers
 * Throws or returns an unauthorized status if not verified.
 */
export async function requireAdmin(): Promise<{ user: User }> {
  const { user, isAdmin } = await getAuthenticatedUser();
  if (!user || !isAdmin || !isAllowlistedAdminEmail(user.email)) {
    throw new Error('Unauthorized: Designated administrator access required.');
  }
  return { user };
}
