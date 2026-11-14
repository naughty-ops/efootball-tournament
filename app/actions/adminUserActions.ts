'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin, requireSuperAdmin, type AdminRole, type AdminUserRecord } from '@/lib/auth/server';
import { revalidatePath } from 'next/cache';

export interface AdminActionResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Super Admin action: List all administrator accounts from public.admin_users
 * Requires minimum 'admin' privileges.
 */
export async function listAdminUsersAction(): Promise<{ success: boolean; data: AdminUserRecord[]; message?: string }> {
  try {
    await requireAdmin('admin');
    const supabase = await createClient();

    const { data, error } = await (supabase.from('admin_users') as any)
      .select('id, email, role, created_at, updated_at')
      .order('created_at', { ascending: true });

    if (error) {
      return { success: false, data: [], message: error.message };
    }

    return { success: true, data: (data || []) as AdminUserRecord[] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to list admin users.';
    return { success: false, data: [], message: msg };
  }
}

/**
 * Super Admin action: Promote, assign, or modify an administrator role.
 * Strictly requires super_admin rank.
 */
export async function assignAdminRoleAction(
  targetUserId: string,
  targetEmail: string,
  newRole: AdminRole
): Promise<AdminActionResult> {
  try {
    const { user: caller } = await requireSuperAdmin();
    const supabase = await createClient();

    // Prevent demoting self if caller is the only active super_admin
    if (caller.id === targetUserId && newRole !== 'super_admin') {
      const { count, error: countErr } = await (supabase.from('admin_users') as any)
        .select('id', { count: 'exact', head: true })
        .eq('role', 'super_admin')
        .neq('is_active', false);

      if (!countErr && (count ?? 0) <= 1) {
        return {
          success: false,
          message: 'Cannot demote the sole active super administrator. Provision another super_admin first.',
        };
      }
    }

    const { error } = await (supabase.from('admin_users') as any).upsert(
      {
        id: targetUserId,
        email: targetEmail.trim().toLowerCase(),
        role: newRole,
        is_active: true,
        revoked_at: null,
        revoked_by: null,
        updated_at: new Date().toISOString(),
        created_by: caller.id,
      },
      { onConflict: 'id' }
    );

    if (error) {
      return { success: false, message: `Failed updating admin role: ${error.message}` };
    }

    revalidatePath('/admin');
    return { success: true, message: `Successfully assigned role '${newRole}' to ${targetEmail}.` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error assigning admin role.';
    return { success: false, message: msg };
  }
}

/**
 * Super Admin action: Revoke administrator privileges.
 * Strictly requires super_admin rank.
 */
export async function revokeAdminRoleAction(targetUserId: string): Promise<AdminActionResult> {
  try {
    const { user: caller } = await requireSuperAdmin();
    const supabase = await createClient();

    // Prevent self-revocation if the last super_admin
    if (caller.id === targetUserId) {
      const { count, error: countErr } = await (supabase.from('admin_users') as any)
        .select('id', { count: 'exact', head: true })
        .eq('role', 'super_admin')
        .neq('is_active', false);

      if (!countErr && (count ?? 0) <= 1) {
        return {
          success: false,
          message: 'Cannot revoke the sole active super administrator account.',
        };
      }
    }

    // Support soft-revocation if is_active column exists, or row deletion
    const { error } = await (supabase.from('admin_users') as any)
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        revoked_by: caller.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetUserId);

    if (error) {
      // Fallback: delete row if column is not yet present
      const { error: delErr } = await (supabase.from('admin_users') as any)
        .delete()
        .eq('id', targetUserId);

      if (delErr) {
        return { success: false, message: `Failed revoking admin record: ${delErr.message}` };
      }
    }

    revalidatePath('/admin');
    return { success: true, message: 'Administrator privileges successfully revoked.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error revoking admin role.';
    return { success: false, message: msg };
  }
}
