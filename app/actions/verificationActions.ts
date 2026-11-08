'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/server';
import { isValidEfootballId, normalizeEfootballId } from '@/lib/validations/efootball';
import type { Profile } from '@/types/database';

export type ActionResponse<T = any> = {
  success: boolean;
  message: string;
  data?: T;
};

export interface AdminVerificationItem {
  id: string;
  displayName: string;
  email?: string;
  efootballId: string;
  efootballVerificationStatus: 'pending' | 'verified' | 'rejected';
  efootballIdVerified: boolean;
  efootballRejectionReason: string | null;
  whatsappNumber: string;
  whatsappVerificationStatus: 'not_submitted' | 'pending' | 'verified' | 'rejected';
  whatsappVerified: boolean;
  whatsappRejectionReason: string | null;
  whatsappRequestedAt: string | null;
  whatsappVerifiedAt: string | null;
  whatsappVerifiedBy: string | null;
  accountStatus: 'active' | 'suspended' | 'disabled';
  suspensionReason: string | null;
  suspendedAt: string | null;
  adminNotes: string | null;
  verificationRevokedAt: string | null;
  verificationRevocationReason: string | null;
  createdAt: string;
}

export interface VerificationDashboardStats {
  totalMembers: number;
  verifiedMembers: number;
  pendingVerification: number;
  rejectedVerification: number;
  suspendedMembers: number;
}

export interface MemberTournamentHistory {
  id: string;
  tournamentId: string;
  tournamentName: string;
  status: string;
  createdAt: string;
  confirmedAt: string | null;
}

export interface MemberAuditHistoryItem {
  id: string;
  action: string;
  reason: string | null;
  details: Record<string, any> | null;
  createdAt: string;
}

export interface MemberDetailedVerificationView {
  profile: AdminVerificationItem;
  tournaments: MemberTournamentHistory[];
  auditHistory: MemberAuditHistoryItem[];
}

/**
 * Immutable recorder for administrative operations in public.admin_audit_logs
 */
async function recordAdminAuditLog(
  supabase: any,
  adminId: string,
  targetUserId: string,
  action: string,
  options: {
    entityType?: string;
    details?: Record<string, any>;
    previousValues?: Record<string, any>;
    newValues?: Record<string, any>;
    reason?: string | null;
  } = {}
) {
  try {
    await (supabase.from('admin_audit_logs') as any).insert({
      admin_id: adminId,
      target_user_id: targetUserId,
      action,
      entity_type: options.entityType || 'profile',
      details: options.details || null,
      previous_values: options.previousValues || null,
      new_values: options.newValues || null,
      reason: options.reason || null,
      status: 'success',
    });
  } catch (err) {
    console.warn('Failed to record admin audit log (non-fatal):', err);
  }
}

/**
 * Checks whether an eFootball ID matches required format and is not already claimed
 */
export async function checkEfootballIdAvailabilityAction(
  rawId: string
): Promise<{ available: boolean; normalizedId: string; message?: string }> {
  const normalizedId = normalizeEfootballId(rawId);

  if (!isValidEfootballId(normalizedId)) {
    return {
      available: false,
      normalizedId,
      message: 'eFootball ID must match format ABCD-123-456-789 (4 uppercase letters, then 9 digits in groups of 3).',
    };
  }

  try {
    const supabase = await createClient();

    const { data: existingUser, error } = await (supabase.from('profiles') as any)
      .select('id')
      .eq('efootball_id', normalizedId)
      .maybeSingle();

    if (error) {
      return { available: true, normalizedId };
    }

    if (existingUser) {
      return {
        available: false,
        normalizedId,
        message: 'This eFootball ID is already registered to another player account.',
      };
    }

    return { available: true, normalizedId };
  } catch (err) {
    console.warn('checkEfootballIdAvailabilityAction warning:', err);
    return { available: true, normalizedId };
  }
}

/**
 * User initiates a WhatsApp verification request for their registered WhatsApp number.
 * Embeds a verification request reference tracking code.
 */
export async function requestWhatsAppVerificationAction(
  requestReference?: string
): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return {
        success: false,
        message: 'You must be signed in to request WhatsApp verification.',
      };
    }

    let whatsappNumber = user.user_metadata?.whatsapp_number || '';
    let currentStatus = user.user_metadata?.whatsapp_verification_status || 'not_submitted';
    let isVerified = user.user_metadata?.whatsapp_verified === true;

    try {
      const { data: profile } = await (supabase.from('profiles') as any)
        .select('whatsapp_number, whatsapp_verification_status, whatsapp_verified, account_status')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        if (profile.account_status === 'suspended' || profile.account_status === 'disabled') {
          return {
            success: false,
            message: 'Your account is currently suspended. Verification requests cannot be processed.',
          };
        }
        if (profile.whatsapp_number) whatsappNumber = profile.whatsapp_number;
        if (profile.whatsapp_verification_status) currentStatus = profile.whatsapp_verification_status;
        if (profile.whatsapp_verified !== undefined) isVerified = profile.whatsapp_verified === true;
      }
    } catch {
      // Fallback
    }

    if (!whatsappNumber || whatsappNumber.trim() === '') {
      return {
        success: false,
        message: 'No registered WhatsApp number found on your account. Please update your profile first.',
      };
    }

    if (isVerified || currentStatus === 'verified') {
      return {
        success: false,
        message: 'Your registered WhatsApp number is already officially verified.',
      };
    }

    const nowIso = new Date().toISOString();
    const refNote = requestReference ? `Requested via ${requestReference}` : null;

    // Persist verification request to Supabase Auth metadata
    await supabase.auth.updateUser({
      data: {
        whatsapp_verification_status: 'pending',
        whatsapp_verification_requested_at: nowIso,
      },
    });

    // Persist verification request to public.profiles table
    await (supabase.from('profiles') as any)
      .update({
        whatsapp_verification_status: 'pending',
        whatsapp_verification_requested_at: nowIso,
        whatsapp_rejection_reason: null, // Clear prior rejection reason on new request
        updated_at: nowIso,
      })
      .eq('id', user.id);

    revalidatePath('/dashboard/profile');
    revalidatePath('/dashboard');
    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/participants');

    return {
      success: true,
      message: 'WhatsApp verification request submitted! An administrator will review and verify your number.',
    };
  } catch (err: any) {
    console.error('Error in requestWhatsAppVerificationAction:', err);
    return {
      success: false,
      message: err.message || 'An unexpected error occurred while requesting verification.',
    };
  }
}

/**
 * Live Dashboard Statistics Query: Fetches authoritative counts directly from public.profiles
 */
export async function getVerificationDashboardStatsAction(): Promise<ActionResponse<VerificationDashboardStats>> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    // Trigger self-healing profile sync for any orphaned auth.users
    try {
      await supabase.rpc('sync_missing_profiles');
    } catch {
      // Non-fatal fallback
    }

    const [allRes, verifiedRes, pendingRes, rejectedRes, suspendedRes] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('whatsapp_verified', true),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .or('whatsapp_verified.eq.false,efootball_id_verified.eq.false,whatsapp_verification_status.in.(pending,not_submitted),efootball_verification_status.eq.pending')
        .neq('whatsapp_verification_status', 'rejected')
        .neq('efootball_verification_status', 'rejected')
        .not('account_status', 'in', '("suspended","disabled")'),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .or('whatsapp_verification_status.eq.rejected,efootball_verification_status.eq.rejected'),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .in('account_status', ['suspended', 'disabled']),
    ]);

    const stats: VerificationDashboardStats = {
      totalMembers: allRes.count ?? 0,
      verifiedMembers: verifiedRes.count ?? 0,
      pendingVerification: pendingRes.count ?? 0,
      rejectedVerification: rejectedRes.count ?? 0,
      suspendedMembers: suspendedRes.count ?? 0,
    };

    return { success: true, message: 'Stats loaded', data: stats };
  } catch (err: any) {
    console.error('Error in getVerificationDashboardStatsAction:', err);
    return {
      success: false,
      message: err.message || 'Unauthorized',
      data: {
        totalMembers: 0,
        verifiedMembers: 0,
        pendingVerification: 0,
        rejectedVerification: 0,
        suspendedMembers: 0,
      },
    };
  }
}

/**
 * Fetches member verification requests with tab filtering, search, sorting, and pagination
 */
export async function getAdminVerificationQueueAction(options: {
  tab?: 'all' | 'pending' | 'verified' | 'rejected' | 'suspended';
  filter?: 'all' | 'pending' | 'verified' | 'rejected' | 'suspended';
  search?: string;
  sortBy?: 'created_at_desc' | 'created_at_asc' | 'name_asc' | 'name_desc';
  page?: number;
  pageSize?: number;
} = {}): Promise<ActionResponse<{
  items: AdminVerificationItem[];
  total: number;
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}>> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    // Trigger self-healing profile sync for any orphaned auth.users
    try {
      await supabase.rpc('sync_missing_profiles');
    } catch {
      // Non-fatal fallback
    }

    const filter = options.tab || options.filter || 'all';
    const search = options.search?.trim() || '';
    const sortBy = options.sortBy || 'created_at_desc';
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(5, options.pageSize || 20));

    let query = (supabase.from('profiles') as any).select('*', { count: 'exact' });

    // 1. Tab Filters
    if (filter === 'pending') {
      query = query
        .or('whatsapp_verified.eq.false,efootball_id_verified.eq.false,whatsapp_verification_status.in.(pending,not_submitted),efootball_verification_status.eq.pending')
        .neq('whatsapp_verification_status', 'rejected')
        .neq('efootball_verification_status', 'rejected')
        .not('account_status', 'in', '("suspended","disabled")');
    } else if (filter === 'verified') {
      query = query.eq('whatsapp_verified', true);
    } else if (filter === 'rejected') {
      query = query.or('whatsapp_verification_status.eq.rejected,efootball_verification_status.eq.rejected');
    } else if (filter === 'suspended') {
      query = query.or('account_status.eq.suspended,account_status.eq.disabled');
    }

    // 2. Search Query across Name, Email, eFootball ID, WhatsApp number
    if (search) {
      query = query.or(
        `display_name.ilike.%${search}%,email.ilike.%${search}%,efootball_id.ilike.%${search}%,whatsapp_number.ilike.%${search}%`
      );
    }

    // 3. Sorting
    if (sortBy === 'created_at_asc') {
      query = query.order('created_at', { ascending: true });
    } else if (sortBy === 'name_asc') {
      query = query.order('display_name', { ascending: true });
    } else if (sortBy === 'name_desc') {
      query = query.order('display_name', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    // 4. Pagination Range
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('Error querying profiles for verification queue:', error);
      return {
        success: false,
        message: error.message || 'Failed to query profiles',
        data: { items: [], total: 0, totalCount: 0, page: 1, pageSize, totalPages: 1 },
      };
    }

    const items: AdminVerificationItem[] = (data || []).map((p: any) => ({
      id: p.id,
      displayName: p.display_name || 'Competitor',
      email: p.email || undefined,
      efootballId: p.efootball_id || 'Not Set',
      efootballVerificationStatus: p.efootball_verification_status || 'pending',
      efootballIdVerified: p.efootball_id_verified === true,
      efootballRejectionReason: p.efootball_rejection_reason || null,
      whatsappNumber: p.whatsapp_number || 'Not Set',
      whatsappVerificationStatus: p.whatsapp_verification_status || 'not_submitted',
      whatsappVerified: p.whatsapp_verified === true,
      whatsappRejectionReason: p.whatsapp_rejection_reason || null,
      whatsappRequestedAt: p.whatsapp_verification_requested_at || null,
      whatsappVerifiedAt: p.whatsapp_verified_at || null,
      whatsappVerifiedBy: p.whatsapp_verified_by || null,
      accountStatus: p.account_status || 'active',
      suspensionReason: p.suspension_reason || null,
      suspendedAt: p.suspended_at || null,
      adminNotes: p.admin_notes || null,
      verificationRevokedAt: p.verification_revoked_at || null,
      verificationRevocationReason: p.verification_revocation_reason || null,
      createdAt: p.created_at,
    }));

    const totalCount = count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return {
      success: true,
      message: 'Queue loaded',
      data: { items, total: totalCount, totalCount, page, pageSize, totalPages },
    };
  } catch (err: any) {
    console.error('Error in getAdminVerificationQueueAction:', err);
    return {
      success: false,
      message: err.message || 'Unauthorized',
      data: { items: [], total: 0, totalCount: 0, page: 1, pageSize: 20, totalPages: 1 },
    };
  }
}

/**
 * Fetches comprehensive verification details, registered tournaments, and audit history for a member
 */
export async function getMemberVerificationDetailsAction(
  targetUserId: string
): Promise<ActionResponse<MemberDetailedVerificationView>> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    // 1. Fetch profile
    const { data: profile, error: pErr } = await (supabase.from('profiles') as any)
      .select('*')
      .eq('id', targetUserId)
      .single();

    if (pErr || !profile) {
      return { success: false, message: 'Member profile not found.' };
    }

    // 2. Fetch tournament registrations
    const { data: regData } = await supabase
      .from('tournament_registrations')
      .select('id, tournament_id, status, created_at, confirmed_at, tournaments(name)')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false });

    const tournaments: MemberTournamentHistory[] = (regData || []).map((r: any) => ({
      id: r.id,
      tournamentId: r.tournament_id,
      tournamentName: r.tournaments?.name || 'Tournament',
      status: r.status,
      createdAt: r.created_at,
      confirmedAt: r.confirmed_at,
    }));

    // 3. Fetch audit logs targeting this user
    const { data: auditData } = await (supabase.from('admin_audit_logs') as any)
      .select('id, action, reason, details, created_at')
      .eq('target_user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(20);

    const auditHistory: MemberAuditHistoryItem[] = (auditData || []).map((a: any) => ({
      id: a.id,
      action: a.action,
      reason: a.reason,
      details: a.details,
      createdAt: a.created_at,
    }));

    const verificationItem: AdminVerificationItem = {
      id: profile.id,
      displayName: profile.display_name || 'Competitor',
      email: profile.email || undefined,
      efootballId: profile.efootball_id || 'Not Set',
      efootballVerificationStatus: profile.efootball_verification_status || 'pending',
      efootballIdVerified: profile.efootball_id_verified === true,
      efootballRejectionReason: profile.efootball_rejection_reason || null,
      whatsappNumber: profile.whatsapp_number || 'Not Set',
      whatsappVerificationStatus: profile.whatsapp_verification_status || 'not_submitted',
      whatsappVerified: profile.whatsapp_verified === true,
      whatsappRejectionReason: profile.whatsapp_rejection_reason || null,
      whatsappRequestedAt: profile.whatsapp_verification_requested_at || null,
      whatsappVerifiedAt: profile.whatsapp_verified_at || null,
      whatsappVerifiedBy: profile.whatsapp_verified_by || null,
      accountStatus: profile.account_status || 'active',
      suspensionReason: profile.suspension_reason || null,
      suspendedAt: profile.suspended_at || null,
      adminNotes: profile.admin_notes || null,
      verificationRevokedAt: profile.verification_revoked_at || null,
      verificationRevocationReason: profile.verification_revocation_reason || null,
      createdAt: profile.created_at,
    };

    return {
      success: true,
      message: 'Details loaded',
      data: {
        profile: verificationItem,
        tournaments,
        auditHistory,
      },
    };
  } catch (err: any) {
    console.error('Error in getMemberVerificationDetailsAction:', err);
    return { success: false, message: err.message || 'Unauthorized' };
  }
}

/**
 * Administrator approves or rejects a user's WhatsApp number verification
 */
export async function adminVerifyWhatsAppAction(
  targetUserId: string,
  decision: 'verified' | 'rejected',
  rejectionReason?: string
): Promise<ActionResponse> {
  try {
    const { user: adminUser } = await requireAdmin();
    const supabase = await createClient();

    if (decision === 'rejected' && (!rejectionReason || rejectionReason.trim() === '')) {
      return { success: false, message: 'A rejection reason is strictly required.' };
    }

    const { data: previousProfile } = await (supabase.from('profiles') as any)
      .select('whatsapp_number, whatsapp_verification_status, whatsapp_verified')
      .eq('id', targetUserId)
      .single();

    const isApprove = decision === 'verified';
    const nowIso = new Date().toISOString();

    const updatePayload: Record<string, any> = {
      whatsapp_verification_status: decision,
      whatsapp_verified: isApprove,
      whatsapp_verified_at: isApprove ? nowIso : null,
      whatsapp_verified_by: adminUser.id,
      whatsapp_rejection_reason: isApprove ? null : (rejectionReason?.trim() || 'WhatsApp number could not be verified.'),
      updated_at: nowIso,
    };

    const { error } = await (supabase.from('profiles') as any)
      .update(updatePayload)
      .eq('id', targetUserId);

    if (error) {
      return { success: false, message: error.message || 'Failed to update verification status.' };
    }

    // Record immutable admin audit log
    await recordAdminAuditLog(
      supabase,
      adminUser.id,
      targetUserId,
      isApprove ? 'WHATSAPP_VERIFICATION_APPROVED' : 'WHATSAPP_VERIFICATION_REJECTED',
      {
        reason: isApprove ? null : rejectionReason,
        previousValues: previousProfile,
        newValues: updatePayload,
        details: { adminEmail: adminUser.email, decision },
      }
    );

    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/participants');
    revalidatePath('/dashboard/profile');

    return {
      success: true,
      message: isApprove
        ? 'WhatsApp number verified successfully.'
        : 'WhatsApp verification rejected.',
    };
  } catch (err: any) {
    console.error('Error in adminVerifyWhatsAppAction:', err);
    return {
      success: false,
      message: err.message || 'Unauthorized or failed to process verification.',
    };
  }
}

/**
 * Administrator directly verifies a player's WhatsApp number by searching phone number or email.
 */
export async function adminVerifyWhatsAppByNumberAction(
  identifier: string,
  decision: 'verified' | 'rejected' = 'verified',
  rejectionReason?: string
): Promise<ActionResponse<{ profile: any }>> {
  try {
    const { user: adminUser } = await requireAdmin();
    const supabase = await createClient();

    const clean = identifier.trim();
    if (!clean) {
      return { success: false, message: 'Please enter a WhatsApp number or email to verify.' };
    }

    const cleanPhone = clean.replace(/[\s-]/g, '');

    const { data: matchedProfiles, error: pErr } = await (supabase.from('profiles') as any)
      .select('*')
      .or(`whatsapp_number.ilike.%${cleanPhone}%,email.ilike.%${clean}%`)
      .limit(5);

    if (pErr || !matchedProfiles || matchedProfiles.length === 0) {
      return {
        success: false,
        message: `No player profile found matching "${identifier}". Please verify the number or email.`,
      };
    }

    const targetProfile = matchedProfiles[0];
    const isApprove = decision === 'verified';
    const nowIso = new Date().toISOString();

    const updatePayload = {
      whatsapp_verification_status: decision,
      whatsapp_verified: isApprove,
      whatsapp_verified_at: isApprove ? nowIso : null,
      whatsapp_verified_by: adminUser.id,
      whatsapp_rejection_reason: isApprove ? null : (rejectionReason?.trim() || 'WhatsApp number could not be verified.'),
      updated_at: nowIso,
    };

    const { error: updateErr } = await (supabase.from('profiles') as any)
      .update(updatePayload)
      .eq('id', targetProfile.id);

    if (updateErr) {
      return { success: false, message: updateErr.message || 'Failed to update verification status.' };
    }

    await recordAdminAuditLog(
      supabase,
      adminUser.id,
      targetProfile.id,
      isApprove ? 'WHATSAPP_VERIFICATION_APPROVED_BY_LOOKUP' : 'WHATSAPP_VERIFICATION_REJECTED_BY_LOOKUP',
      {
        reason: isApprove ? null : rejectionReason,
        previousValues: targetProfile,
        newValues: updatePayload,
        details: { lookupInput: clean, adminEmail: adminUser.email },
      }
    );

    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/participants');
    revalidatePath('/dashboard/profile');

    return {
      success: true,
      message: `WhatsApp number ${targetProfile.whatsapp_number} for player "${targetProfile.display_name}" is now ${decision}!`,
      data: { profile: { ...targetProfile, ...updatePayload } },
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Unauthorized or failed to verify WhatsApp number.' };
  }
}

/**
 * Administrator approves or rejects a user's eFootball ID verification
 */
export async function adminVerifyEfootballIdAction(
  targetUserId: string,
  decision: 'verified' | 'rejected',
  rejectionReason?: string
): Promise<ActionResponse> {
  try {
    const { user: adminUser } = await requireAdmin();
    const supabase = await createClient();

    if (decision === 'rejected' && (!rejectionReason || rejectionReason.trim() === '')) {
      return { success: false, message: 'A rejection reason is strictly required.' };
    }

    const { data: previousProfile } = await (supabase.from('profiles') as any)
      .select('efootball_id, efootball_verification_status, efootball_id_verified')
      .eq('id', targetUserId)
      .single();

    const isApprove = decision === 'verified';
    const nowIso = new Date().toISOString();

    const updatePayload: Record<string, any> = {
      efootball_verification_status: decision,
      efootball_id_verified: isApprove,
      efootball_verified_at: isApprove ? nowIso : null,
      efootball_verified_by: adminUser.id,
      efootball_rejection_reason: isApprove ? null : (rejectionReason?.trim() || 'eFootball ID did not match in-game records.'),
      updated_at: nowIso,
    };

    const { error } = await (supabase.from('profiles') as any)
      .update(updatePayload)
      .eq('id', targetUserId);

    if (error) {
      return { success: false, message: error.message || 'Failed to update eFootball verification status.' };
    }

    await recordAdminAuditLog(
      supabase,
      adminUser.id,
      targetUserId,
      isApprove ? 'EFOOTBALL_ID_VERIFIED' : 'EFOOTBALL_ID_REJECTED',
      {
        reason: isApprove ? null : rejectionReason,
        previousValues: previousProfile,
        newValues: updatePayload,
        details: { adminEmail: adminUser.email, decision },
      }
    );

    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/participants');
    revalidatePath('/dashboard/profile');

    return {
      success: true,
      message: isApprove
        ? 'eFootball ID verified successfully.'
        : 'eFootball ID verification rejected.',
    };
  } catch (err: any) {
    console.error('Error in adminVerifyEfootballIdAction:', err);
    return {
      success: false,
      message: err.message || 'Unauthorized or failed to process verification.',
    };
  }
}

/**
 * Approve both WhatsApp and eFootball ID in a single action
 */
export async function adminVerifyBothAction(
  targetUserId: string
): Promise<ActionResponse> {
  try {
    const { user: adminUser } = await requireAdmin();
    const supabase = await createClient();

    const { data: currentProfile, error: fetchErr } = await (supabase.from('profiles') as any)
      .select('id, display_name, whatsapp_number, efootball_id, whatsapp_verified, efootball_id_verified')
      .eq('id', targetUserId)
      .maybeSingle();

    if (fetchErr || !currentProfile) {
      return { success: false, message: 'Member profile not found.' };
    }

    const now = new Date().toISOString();
    const updatePayload = {
      whatsapp_verified: true,
      whatsapp_verification_status: 'verified',
      whatsapp_verified_at: now,
      whatsapp_verified_by: adminUser.id,
      whatsapp_rejection_reason: null,
      efootball_id_verified: true,
      efootball_verification_status: 'verified',
      efootball_rejection_reason: null,
      updated_at: now,
    };

    const { error: updateErr } = await (supabase.from('profiles') as any)
      .update(updatePayload)
      .eq('id', targetUserId);

    if (updateErr) {
      console.error('Error updating member verification in adminVerifyBothAction:', updateErr);
      return { success: false, message: updateErr.message || 'Failed to update member status.' };
    }

    // Record immutable audit log
    await recordAdminAuditLog(supabase, adminUser.id, targetUserId, 'member.both_verified', {
      entityType: 'profile',
      details: {
        whatsappNumber: currentProfile.whatsapp_number,
        efootballId: currentProfile.efootball_id,
        action: 'verify_both',
      },
      previousValues: {
        whatsapp_verified: currentProfile.whatsapp_verified,
        efootball_id_verified: currentProfile.efootball_id_verified,
      },
      newValues: {
        whatsapp_verified: true,
        efootball_id_verified: true,
      },
      reason: 'Administrator bulk verified both WhatsApp and eFootball ID.',
    });

    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/participants');
    revalidatePath('/dashboard/profile');

    return {
      success: true,
      message: `Successfully verified both WhatsApp and eFootball ID for ${currentProfile.display_name}.`,
    };
  } catch (err: any) {
    console.error('Error in adminVerifyBothAction:', err);
    return {
      success: false,
      message: err.message || 'Unauthorized or failed to complete dual verification.',
    };
  }
}

/**
 * Revoke an existing approved verification (WhatsApp, eFootball, or Both).
 * Requires mandatory reason and logs immutable audit trail.
 */
export async function adminRevokeVerificationAction(
  targetUserId: string,
  target: 'whatsapp' | 'efootball' | 'both',
  reason: string
): Promise<ActionResponse> {
  try {
    const { user: adminUser } = await requireAdmin();
    const supabase = await createClient();

    const cleanReason = reason.trim();
    if (!cleanReason) {
      return { success: false, message: 'A revocation reason is strictly required.' };
    }

    const { data: previousProfile, error: pErr } = await (supabase.from('profiles') as any)
      .select('*')
      .eq('id', targetUserId)
      .single();

    if (pErr || !previousProfile) {
      return { success: false, message: 'Target player profile not found.' };
    }

    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      verification_revoked_at: nowIso,
      verification_revoked_by: adminUser.id,
      verification_revocation_reason: cleanReason,
      updated_at: nowIso,
    };

    if (target === 'whatsapp' || target === 'both') {
      updatePayload.whatsapp_verified = false;
      updatePayload.whatsapp_verification_status = 'not_submitted';
      updatePayload.whatsapp_rejection_reason = `Verification revoked: ${cleanReason}`;
    }

    if (target === 'efootball' || target === 'both') {
      updatePayload.efootball_id_verified = false;
      updatePayload.efootball_verification_status = 'pending';
      updatePayload.efootball_rejection_reason = `Verification revoked: ${cleanReason}`;
    }

    const { error: updateErr } = await (supabase.from('profiles') as any)
      .update(updatePayload)
      .eq('id', targetUserId);

    if (updateErr) {
      return { success: false, message: updateErr.message || 'Failed to revoke verification.' };
    }

    await recordAdminAuditLog(
      supabase,
      adminUser.id,
      targetUserId,
      'VERIFICATION_REVOKED',
      {
        reason: cleanReason,
        previousValues: previousProfile,
        newValues: updatePayload,
        details: { target, adminEmail: adminUser.email },
      }
    );

    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/participants');
    revalidatePath('/dashboard/profile');

    return {
      success: true,
      message: `Verification successfully revoked for ${previousProfile.display_name}.`,
    };
  } catch (err: any) {
    console.error('Error in adminRevokeVerificationAction:', err);
    return { success: false, message: err.message || 'Failed to revoke verification.' };
  }
}

/**
 * Suspend a member account and suspend verification eligibility.
 * Requires mandatory reason and logs immutable audit trail.
 */
export async function adminSuspendMemberAction(
  targetUserId: string,
  reason: string
): Promise<ActionResponse> {
  try {
    const { user: adminUser } = await requireAdmin();
    const supabase = await createClient();

    const cleanReason = reason.trim();
    if (!cleanReason) {
      return { success: false, message: 'A suspension reason is strictly required.' };
    }

    const { data: previousProfile, error: pErr } = await (supabase.from('profiles') as any)
      .select('*')
      .eq('id', targetUserId)
      .single();

    if (pErr || !previousProfile) {
      return { success: false, message: 'Target member profile not found.' };
    }

    const nowIso = new Date().toISOString();
    const updatePayload = {
      account_status: 'suspended',
      suspension_reason: cleanReason,
      suspended_at: nowIso,
      suspended_by: adminUser.id,
      updated_at: nowIso,
    };

    const { error: updateErr } = await (supabase.from('profiles') as any)
      .update(updatePayload)
      .eq('id', targetUserId);

    if (updateErr) {
      return { success: false, message: updateErr.message || 'Failed to suspend member.' };
    }

    await recordAdminAuditLog(
      supabase,
      adminUser.id,
      targetUserId,
      'MEMBER_SUSPENDED',
      {
        reason: cleanReason,
        previousValues: previousProfile,
        newValues: updatePayload,
        details: { adminEmail: adminUser.email },
      }
    );

    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/participants');
    revalidatePath('/dashboard/profile');

    return {
      success: true,
      message: `Member ${previousProfile.display_name} has been suspended.`,
    };
  } catch (err: any) {
    console.error('Error in adminSuspendMemberAction:', err);
    return { success: false, message: err.message || 'Failed to suspend member.' };
  }
}

/**
 * Unsuspend a previously suspended member account.
 */
export async function adminUnsuspendMemberAction(
  targetUserId: string,
  adminNotes?: string
): Promise<ActionResponse> {
  try {
    const { user: adminUser } = await requireAdmin();
    const supabase = await createClient();

    const { data: previousProfile, error: pErr } = await (supabase.from('profiles') as any)
      .select('*')
      .eq('id', targetUserId)
      .single();

    if (pErr || !previousProfile) {
      return { success: false, message: 'Target member profile not found.' };
    }

    const nowIso = new Date().toISOString();
    const updatePayload = {
      account_status: 'active',
      suspension_reason: null,
      suspended_at: null,
      suspended_by: null,
      admin_notes: adminNotes ? adminNotes.trim() : previousProfile.admin_notes,
      updated_at: nowIso,
    };

    const { error: updateErr } = await (supabase.from('profiles') as any)
      .update(updatePayload)
      .eq('id', targetUserId);

    if (updateErr) {
      return { success: false, message: updateErr.message || 'Failed to unsuspend member.' };
    }

    await recordAdminAuditLog(
      supabase,
      adminUser.id,
      targetUserId,
      'MEMBER_UNSUSPENDED',
      {
        reason: 'Administrator lifted suspension',
        previousValues: previousProfile,
        newValues: updatePayload,
        details: { adminNotes, adminEmail: adminUser.email },
      }
    );

    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/participants');
    revalidatePath('/dashboard/profile');

    return {
      success: true,
      message: `Member ${previousProfile.display_name} has been restored to active status.`,
    };
  } catch (err: any) {
    console.error('Error in adminUnsuspendMemberAction:', err);
    return { success: false, message: err.message || 'Failed to unsuspend member.' };
  }
}

/**
 * Update internal admin notes for a member
 */
export async function adminUpdateMemberNotesAction(
  targetUserId: string,
  notes: string
): Promise<ActionResponse> {
  try {
    const { user: adminUser } = await requireAdmin();
    const supabase = await createClient();

    const nowIso = new Date().toISOString();
    const { error } = await (supabase.from('profiles') as any)
      .update({
        admin_notes: notes.trim(),
        updated_at: nowIso,
      })
      .eq('id', targetUserId);

    if (error) {
      return { success: false, message: error.message || 'Failed to update notes.' };
    }

    await recordAdminAuditLog(
      supabase,
      adminUser.id,
      targetUserId,
      'ADMIN_NOTES_UPDATED',
      {
        details: { notesLength: notes.trim().length, adminEmail: adminUser.email },
      }
    );

    return { success: true, message: 'Admin notes saved successfully.' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to update notes.' };
  }
}
