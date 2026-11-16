'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser, requireAdmin } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { saveUserEligibility } from '@/services/oneVsOneService';

export interface ActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Saves user age and eligibility acknowledgement.
 */
export async function saveEligibilityAcknowledgementAction(
  policyVersion: string = 'v1.0',
  jurisdiction: string = 'IN'
): Promise<ActionResult> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    const supabase = await createClient();
    const res = await saveUserEligibility(supabase, user.id, policyVersion, jurisdiction);

    if (!res.success) {
      return { success: false, error: res.error || 'Failed to save eligibility acknowledgement.' };
    }

    revalidatePath('/dashboard/matches');
    return { success: true };
  } catch (err: any) {
    console.error('[saveEligibilityAcknowledgementAction] Error:', err);
    return { success: false, error: err.message || 'An unexpected error occurred.' };
  }
}

/**
 * Concurrency-safe matchmaking action: creates or joins an open room for a card.
 */
export async function joinOrCreateMatchAction(cardId: string): Promise<
  ActionResult<{
    isMatched: boolean;
    matchId: string;
    matchCode: string;
    playerPosition: 1 | 2;
    status: string;
  }>
> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    if (!cardId || typeof cardId !== 'string') {
      return { success: false, error: 'Invalid challenge card selection.' };
    }

    const supabase = await createClient();

    // Call atomic stored procedure
    const { data, error } = await (supabase.rpc as any)('join_or_create_one_vs_one_match', {
      p_card_id: cardId,
      p_user_id: user.id,
      p_jurisdiction: 'IN',
    });

    if (error) {
      console.error('[joinOrCreateMatchAction] RPC error:', error);
      return { success: false, error: error.message || 'Matchmaking request failed.' };
    }

    revalidatePath('/dashboard/matches');
    return {
      success: true,
      data: {
        isMatched: data.is_matched,
        matchId: data.match_id,
        matchCode: data.match_code,
        playerPosition: data.player_position,
        status: data.status,
      },
    };
  } catch (err: any) {
    console.error('[joinOrCreateMatchAction] Error:', err);
    return { success: false, error: err.message || 'Failed to enter matchmaking queue.' };
  }
}

/**
 * Cancels a waiting match queue entry.
 */
export async function cancelWaitingMatchAction(matchId: string): Promise<ActionResult> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required.' };
    }

    const supabase = await createClient();
    const { error } = await (supabase.rpc as any)('cancel_waiting_one_vs_one_match', {
      p_match_id: matchId,
      p_user_id: user.id,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/dashboard/matches');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to cancel waiting match.' };
  }
}

/**
 * Player 1 submits Room ID and Password.
 */
export async function submitRoomCredentialsAction(params: {
  matchId: string;
  roomId: string;
  roomPassword: string;
}): Promise<ActionResult> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required.' };
    }

    if (!params.roomId || !params.roomId.trim()) {
      return { success: false, error: 'Room ID is required.' };
    }

    const supabase = await createClient();
    const { error } = await (supabase.rpc as any)('submit_one_vs_one_room', {
      p_match_id: params.matchId,
      p_user_id: user.id,
      p_room_id: params.roomId.trim(),
      p_room_password: (params.roomPassword || '').trim(),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/dashboard/matches');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to submit room credentials.' };
  }
}

/**
 * Player confirms readiness to begin match.
 */
export async function confirmPlayerReadyAction(params: {
  matchId: string;
}): Promise<ActionResult<{ status: string; bothReady: boolean }>> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required.' };
    }

    const supabase = await createClient();
    const { data, error } = await (supabase.rpc as any)('confirm_one_vs_one_ready', {
      p_match_id: params.matchId,
      p_user_id: user.id,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/dashboard/matches');
    return {
      success: true,
      data: {
        status: data.status,
        bothReady: data.both_ready,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to confirm readiness.' };
  }
}

/**
 * Player submits match result with scores and optional screenshot proof.
 */
export async function submitMatchResultAction(formData: FormData): Promise<ActionResult> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required.' };
    }

    const matchId = formData.get('matchId') as string;
    const p1ScoreStr = formData.get('p1Score') as string;
    const p2ScoreStr = formData.get('p2Score') as string;
    const claimedWinnerId = formData.get('claimedWinnerId') as string | null;
    const file = formData.get('screenshot') as File | null;

    if (!matchId) {
      return { success: false, error: 'Match ID is required.' };
    }

    const p1Score = parseInt(p1ScoreStr, 10);
    const p2Score = parseInt(p2ScoreStr, 10);

    if (isNaN(p1Score) || p1Score < 0 || isNaN(p2Score) || p2Score < 0) {
      return { success: false, error: 'Please enter valid non-negative scores.' };
    }

    const supabase = await createClient();

    let finalClaimedWinnerId: string | null = claimedWinnerId || null;
    if (!finalClaimedWinnerId) {
      const { data: players } = await (supabase.from('one_vs_one_match_players') as any)
        .select('user_id, player_position')
        .eq('match_id', matchId);

      const p1User = players?.find((p: any) => p.player_position === 1)?.user_id;
      const p2User = players?.find((p: any) => p.player_position === 2)?.user_id;

      if (p1Score > p2Score && p1User) {
        finalClaimedWinnerId = p1User;
      } else if (p2Score > p1Score && p2User) {
        finalClaimedWinnerId = p2User;
      } else {
        finalClaimedWinnerId = null; // Draw
      }
    }

    let screenshotUrl: string | null = null;

    // Handle optional screenshot upload (only required if players disagree/mismatch)
    if (file && file.size > 0) {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        return { success: false, error: 'Supported screenshot formats: JPG, PNG, WEBP.' };
      }
      if (file.size > 5 * 1024 * 1024) {
        return { success: false, error: 'Screenshot file size exceeds 5MB limit.' };
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
      const storagePath = `1v1/${matchId}/${user.id}_result_${Date.now()}.${fileExt}`;
      const adminClient = createAdminClient();
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadErr } = await adminClient.storage
        .from('payment-proofs')
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadErr) {
        return { success: false, error: `Failed to upload screenshot: ${uploadErr.message}` };
      }

      screenshotUrl = storagePath;
    }

    const { error } = await (supabase.rpc as any)('submit_one_vs_one_result', {
      p_match_id: matchId,
      p_user_id: user.id,
      p_claimed_winner_id: finalClaimedWinnerId,
      p_p1_score: p1Score,
      p_p2_score: p2Score,
      p_screenshot_url: screenshotUrl,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/dashboard/matches');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to submit match score.' };
  }
}

/**
 * Opponent confirms the submitted result by submitting their own screenshot proof.
 */
export async function confirmMatchResultAction(params: FormData | { matchId: string }): Promise<ActionResult> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required.' };
    }

    let matchId = '';
    let file: File | null = null;

    if (params instanceof FormData) {
      matchId = params.get('matchId') as string;
      file = params.get('screenshot') as File | null;
    } else {
      matchId = params.matchId;
    }

    if (!matchId) {
      return { success: false, error: 'Match ID is required.' };
    }

    let opponentScreenshotUrl: string | null = null;

    // Screenshot is optional when confirming - only needed if players disagree/mismatch
    if (file && file.size > 0) {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        return { success: false, error: 'Supported screenshot formats: JPG, PNG, WEBP.' };
      }
      if (file.size > 5 * 1024 * 1024) {
        return { success: false, error: 'Screenshot file size exceeds 5MB limit.' };
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
      const storagePath = `1v1/${matchId}/${user.id}_confirm_${Date.now()}.${fileExt}`;
      const adminClient = createAdminClient();
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadErr } = await adminClient.storage
        .from('payment-proofs')
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadErr) {
        return { success: false, error: `Failed to upload confirmation screenshot: ${uploadErr.message}` };
      }

      opponentScreenshotUrl = storagePath;
    }

    const supabase = await createClient();
    const { error } = await (supabase.rpc as any)('confirm_one_vs_one_result', {
      p_match_id: matchId,
      p_user_id: user.id,
      p_opponent_screenshot_url: opponentScreenshotUrl,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/dashboard/matches');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to confirm match result.' };
  }
}

/**
 * Generate a signed URL for a 1v1 screenshot storage path.
 */
export async function getOneVsOneSignedUrlAction(storagePath: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!storagePath) {
      return { success: false, error: 'Storage path is required.' };
    }
    const adminClient = createAdminClient();
    const { data, error } = await adminClient.storage
      .from('payment-proofs')
      .createSignedUrl(storagePath, 7200);

    if (error || !data?.signedUrl) {
      return { success: false, error: error?.message || 'Failed to generate signed URL.' };
    }
    return { success: true, url: data.signedUrl };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Player opens a dispute regarding match outcome.
 */
export async function disputeMatchResultAction(formData: FormData): Promise<ActionResult> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required.' };
    }

    const matchId = formData.get('matchId') as string;
    const reason = formData.get('reason') as string;
    const description = formData.get('description') as string;
    const file = formData.get('evidence') as File | null;

    if (!matchId) return { success: false, error: 'Match ID required.' };
    if (!reason || !reason.trim()) return { success: false, error: 'Dispute reason is required.' };
    if (!description || !description.trim()) return { success: false, error: 'Description is required.' };

    // Final Match Screenshot is strictly required on score mismatch
    if (reason === 'Wrong Score Marked by Opponent' && (!file || file.size === 0)) {
      return { success: false, error: 'Final match screenshot proof is required when reporting a score mismatch.' };
    }

    let evidenceUrl: string | null = null;
    if (file && file.size > 0) {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
      const storagePath = `1v1/disputes/${matchId}/${user.id}_${Date.now()}.${fileExt}`;
      const adminClient = createAdminClient();
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadErr } = await adminClient.storage
        .from('payment-proofs')
        .upload(storagePath, buffer, { contentType: file.type, upsert: true });

      if (!uploadErr) evidenceUrl = storagePath;
    }

    const supabase = await createClient();
    const { error } = await (supabase.rpc as any)('dispute_one_vs_one_match', {
      p_match_id: matchId,
      p_user_id: user.id,
      p_reason: reason.trim(),
      p_description: description.trim(),
      p_evidence_url: evidenceUrl,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/dashboard/matches');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to file dispute.' };
  }
}

/**
 * Admin: Resolves an open dispute.
 */
export async function adminResolveDisputeAction(params: {
  disputeId: string;
  winnerId: string;
  adminNotes: string;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireAdmin();
    const supabase = await createClient();

    const { error } = await (supabase.rpc as any)('admin_resolve_one_vs_one_dispute', {
      p_dispute_id: params.disputeId,
      p_admin_id: adminUser.id,
      p_winner_id: params.winnerId,
      p_admin_notes: params.adminNotes || 'Resolved by administrative decision.',
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/one-vs-one');
    revalidatePath('/dashboard/matches');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to resolve dispute.' };
  }
}

/**
 * Admin: Creates or updates an entry card.
 */
export async function adminSaveCardAction(params: {
  id?: string;
  name: string;
  entryAmount: number;
  advertisedPayout: number;
  status: string;
  displayOrder?: number;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireAdmin();
    const supabase = await createClient();

    if (!params.name || !params.name.trim()) {
      return { success: false, error: 'Card name is required.' };
    }

    if (params.entryAmount < 0 || params.advertisedPayout < 0) {
      return { success: false, error: 'Amounts must be non-negative.' };
    }

    if (params.id) {
      const { error } = await (supabase.from('one_vs_one_cards') as any)
        .update({
          name: params.name.trim(),
          entry_amount: params.entryAmount,
          advertised_payout: params.advertisedPayout,
          status: params.status,
          display_order: params.displayOrder ?? 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.id);

      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await (supabase.from('one_vs_one_cards') as any)
        .insert({
          name: params.name.trim(),
          entry_amount: params.entryAmount,
          advertised_payout: params.advertisedPayout,
          status: params.status,
          display_order: params.displayOrder ?? 0,
          created_by: adminUser.id,
        });

      if (error) return { success: false, error: error.message };
    }

    revalidatePath('/admin/one-vs-one');
    revalidatePath('/dashboard/matches');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save card.' };
  }
}

/**
 * Player: Submits a Wallet Credit Recovery support ticket for a 1v1 match.
 */
export async function reportOneVsOneCreditIssueAction(formData: FormData): Promise<ActionResult<{ ticketNumber: string; ticketId: string }>> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    const matchId = formData.get('matchId') as string;
    const expectedPayoutStr = formData.get('expectedPayout') as string;
    const settlementRef = (formData.get('settlementRef') as string) || null;
    const issueCategory = (formData.get('issueCategory') as string) || 'missing_wallet_credit';
    const description = (formData.get('description') as string)?.trim();
    const file = formData.get('evidence') as File | null;

    if (!matchId) {
      return { success: false, error: 'Match ID is required.' };
    }

    if (!description || description.length < 10) {
      return { success: false, error: 'Please describe the issue in detail (at least 10 characters).' };
    }

    const expectedPayout = parseFloat(expectedPayoutStr) || 0;
    const adminClient = createAdminClient();

    // Verify user participated in this match
    const { data: matchPlayer, error: mpErr } = await (adminClient.from('one_vs_one_match_players') as any)
      .select('id, match_id')
      .eq('match_id', matchId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (mpErr || !matchPlayer) {
      return { success: false, error: 'You are not a registered participant of this match.' };
    }

    // Get match code
    const { data: matchData } = await (adminClient.from('one_vs_one_matches') as any)
      .select('match_code')
      .eq('id', matchId)
      .single();

    const matchCode = matchData?.match_code || matchId.slice(0, 8);

    // Get profile
    const { data: profile } = await (adminClient.from('profiles') as any)
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();

    const playerName = profile?.display_name || user.email?.split('@')[0] || 'Player';

    // Handle evidence screenshot upload
    let evidenceUrl: string | null = null;
    if (file && file.size > 0) {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        return { success: false, error: 'Supported formats: JPG, PNG, WEBP.' };
      }
      if (file.size > 5 * 1024 * 1024) {
        return { success: false, error: 'Screenshot must not exceed 5MB.' };
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
      const storagePath = `1v1/credit_tickets/${matchId}/${user.id}_${Date.now()}.${fileExt}`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadErr } = await adminClient.storage
        .from('payment-proofs')
        .upload(storagePath, buffer, { contentType: file.type, upsert: true });

      if (!uploadErr) {
        evidenceUrl = storagePath;
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const ticketNumber = `TKT-1V1-${dateStr}-${randomSuffix}`;

    const categoryLabels: Record<string, string> = {
      missing_wallet_credit: 'Missing Wallet Credit',
      incorrect_credit_amount: 'Incorrect Credit Amount',
      settlement_delay: 'Settlement Delayed',
      other_credit_issue: 'Other Financial/Credit Issue',
    };

    const categoryLabel = categoryLabels[issueCategory] || 'Wallet Credit Issue';

    // Insert support ticket
    const { data: ticket, error: ticketErr } = await (adminClient.from('support_tickets') as any)
      .insert({
        ticket_number: ticketNumber,
        user_id: user.id,
        player_name: playerName,
        player_email: user.email || '',
        category: 'wallet_credit',
        subject: `1v1 Credit Issue: Match ${matchCode} (Expected ₹${expectedPayout})`,
        description: `[Category: ${categoryLabel}]\n[Expected Payout: ₹${expectedPayout}]\n[Settlement Ref: ${settlementRef || 'None'}]\n\n${description}`,
        priority: 'high',
        status: 'open',
        one_vs_one_match_id: matchId,
        expected_payout: expectedPayout,
        settlement_reference: settlementRef,
        evidence_url: evidenceUrl,
      })
      .select('id, ticket_number')
      .single();

    if (ticketErr || !ticket) {
      console.error('[reportOneVsOneCreditIssueAction] Insert error:', ticketErr);
      return { success: false, error: ticketErr?.message || 'Failed to submit credit ticket.' };
    }

    // Insert initial message
    await (adminClient.from('ticket_messages') as any).insert({
      ticket_id: ticket.id,
      sender_id: user.id,
      sender_role: 'player',
      sender_name: playerName,
      message: description,
      evidence_url: evidenceUrl,
      is_internal: false,
    });

    // Insert audit log
    await (adminClient.from('ticket_audit_logs') as any).insert({
      ticket_id: ticket.id,
      actor_id: user.id,
      actor_role: 'player',
      action: 'ticket_created',
      new_status: 'open',
      notes: `1v1 Arena Credit Recovery ticket raised for match ${matchCode}`,
    });

    // Notify player
    await (adminClient.from('player_notifications') as any).insert({
      user_id: user.id,
      title: 'Credit Ticket Created 🎫',
      message: `Your credit recovery ticket #${ticketNumber} for match ${matchCode} has been logged. Admin finance desk is investigating.`,
      type: 'financial',
      action_url: `/dashboard/tickets/${ticket.id}`,
    });

    revalidatePath('/dashboard/matches');
    revalidatePath('/dashboard/tickets');
    revalidatePath('/admin/one-vs-one');

    return {
      success: true,
      data: {
        ticketNumber: ticket.ticket_number,
        ticketId: ticket.id,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to submit ticket.' };
  }
}

/**
 * Admin: Retries a failed or under-review 1v1 settlement.
 */
export async function adminRetrySettlementAction(params: {
  settlementId: string;
  reason: string;
  allowRealCredit?: boolean;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireAdmin();
    if (!params.settlementId) return { success: false, error: 'Settlement ID is required.' };
    if (!params.reason || !params.reason.trim()) return { success: false, error: 'Retry reason is required.' };

    const supabase = await createClient();
    const { data, error } = await (supabase.rpc as any)('admin_retry_one_vs_one_settlement', {
      p_settlement_id: params.settlementId,
      p_admin_id: adminUser.id,
      p_reason: params.reason.trim(),
      p_allow_real_credit: params.allowRealCredit ?? false,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && !data.success) {
      return { success: false, error: data.error || 'Retry operation failed.' };
    }

    revalidatePath('/admin/one-vs-one');
    revalidatePath('/dashboard/matches');
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to retry settlement.' };
  }
}

/**
 * Admin: Performs an authorized manual correction on a settlement.
 */
export async function adminManualSettlementCorrectionAction(params: {
  settlementId: string;
  action: 'cancel' | 'mark_completed' | 'reassign_winner';
  newWinnerId?: string;
  reason: string;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireAdmin();
    if (!params.settlementId) return { success: false, error: 'Settlement ID is required.' };
    if (!params.reason || params.reason.trim().length < 5) {
      return { success: false, error: 'A clear reason (at least 5 characters) is required.' };
    }

    const supabase = await createClient();
    const { data, error } = await (supabase.rpc as any)('admin_manual_settlement_correction', {
      p_settlement_id: params.settlementId,
      p_admin_id: adminUser.id,
      p_action: params.action,
      p_new_winner_id: params.newWinnerId || null,
      p_reason: params.reason.trim(),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && !data.success) {
      return { success: false, error: data.error || 'Correction failed.' };
    }

    revalidatePath('/admin/one-vs-one');
    revalidatePath('/dashboard/matches');
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to apply manual correction.' };
  }
}

/**
 * Admin: Triggers manual settlement calculation for a completed match.
 */
export async function triggerManualMatchSettlementAction(params: {
  matchId: string;
  allowRealCredit?: boolean;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireAdmin();
    const supabase = await createClient();

    const { data, error } = await (supabase.rpc as any)('settle_one_vs_one_match', {
      p_match_id: params.matchId,
      p_admin_id: adminUser.id,
      p_allow_real_credit: params.allowRealCredit ?? false,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && !data.success) {
      return { success: false, error: data.error || 'Settlement failed.' };
    }

    revalidatePath('/admin/one-vs-one');
    revalidatePath('/dashboard/matches');
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to trigger settlement.' };
  }
}

/**
 * Player: Joins a specific waiting match via shared match link or match code.
 */
export async function joinWaitingMatchByCodeAction(matchCode: string): Promise<
  ActionResult<{
    matchId: string;
    matchCode: string;
    playerPosition: 2;
    status: string;
  }>
> {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    if (!matchCode || typeof matchCode !== 'string') {
      return { success: false, error: 'Invalid match code.' };
    }

    const cleanCode = matchCode.trim().toUpperCase();
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const adminClient = createAdminClient();

    // Call atomic PostgreSQL stored procedure: locks match & player wallet, strictly checks balance, deducts fee, and pairs
    const { data: result, error: rpcErr } = await (adminClient.rpc as any)('join_waiting_match_by_code', {
      p_match_code: cleanCode,
      p_user_id: user.id,
    });

    if (rpcErr) {
      console.error('[joinWaitingMatchByCodeAction] RPC error:', rpcErr);
      return { success: false, error: rpcErr.message || 'Failed to join match.' };
    }

    if (!result || !result.success) {
      return { success: false, error: result?.error || 'Failed to join match.' };
    }

    revalidatePath('/dashboard/matches');
    revalidatePath('/dashboard/wallet');
    return {
      success: true,
      data: {
        matchId: result.match_id,
        matchCode: result.match_code,
        playerPosition: 2,
        status: 'matched',
      },
    };
  } catch (err: any) {
    console.error('[joinWaitingMatchByCodeAction] Error:', err);
    return { success: false, error: err.message || 'Failed to join match.' };
  }
}
