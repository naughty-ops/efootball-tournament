'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/server';
import { isValidEfootballId, normalizeEfootballId } from '@/lib/validations';
import type { Profile } from '@/types/database';

export type ActionResponse<T = any> = {
  success: boolean;
  message: string;
  data?: T;
};

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

    // Query profiles table for existing claim
    const { data: existingUser, error } = await (supabase.from('profiles') as any)
      .select('id')
      .eq('efootball_id', normalizedId)
      .maybeSingle();

    if (error) {
      // If query fails due to RLS or missing table, allow client to proceed with format valid
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
 * User initiates a WhatsApp verification request for their registered WhatsApp number
 * The request is recorded with 'pending' status for admin review.
 * Does NOT mark the number as verified.
 */
export async function requestWhatsAppVerificationAction(): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return {
        success: false,
        message: 'You must be signed in to request WhatsApp verification.',
      };
    }

    // 1. Resolve current contact and verification status from profiles table, with auth user metadata fallback
    let whatsappNumber = user.user_metadata?.whatsapp_number || '';
    let currentStatus = user.user_metadata?.whatsapp_verification_status || 'not_submitted';
    let isVerified = user.user_metadata?.whatsapp_verified === true;

    try {
      const { data: profile } = await (supabase.from('profiles') as any)
        .select('whatsapp_number, whatsapp_verification_status, whatsapp_verified')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        if (profile.whatsapp_number) whatsappNumber = profile.whatsapp_number;
        if (profile.whatsapp_verification_status) currentStatus = profile.whatsapp_verification_status;
        if (profile.whatsapp_verified !== undefined) isVerified = profile.whatsapp_verified === true;
      }
    } catch {
      // Profiles table may not be created yet; fallback metadata is used
    }

    if (!whatsappNumber || whatsappNumber.trim() === '') {
      return {
        success: false,
        message: 'No registered WhatsApp number found on your account.',
      };
    }

    if (isVerified || currentStatus === 'verified') {
      return {
        success: false,
        message: 'Your registered WhatsApp number is already officially verified.',
      };
    }

    if (currentStatus === 'pending') {
      return {
        success: false,
        message: 'Your verification request is already pending administrator review.',
      };
    }

    const nowIso = new Date().toISOString();

    // 2. Persist verification request to Supabase Auth metadata (guaranteed persistence)
    const { error: metaErr } = await supabase.auth.updateUser({
      data: {
        whatsapp_verification_status: 'pending',
        whatsapp_verification_requested_at: nowIso,
      },
    });

    if (metaErr) {
      console.warn('Auth user metadata update warning:', metaErr.message);
    }

    // 3. Persist verification request to profiles table if table exists
    try {
      await (supabase.from('profiles') as any)
        .update({
          whatsapp_verification_status: 'pending',
          whatsapp_verification_requested_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', user.id);
    } catch {
      // Non-fatal if schema migration is pending
    }

    revalidatePath('/dashboard/profile');
    revalidatePath('/dashboard');
    revalidatePath('/admin/dashboard');

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
 * Administrator approves or rejects a user's WhatsApp number verification
 * Strictly restricted to authorized administrator (ye.agrajj@gmail.com)
 */
export async function adminVerifyWhatsAppAction(
  targetUserId: string,
  decision: 'verified' | 'rejected',
  rejectionReason?: string
): Promise<ActionResponse> {
  try {
    const { user: adminUser } = await requireAdmin();

    const supabase = await createClient();

    const isApprove = decision === 'verified';
    const updatePayload: Record<string, any> = {
      whatsapp_verification_status: decision,
      whatsapp_verified: isApprove,
      whatsapp_verified_at: isApprove ? new Date().toISOString() : null,
      whatsapp_verified_by: adminUser.email,
      whatsapp_rejection_reason: isApprove ? null : (rejectionReason?.trim() || 'WhatsApp number could not be verified.'),
      updated_at: new Date().toISOString(),
    };

    const { error } = await (supabase.from('profiles') as any)
      .update(updatePayload)
      .eq('id', targetUserId);

    if (error) {
      console.error('Error updating WhatsApp verification status:', error);
      return {
        success: false,
        message: error.message || 'Failed to update verification status.',
      };
    }

    revalidatePath('/admin/dashboard');
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
 * Allows instant verification when the admin receives a greeting message on WhatsApp.
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

    // Search profiles table by email OR whatsapp_number
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
      whatsapp_verified_by: adminUser.email,
      whatsapp_rejection_reason: isApprove ? null : (rejectionReason?.trim() || 'WhatsApp number could not be verified.'),
      updated_at: nowIso,
    };

    const { error: updateErr } = await (supabase.from('profiles') as any)
      .update(updatePayload)
      .eq('id', targetProfile.id);

    if (updateErr) {
      return { success: false, message: updateErr.message || 'Failed to update verification status.' };
    }

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
 * Strictly restricted to authorized administrator (ye.agrajj@gmail.com)
 */
export async function adminVerifyEfootballIdAction(
  targetUserId: string,
  decision: 'verified' | 'rejected',
  rejectionReason?: string
): Promise<ActionResponse> {
  try {
    const { user: adminUser } = await requireAdmin();

    const supabase = await createClient();

    const isApprove = decision === 'verified';
    const updatePayload: Record<string, any> = {
      efootball_verification_status: decision,
      efootball_id_verified: isApprove,
      efootball_rejection_reason: isApprove ? null : (rejectionReason?.trim() || 'eFootball ID did not match in-game records.'),
      updated_at: new Date().toISOString(),
    };

    const { error } = await (supabase.from('profiles') as any)
      .update(updatePayload)
      .eq('id', targetUserId);

    if (error) {
      console.error('Error updating eFootball verification status:', error);
      return {
        success: false,
        message: error.message || 'Failed to update eFootball verification status.',
      };
    }

    revalidatePath('/admin/dashboard');
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
  createdAt: string;
}

/**
 * Fetches member verification requests for the Admin Dashboard
 */
export async function getAdminVerificationQueueAction(): Promise<ActionResponse<AdminVerificationItem[]>> {
  try {
    await requireAdmin();

    const supabase = await createClient();

    const { data, error } = await (supabase.from('profiles') as any)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Profiles table not ready (checking tournament participants fallback):', error.message);
      const { data: partData } = await supabase
        .from('participants')
        .select('id, user_id, username, real_name, contact_info, status, created_at')
        .order('created_at', { ascending: false });

      if (partData && partData.length > 0) {
        const fallbackItems: AdminVerificationItem[] = partData.map((p: any) => ({
          id: p.user_id || p.id,
          displayName: p.real_name || p.username,
          email: undefined,
          efootballId: p.username || 'Not Set',
          efootballVerificationStatus: 'pending',
          efootballIdVerified: false,
          efootballRejectionReason: null,
          whatsappNumber: p.contact_info || 'Not Set',
          whatsappVerificationStatus: 'pending',
          whatsappVerified: false,
          whatsappRejectionReason: null,
          whatsappRequestedAt: p.created_at,
          whatsappVerifiedAt: null,
          whatsappVerifiedBy: null,
          createdAt: p.created_at,
        }));
        return { success: true, message: 'Queue loaded from registered participants', data: fallbackItems };
      }

      return { success: true, message: 'No verification requests found.', data: [] };
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
      createdAt: p.created_at,
    }));

    return { success: true, message: 'Queue loaded', data: items };
  } catch (err: any) {
    console.error('Error in getAdminVerificationQueueAction:', err);
    return { success: false, message: err.message || 'Unauthorized', data: [] };
  }
}
