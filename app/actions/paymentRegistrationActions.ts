'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ActionResponse } from '@/app/actions/playerActions';
import type { ManualPaymentSettings, RegistrationStatus } from '@/types/database';
import { getManualPaymentSettings, updateManualPaymentSettings } from '@/services/paymentSettingsService';

export interface PaymentRequestSummary {
  total: number;
  pending_payment: number;
  payment_submitted: number;
  under_verification: number;
  approved: number;
  rejected: number;
  cancelled: number;
  slots_remaining: number;
  max_participants: number;
  current_participants: number;
}

export interface PaymentRequestItem {
  id: string;
  tournament_id: string;
  user_id: string;
  participant_id: string | null;
  status: RegistrationStatus;
  amount_paise: number;
  currency: string;
  payment_method: string | null;
  payment_reference: string | null;
  payment_proof_url: string | null;
  verified_amount_paise: number | null;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  profile?: {
    display_name: string;
    efootball_id: string;
    whatsapp_number: string;
    whatsapp_verified: boolean;
    avatar_url: string | null;
    account_status: string;
  } | null;
}

/**
 * User action: Submit transaction ID / payment reference for a pending registration
 */
export async function submitPaymentProofAction(
  registrationId: string,
  paymentReference: string,
  notes?: string
): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, message: 'You must be signed in to submit payment proof.' };
    }

    const trimmedRef = paymentReference?.trim();
    if (!trimmedRef) {
      return { success: false, message: 'Please enter a valid Transaction / UTR reference ID.' };
    }

    const { data, error } = await (supabase.rpc as any)('submit_manual_payment', {
      p_registration_id: registrationId,
      p_payment_reference: trimmedRef,
      p_notes: notes?.trim() || null,
    });

    if (error) {
      return { success: false, message: error.message || 'Failed to submit payment reference.' };
    }

    if (data && data.success === false) {
      return { success: false, message: data.message || 'Failed to submit payment reference.' };
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/tournaments');
    revalidatePath('/tournaments');

    return {
      success: true,
      message: data?.message || 'Payment proof submitted. Admin will verify shortly.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to submit payment proof.';
    return { success: false, message: msg };
  }
}

/**
 * User action: Cancel own pending registration request
 */
export async function cancelRegistrationRequestAction(registrationId: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, message: 'You must be signed in to manage registrations.' };
    }

    const { data, error } = await (supabase.rpc as any)('cancel_manual_registration', {
      p_registration_id: registrationId,
    });

    if (error) {
      return { success: false, message: error.message || 'Failed to cancel registration request.' };
    }

    if (data && data.success === false) {
      return { success: false, message: data.message || 'Failed to cancel registration request.' };
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/tournaments');
    revalidatePath('/tournaments');

    return {
      success: true,
      message: data?.message || 'Registration request cancelled.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to cancel registration.';
    return { success: false, message: msg };
  }
}

/**
 * Admin action: Approve manual payment & confirm participant
 */
export async function adminApproveRegistrationAction(
  registrationId: string,
  verifiedAmountPaise?: number,
  note?: string
): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, message: 'Authentication required.' };
    }

    const { data, error } = await (supabase.rpc as any)('admin_approve_manual_registration', {
      p_registration_id: registrationId,
      p_verified_amount_paise: verifiedAmountPaise ?? null,
      p_note: note?.trim() || null,
    });

    if (error) {
      return { success: false, message: error.message || 'Failed to approve registration.' };
    }

    if (data && data.success === false) {
      return { success: false, message: data.message || 'Failed to approve registration.' };
    }

    revalidatePath('/admin/tournaments');
    revalidatePath('/tournaments');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: data?.message || 'Registration approved and participant confirmed successfully.',
      data: { participantId: data?.participant_id },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error approving registration.';
    return { success: false, message: msg };
  }
}

/**
 * Admin action: Reject manual payment registration request
 */
export async function adminRejectRegistrationAction(
  registrationId: string,
  rejectionReason: string
): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, message: 'Authentication required.' };
    }

    const reason = rejectionReason?.trim();
    if (!reason) {
      return { success: false, message: 'A rejection reason is required.' };
    }

    const { data, error } = await (supabase.rpc as any)('admin_reject_manual_registration', {
      p_registration_id: registrationId,
      p_rejection_reason: reason,
    });

    if (error) {
      return { success: false, message: error.message || 'Failed to reject registration.' };
    }

    if (data && data.success === false) {
      return { success: false, message: data.message || 'Failed to reject registration.' };
    }

    revalidatePath('/admin/tournaments');
    revalidatePath('/tournaments');

    return {
      success: true,
      message: data?.message || 'Registration request rejected.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error rejecting registration.';
    return { success: false, message: msg };
  }
}

/**
 * Admin action: Mark registration under verification
 */
export async function adminSetUnderVerificationAction(registrationId: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, message: 'Authentication required.' };
    }

    const { data, error } = await (supabase.rpc as any)('admin_set_under_verification', {
      p_registration_id: registrationId,
    });

    if (error) {
      return { success: false, message: error.message || 'Failed to update status.' };
    }

    if (data && data.success === false) {
      return { success: false, message: data.message || 'Failed to update status.' };
    }

    revalidatePath('/admin/tournaments');

    return {
      success: true,
      message: data?.message || 'Registration marked under verification.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating status.';
    return { success: false, message: msg };
  }
}

/**
 * Admin query: Fetch payment requests for a specific tournament with profiles and statistics
 */
export async function getTournamentPaymentRequestsAction(
  tournamentId: string,
  options?: {
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<{
  success: boolean;
  requests: PaymentRequestItem[];
  summary: PaymentRequestSummary;
  totalCount: number;
  message?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        requests: [],
        summary: {
          total: 0,
          pending_payment: 0,
          payment_submitted: 0,
          under_verification: 0,
          approved: 0,
          rejected: 0,
          cancelled: 0,
          slots_remaining: 0,
          max_participants: 0,
          current_participants: 0,
        },
        totalCount: 0,
        message: 'Unauthorized.',
      };
    }

    // 1. Fetch tournament details for capacity & slots calculation
    const [tRes, pCountRes] = await Promise.all([
      supabase
        .from('tournaments')
        .select('id, name, max_participants')
        .eq('id', tournamentId)
        .maybeSingle(),
      supabase
        .from('participants')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId),
    ]);

    const maxParticipants = (tRes.data as any)?.max_participants || 32;
    const currentParticipants = pCountRes.count || 0;
    const slotsRemaining = Math.max(0, maxParticipants - currentParticipants);

    // 2. Fetch all registrations for this tournament to compute summary
    const { data: allRegs, error: allErr } = await (supabase.from('tournament_registrations') as any)
      .select('id, status')
      .eq('tournament_id', tournamentId);

    if (allErr) {
      console.error('Error fetching registrations summary:', allErr);
    }

    const summary: PaymentRequestSummary = {
      total: allRegs?.length || 0,
      pending_payment: 0,
      payment_submitted: 0,
      under_verification: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
      slots_remaining: slotsRemaining,
      max_participants: maxParticipants,
      current_participants: currentParticipants,
    };

    if (allRegs) {
      for (const r of allRegs) {
        if (r.status === 'pending_payment') summary.pending_payment++;
        else if (r.status === 'payment_submitted') summary.payment_submitted++;
        else if (r.status === 'under_verification') summary.under_verification++;
        else if (r.status === 'approved' || r.status === 'confirmed') summary.approved++;
        else if (r.status === 'rejected') summary.rejected++;
        else if (r.status === 'cancelled') summary.cancelled++;
      }
    }

    // 3. Build query for paginated/filtered list
    let query = (supabase.from('tournament_registrations') as any)
      .select('*', { count: 'exact' })
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false });

    if (options?.status && options.status !== 'all') {
      if (options.status === 'approved') {
        query = query.in('status', ['approved', 'confirmed']);
      } else {
        query = query.eq('status', options.status);
      }
    }

    const page = Math.max(1, options?.page || 1);
    const pageSize = Math.min(100, Math.max(1, options?.pageSize || 20));
    const offset = (page - 1) * pageSize;

    query = query.range(offset, offset + pageSize - 1);

    const { data: requestsData, count, error: reqErr } = await query;

    if (reqErr) {
      return {
        success: false,
        requests: [],
        summary,
        totalCount: 0,
        message: reqErr.message || 'Failed to fetch payment requests.',
      };
    }

    const rawRequests = requestsData || [];
    const userIds = Array.from(new Set(rawRequests.map((r: any) => r.user_id).filter(Boolean)));

    // 4. Fetch profiles for user IDs
    let profilesMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, display_name, efootball_id, whatsapp_number, whatsapp_verified, avatar_url, account_status')
        .in('id', userIds);

      if (profilesData) {
        profilesMap = Object.fromEntries(profilesData.map((p: any) => [p.id, p]));
      }
    }

    // 5. Combine requests with profiles and apply client-side search if provided
    let combined: PaymentRequestItem[] = rawRequests.map((r: any) => ({
      ...r,
      profile: profilesMap[r.user_id] || null,
    }));

    if (options?.search && options.search.trim()) {
      const term = options.search.trim().toLowerCase();
      combined = combined.filter((item) => {
        const p = item.profile;
        const matchesName = p?.display_name?.toLowerCase().includes(term);
        const matchesEfootball = p?.efootball_id?.toLowerCase().includes(term);
        const matchesPhone = p?.whatsapp_number?.toLowerCase().includes(term);
        const matchesRef = item.payment_reference?.toLowerCase().includes(term);
        const matchesId = item.id.toLowerCase().includes(term);
        return matchesName || matchesEfootball || matchesPhone || matchesRef || matchesId;
      });
    }

    return {
      success: true,
      requests: combined,
      summary,
      totalCount: count || combined.length,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error fetching requests.';
    return {
      success: false,
      requests: [],
      summary: {
        total: 0,
        pending_payment: 0,
        payment_submitted: 0,
        under_verification: 0,
        approved: 0,
        rejected: 0,
        cancelled: 0,
        slots_remaining: 0,
        max_participants: 0,
        current_participants: 0,
      },
      totalCount: 0,
      message: msg,
    };
  }
}

/**
 * Get manual payment settings
 */
export async function getManualPaymentSettingsAction(): Promise<{
  success: boolean;
  settings: ManualPaymentSettings;
}> {
  const supabase = await createClient();
  const settings = await getManualPaymentSettings(supabase);
  return { success: true, settings };
}

/**
 * Update manual payment settings (Admin only)
 */
export async function updateManualPaymentSettingsAction(
  settings: ManualPaymentSettings
): Promise<ActionResponse> {
  const supabase = await createClient();
  const result = await updateManualPaymentSettings(supabase, settings);
  if (result.success) {
    revalidatePath('/admin/settings');
    revalidatePath('/tournaments');
  }
  return result;
}
