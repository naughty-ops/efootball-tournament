'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin, getAuthenticatedUser } from '@/lib/auth/server';
import { submitMatchResult } from '@/services/matchService';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * PHASE 2 & 3: Secure Player Match Check-In / Start Match
 * Records server-authoritative timestamp for player arrival.
 * Automatically marks match live when both players have checked in.
 */
export async function recordPlayerCheckinAction(
  matchId: string,
  participantId: string
): Promise<ActionResult<{ match_id: string; status: string; checked_in_at: string; both_players_present: boolean }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return { success: false, error: 'Authentication required to start match' };
    }

    const adminClient = createAdminClient();

    // Call atomic stored procedure
    const { data, error: rpcErr } = await (adminClient.rpc as any)('record_player_checkin', {
      p_match_id: matchId,
      p_participant_id: participantId,
      p_user_id: user.id,
    });

    if (rpcErr) {
      return { success: false, error: rpcErr.message || 'Failed to check in for match' };
    }

    const result = data as { success: boolean; error?: string; match_id: string; status: string; checked_in_at: string; both_players_present: boolean };
    if (!result || !result.success) {
      return { success: false, error: result?.error || 'Unable to start match' };
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/matches');
    revalidatePath(`/matches/${matchId}`);

    return {
      success: true,
      data: result,
      message: result.both_players_present
        ? 'Both players are ready! Match is now LIVE.'
        : 'Checked in successfully. Waiting for opponent to check in.',
    };
  } catch (err: any) {
    console.error('recordPlayerCheckinAction error:', err);
    return { success: false, error: err.message || 'Internal server error checking in' };
  }
}

/**
 * PHASE 3: Request Walkover / Report Opponent No-Show
 * Validates check-in grace period expiration, caller presence, and opponent absence.
 */
export async function requestWalkoverAction(
  matchId: string,
  participantId: string,
  reason?: string
): Promise<ActionResult<{ dispute_id: string; status: string; message: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return { success: false, error: 'Authentication required to request a walkover' };
    }

    const adminClient = createAdminClient();

    const { data, error: rpcErr } = await (adminClient.rpc as any)('request_match_walkover', {
      p_match_id: matchId,
      p_participant_id: participantId,
      p_user_id: user.id,
      p_reason: reason || 'Opponent no-show after grace period elapsed',
    });

    if (rpcErr) {
      return { success: false, error: rpcErr.message || 'Failed to submit walkover request' };
    }

    const result = data as { success: boolean; error?: string; dispute_id: string; status: string; message: string };
    if (!result || !result.success) {
      return { success: false, error: result?.error || 'Unable to request walkover' };
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/matches');
    revalidatePath(`/matches/${matchId}`);

    return {
      success: true,
      data: result,
      message: result.message || 'Walkover request submitted to Admin Desk for verification',
    };
  } catch (err: any) {
    console.error('requestWalkoverAction error:', err);
    return { success: false, error: err.message || 'Internal server error requesting walkover' };
  }
}

/**
 * PHASE 4: Submit Match Dispute / Issue Ticket
 */
export async function submitMatchDisputeAction(data: {
  matchId: string;
  tournamentId: string;
  reporterParticipantId: string;
  opponentParticipantId?: string | null;
  reason: 'opponent_no_show' | 'connection_failure' | 'refusing_to_play' | 'match_not_completed' | 'incorrect_walkover' | 'other';
  details?: string;
  evidenceUrl?: string;
}): Promise<ActionResult<{ disputeId: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return { success: false, error: 'Authentication required to report match issues' };
    }

    const adminClient = createAdminClient();

    // Verify reporter ownership unless admin
    const { data: part, error: partErr } = await (adminClient.from('participants') as any)
      .select('id, user_id')
      .eq('id', data.reporterParticipantId)
      .maybeSingle();

    if (partErr || !part || part.user_id !== user.id) {
      return { success: false, error: 'Unauthorized to report on behalf of this participant' };
    }

    // Insert dispute ticket
    const { data: dispute, error: disputeErr } = await (adminClient.from('match_disputes') as any)
      .insert({
        match_id: data.matchId,
        tournament_id: data.tournamentId,
        reporter_participant_id: data.reporterParticipantId,
        opponent_participant_id: data.opponentParticipantId || null,
        reason: data.reason,
        details: data.details?.trim() || null,
        evidence_url: data.evidenceUrl?.trim() || null,
        status: 'open',
      })
      .select('id')
      .single();

    if (disputeErr) {
      return { success: false, error: disputeErr.message || 'Failed to submit dispute ticket' };
    }

    // Update match status to disputed
    await (adminClient.from('matches') as any)
      .update({
        status: 'disputed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.matchId);

    // Audit log
    await (adminClient.from('match_activity_logs') as any).insert({
      match_id: data.matchId,
      tournament_id: data.tournamentId,
      actor_id: user.id,
      actor_role: 'player',
      action: 'dispute_submitted',
      details: {
        dispute_id: dispute.id,
        reason: data.reason,
        details: data.details,
      },
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/matches');
    revalidatePath(`/admin/tournaments/${data.tournamentId}/disputes`);
    revalidatePath(`/admin/tournaments/${data.tournamentId}/schedule`);

    return {
      success: true,
      data: { disputeId: dispute.id },
      message: 'Match issue reported successfully. Our admin team will review it shortly.',
    };
  } catch (err: any) {
    console.error('submitMatchDisputeAction error:', err);
    return { success: false, error: err.message || 'Internal error submitting dispute' };
  }
}

/**
 * PHASE 1: Admin Individual Match Scheduling
 */
export async function scheduleMatchAction(data: {
  matchId: string;
  tournamentId: string;
  scheduledTime: string;
  completionDeadline?: string | null;
  checkinDeadline?: string | null;
  gracePeriodMinutes?: number;
  matchday?: number | null;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireAdmin();
    const adminClient = createAdminClient();

    const scheduledDate = new Date(data.scheduledTime);
    if (isNaN(scheduledDate.getTime())) {
      return { success: false, error: 'Invalid scheduled start time format' };
    }

    const grace = data.gracePeriodMinutes ?? 15;
    const computedCheckin = data.checkinDeadline
      ? new Date(data.checkinDeadline).toISOString()
      : new Date(scheduledDate.getTime() + grace * 60 * 1000).toISOString();

    const computedCompletion = data.completionDeadline
      ? new Date(data.completionDeadline).toISOString()
      : new Date(scheduledDate.getTime() + (grace + 30) * 60 * 1000).toISOString();

    const { data: match, error: fetchErr } = await (adminClient.from('matches') as any)
      .select('id, status, tournament_id')
      .eq('id', data.matchId)
      .single();

    if (fetchErr || !match) {
      return { success: false, error: 'Match not found' };
    }

    const nextStatus = match.status === 'pending' ? 'scheduled' : match.status;

    const { error: updateErr } = await (adminClient.from('matches') as any)
      .update({
        scheduled_time: scheduledDate.toISOString(),
        checkin_deadline: computedCheckin,
        completion_deadline: computedCompletion,
        grace_period_minutes: grace,
        matchday: data.matchday ?? null,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.matchId);

    if (updateErr) {
      return { success: false, error: updateErr.message || 'Failed to schedule match' };
    }

    await (adminClient.from('match_activity_logs') as any).insert({
      match_id: data.matchId,
      tournament_id: data.tournamentId,
      actor_id: adminUser.id,
      actor_role: 'admin',
      action: 'match_scheduled',
      details: {
        scheduled_time: scheduledDate.toISOString(),
        completion_deadline: computedCompletion,
        checkin_deadline: computedCheckin,
        grace_period_minutes: grace,
        matchday: data.matchday,
      },
    });

    revalidatePath(`/admin/tournaments/${data.tournamentId}/schedule`);
    revalidatePath(`/tournaments/${data.tournamentId}`);

    return { success: true, message: 'Match scheduled successfully' };
  } catch (err: any) {
    console.error('scheduleMatchAction error:', err);
    return { success: false, error: err.message || 'Failed to schedule match' };
  }
}

/**
 * PHASE 1: Admin Bulk Schedule Matchday / Round
 */
export async function bulkScheduleMatchdayAction(data: {
  tournamentId: string;
  roundId?: string;
  matchday?: number;
  startTime: string;
  matchDurationMinutes?: number;
  intervalMinutes?: number;
  gracePeriodMinutes?: number;
}): Promise<ActionResult<{ updatedCount: number }>> {
  try {
    const { user: adminUser } = await requireAdmin();
    const adminClient = createAdminClient();

    const startDateTime = new Date(data.startTime);
    if (isNaN(startDateTime.getTime())) {
      return { success: false, error: 'Invalid start time' };
    }

    const duration = data.matchDurationMinutes || 25;
    const interval = data.intervalMinutes || 30;
    const grace = data.gracePeriodMinutes || 15;

    let query = (adminClient.from('matches') as any)
      .select('id, match_position, status, round_id')
      .order('match_position', { ascending: true });

    if (data.roundId) {
      query = query.eq('round_id', data.roundId);
    } else {
      query = query.eq('tournament_id', data.tournamentId);
      if (data.matchday) {
        query = query.eq('matchday', data.matchday);
      }
    }

    const { data: matches, error: fetchErr } = await query;
    if (fetchErr || !matches || matches.length === 0) {
      return { success: false, error: 'No matches found matching the criteria' };
    }

    let updatedCount = 0;
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const matchStart = new Date(startDateTime.getTime() + i * interval * 60 * 1000);
      const checkinDeadline = new Date(matchStart.getTime() + grace * 60 * 1000);
      const completionDeadline = new Date(matchStart.getTime() + (grace + duration) * 60 * 1000);

      const nextStatus = match.status === 'pending' ? 'scheduled' : match.status;

      const { error: updErr } = await (adminClient.from('matches') as any)
        .update({
          scheduled_time: matchStart.toISOString(),
          checkin_deadline: checkinDeadline.toISOString(),
          completion_deadline: completionDeadline.toISOString(),
          grace_period_minutes: grace,
          matchday: data.matchday ?? null,
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', match.id);

      if (!updErr) {
        updatedCount++;
      }
    }

    await (adminClient.from('match_activity_logs') as any).insert({
      match_id: matches[0].id,
      tournament_id: data.tournamentId,
      actor_id: adminUser.id,
      actor_role: 'admin',
      action: 'bulk_scheduled_matchday',
      details: {
        matches_count: matches.length,
        updated_count: updatedCount,
        start_time: startDateTime.toISOString(),
        interval_minutes: interval,
        matchday: data.matchday,
      },
    });

    revalidatePath(`/admin/tournaments/${data.tournamentId}/schedule`);
    revalidatePath(`/tournaments/${data.tournamentId}`);

    return {
      success: true,
      data: { updatedCount },
      message: `Successfully scheduled ${updatedCount} matches for the matchday`,
    };
  } catch (err: any) {
    console.error('bulkScheduleMatchdayAction error:', err);
    return { success: false, error: err.message || 'Failed to bulk-schedule matchday' };
  }
}

/**
 * PHASE 1 & 5: Admin Reschedule Match
 */
export async function rescheduleMatchAction(data: {
  matchId: string;
  tournamentId: string;
  newScheduledTime: string;
  newCompletionDeadline?: string | null;
  gracePeriodMinutes?: number;
  reason?: string;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireAdmin();
    const adminClient = createAdminClient();

    const scheduledDate = new Date(data.newScheduledTime);
    if (isNaN(scheduledDate.getTime())) {
      return { success: false, error: 'Invalid new scheduled time' };
    }

    const grace = data.gracePeriodMinutes ?? 15;
    const computedCheckin = new Date(scheduledDate.getTime() + grace * 60 * 1000).toISOString();
    const computedCompletion = data.newCompletionDeadline
      ? new Date(data.newCompletionDeadline).toISOString()
      : new Date(scheduledDate.getTime() + (grace + 30) * 60 * 1000).toISOString();

    const { error: updateErr } = await (adminClient.from('matches') as any)
      .update({
        scheduled_time: scheduledDate.toISOString(),
        checkin_deadline: computedCheckin,
        completion_deadline: computedCompletion,
        grace_period_minutes: grace,
        player_a_started_at: null,
        player_b_started_at: null,
        walkover_requested_by: null,
        walkover_requested_at: null,
        forfeit_reason: null,
        status: 'scheduled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.matchId);

    if (updateErr) {
      return { success: false, error: updateErr.message || 'Failed to reschedule match' };
    }

    // If there were any open disputes for this match, mark them resolved by reschedule
    await (adminClient.from('match_disputes') as any)
      .update({
        status: 'resolved',
        resolution_action: 'rescheduled',
        admin_notes: data.reason ? `Rescheduled by admin: ${data.reason}` : 'Rescheduled by admin',
        resolved_by: adminUser.id,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('match_id', data.matchId)
      .eq('status', 'open');

    await (adminClient.from('match_activity_logs') as any).insert({
      match_id: data.matchId,
      tournament_id: data.tournamentId,
      actor_id: adminUser.id,
      actor_role: 'admin',
      action: 'match_rescheduled',
      details: {
        new_scheduled_time: scheduledDate.toISOString(),
        reason: data.reason,
      },
    });

    revalidatePath(`/admin/tournaments/${data.tournamentId}/schedule`);
    revalidatePath(`/admin/tournaments/${data.tournamentId}/disputes`);
    revalidatePath(`/tournaments/${data.tournamentId}`);
    revalidatePath('/dashboard');

    return { success: true, message: 'Match rescheduled successfully and reset to scheduled status' };
  } catch (err: any) {
    console.error('rescheduleMatchAction error:', err);
    return { success: false, error: err.message || 'Failed to reschedule match' };
  }
}

/**
 * PHASE 1 & 5: Admin Extend Match Deadline
 */
export async function extendDeadlineAction(data: {
  matchId: string;
  tournamentId: string;
  additionalMinutes: number;
  reason?: string;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireAdmin();
    const adminClient = createAdminClient();

    const { data: match, error: fetchErr } = await (adminClient.from('matches') as any)
      .select('id, completion_deadline, checkin_deadline, scheduled_time, status')
      .eq('id', data.matchId)
      .single();

    if (fetchErr || !match) {
      return { success: false, error: 'Match not found' };
    }

    const currentCompletion = match.completion_deadline
      ? new Date(match.completion_deadline)
      : new Date(Date.now() + 30 * 60 * 1000);
    const newCompletion = new Date(currentCompletion.getTime() + data.additionalMinutes * 60 * 1000);

    const currentCheckin = match.checkin_deadline
      ? new Date(match.checkin_deadline)
      : new Date(Date.now() + 15 * 60 * 1000);
    const newCheckin = new Date(currentCheckin.getTime() + data.additionalMinutes * 60 * 1000);

    // If status was under_review, restore to live or scheduled
    let nextStatus = match.status;
    if (match.status === 'under_review') {
      nextStatus = 'live';
    }

    const { error: updateErr } = await (adminClient.from('matches') as any)
      .update({
        completion_deadline: newCompletion.toISOString(),
        checkin_deadline: newCheckin.toISOString(),
        status: nextStatus,
        forfeit_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.matchId);

    if (updateErr) {
      return { success: false, error: updateErr.message || 'Failed to extend deadline' };
    }

    await (adminClient.from('match_activity_logs') as any).insert({
      match_id: data.matchId,
      tournament_id: data.tournamentId,
      actor_id: adminUser.id,
      actor_role: 'admin',
      action: 'deadline_extended',
      details: {
        additional_minutes: data.additionalMinutes,
        new_completion_deadline: newCompletion.toISOString(),
        reason: data.reason,
      },
    });

    revalidatePath(`/admin/tournaments/${data.tournamentId}/schedule`);
    revalidatePath(`/admin/tournaments/${data.tournamentId}/disputes`);

    return {
      success: true,
      message: `Deadline extended by ${data.additionalMinutes} minutes (New deadline: ${newCompletion.toLocaleTimeString()})`,
    };
  } catch (err: any) {
    console.error('extendDeadlineAction error:', err);
    return { success: false, error: err.message || 'Failed to extend match deadline' };
  }
}

/**
 * PHASE 5: Admin Resolve Dispute / Walkover Decision / Score Determination
 */
export async function resolveDisputeAction(data: {
  disputeId: string;
  matchId: string;
  tournamentId: string;
  decision: 'approve_walkover' | 'reject_walkover' | 'reschedule' | 'dismiss' | 'resolve_with_scores';
  winnerParticipantId?: string;
  scoreA?: number;
  scoreB?: number;
  adminNotes?: string;
  newScheduledTime?: string;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireAdmin();
    const adminClient = createAdminClient();

    if (data.decision === 'resolve_with_scores') {
      let finalScoreA = data.scoreA ?? 0;
      let finalScoreB = data.scoreB ?? 0;

      // Check match participant mapping to ensure scores map to participant_a and participant_b correctly
      const { data: matchObj } = await (adminClient.from('matches') as any)
        .select('participant_a, participant_b')
        .eq('id', data.matchId)
        .single();

      if (matchObj && data.disputeId) {
        const { data: disputeObj } = await (adminClient.from('match_disputes') as any)
          .select('reporter_participant_id')
          .eq('id', data.disputeId)
          .single();

        if (disputeObj && disputeObj.reporter_participant_id === matchObj.participant_b) {
          // Reporter is participant_b, so scoreA is player B's score
          finalScoreA = data.scoreB ?? 0;
          finalScoreB = data.scoreA ?? 0;
        }
      }

      // Authoritative score submission from Admin Desk
      await submitMatchResult(
        data.matchId,
        data.tournamentId,
        {
          result_type: 'normal',
          score_a: finalScoreA,
          score_b: finalScoreB,
          decided_by: 'normal',
          notes: data.adminNotes ? `Dispute resolved by Admin Desk: ${data.adminNotes}` : 'Dispute resolved by Admin Desk',
        },
        adminClient
      );

      await (adminClient.from('match_disputes') as any)
        .update({
          status: 'resolved',
          resolution_action: 'scores_resolved_by_admin',
          admin_notes: data.adminNotes || null,
          resolved_by: adminUser.id,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.disputeId);
    } else if (data.decision === 'approve_walkover') {
      if (!data.winnerParticipantId) {
        return { success: false, error: 'Must select the advancing winner for a walkover approval' };
      }

      // Reuse unified match result engine which handles bracket progression & loser elimination
      await submitMatchResult(data.matchId, data.tournamentId, {
        result_type: 'walkover',
        walkover_winner_id: data.winnerParticipantId,
        score_a: 3,
        score_b: 0,
        notes: data.adminNotes ? `Walkover approved: ${data.adminNotes}` : 'Walkover approved by admin',
      });

      // Update dispute record
      await (adminClient.from('match_disputes') as any)
        .update({
          status: 'resolved',
          resolution_action: 'walkover_approved',
          admin_notes: data.adminNotes || null,
          resolved_by: adminUser.id,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.disputeId);
    } else if (data.decision === 'reschedule') {
      if (!data.newScheduledTime) {
        return { success: false, error: 'New scheduled time is required to reschedule' };
      }

      await rescheduleMatchAction({
        matchId: data.matchId,
        tournamentId: data.tournamentId,
        newScheduledTime: data.newScheduledTime,
        reason: data.adminNotes,
      });

      await (adminClient.from('match_disputes') as any)
        .update({
          status: 'resolved',
          resolution_action: 'rescheduled',
          admin_notes: data.adminNotes || null,
          resolved_by: adminUser.id,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.disputeId);
    } else {
      // reject_walkover or dismiss
      const newStatus = data.decision === 'reject_walkover' ? 'rejected' : 'rejected';

      // Restore match to ready or scheduled
      await (adminClient.from('matches') as any)
        .update({
          status: 'scheduled',
          walkover_requested_by: null,
          walkover_requested_at: null,
          forfeit_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.matchId);

      await (adminClient.from('match_disputes') as any)
        .update({
          status: newStatus,
          resolution_action: data.decision,
          admin_notes: data.adminNotes || null,
          resolved_by: adminUser.id,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.disputeId);
    }

    await (adminClient.from('match_activity_logs') as any).insert({
      match_id: data.matchId,
      tournament_id: data.tournamentId,
      actor_id: adminUser.id,
      actor_role: 'admin',
      action: 'dispute_resolved',
      details: {
        dispute_id: data.disputeId,
        decision: data.decision,
        admin_notes: data.adminNotes,
      },
    });

    try {
      revalidatePath(`/admin/tournaments/${data.tournamentId}/disputes`);
      revalidatePath(`/admin/tournaments/${data.tournamentId}/schedule`);
      revalidatePath(`/tournaments/${data.tournamentId}`);
    } catch (revalidateErr) {
      if (process.env.NODE_ENV === 'production') {
        console.warn('revalidatePath non-fatal warning in production:', revalidateErr);
      }
    }

    return { success: true, message: `Dispute resolved with decision: ${data.decision}` };
  } catch (err: any) {
    console.error('resolveDisputeAction error:', err);
    return { success: false, error: err.message || 'Failed to resolve dispute' };
  }
}

/**
 * NEW WORKFLOW: Player Starts Match (Server-Authoritative, NO Livestream triggered)
 * Once both players confirm, activates 30-minute countdown.
 */
export async function startPlayerMatchAction(
  matchId: string,
  participantId: string
): Promise<ActionResult<{
  match_id: string;
  status: string;
  both_started: boolean;
  actual_start_time?: string;
  completion_deadline?: string;
}>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return { success: false, error: 'Authentication required to start match' };
    }

    const adminClient = createAdminClient();

    const { data, error: rpcErr } = await (adminClient.rpc as any)('start_player_match', {
      p_match_id: matchId,
      p_participant_id: participantId,
      p_user_id: user.id,
    });

    if (rpcErr) {
      return { success: false, error: rpcErr.message || 'Failed to start match' };
    }

    const result = data as {
      success: boolean;
      error?: string;
      match_id: string;
      status: string;
      both_started: boolean;
      actual_start_time?: string;
      completion_deadline?: string;
    };

    if (!result || !result.success) {
      return { success: false, error: result?.error || 'Unable to start match' };
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/matches');

    return {
      success: true,
      data: result,
      message: result.both_started
        ? 'Both players confirmed! 30-minute match countdown is now ACTIVE.'
        : 'You confirmed start! Awaiting opponent confirmation.',
    };
  } catch (err: any) {
    console.error('startPlayerMatchAction error:', err);
    return { success: false, error: err.message || 'Internal server error starting match' };
  }
}

/**
 * NEW WORKFLOW: Player Submits Score (Independent Score Entry & Verification)
 * Scenario A: Matching scores -> Auto-completes match, updates standings & leaderboard.
 * Scenario B: Conflicting scores -> Marks DISPUTED, prompts for screenshot proof.
 */
export async function submitPlayerScoreAction(data: {
  matchId: string;
  tournamentId: string;
  participantId: string;
  myScore: number;
  opponentScore: number;
}): Promise<ActionResult<{
  status: string;
  verified?: boolean;
  matching?: boolean;
  conflict?: boolean;
  message?: string;
}>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return { success: false, error: 'Authentication required to submit scores' };
    }

    const adminClient = createAdminClient();

    const { data: rpcData, error: rpcErr } = await (adminClient.rpc as any)('submit_player_score', {
      p_match_id: data.matchId,
      p_participant_id: data.participantId,
      p_user_id: user.id,
      p_my_score: data.myScore,
      p_opponent_score: data.opponentScore,
    });

    if (rpcErr) {
      return { success: false, error: rpcErr.message || 'Failed to submit score' };
    }

    const result = rpcData as {
      success: boolean;
      error?: string;
      status: string;
      both_submitted: boolean;
      matching?: boolean;
      conflict?: boolean;
      score_a?: number;
      score_b?: number;
      message?: string;
    };

    if (!result || !result.success) {
      return { success: false, error: result?.error || 'Unable to submit score' };
    }

    // SCENARIO A: Both players submitted MATCHING scores!
    // Trigger authoritative tournament engine completion
    if (result.matching && typeof result.score_a === 'number' && typeof result.score_b === 'number') {
      try {
        await submitMatchResult(data.matchId, data.tournamentId, {
          result_type: 'normal',
          score_a: result.score_a,
          score_b: result.score_b,
          decided_by: 'normal',
          notes: 'Result automatically verified - both players reported matching scores.',
        });

        // Ensure tournament champion & runner_up persistence under RLS admin privileges
        const { data: completedMatch } = await (adminClient.from('matches') as any)
          .select('participant_a, participant_b, winner_id, next_match_id, group_id')
          .eq('id', data.matchId)
          .single();

        if (completedMatch && !completedMatch.next_match_id && !completedMatch.group_id && completedMatch.winner_id) {
          const runnerUpId =
            completedMatch.participant_a === completedMatch.winner_id
              ? completedMatch.participant_b
              : completedMatch.participant_a;

          await (adminClient.from('tournaments') as any)
            .update({
              status: 'completed',
              champion_id: completedMatch.winner_id,
              runner_up_id: runnerUpId || null,
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', data.tournamentId);
        }
      } catch (resultErr: any) {
        console.error('submitMatchResult auto-verification note:', resultErr);
      }
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/matches');
    revalidatePath(`/tournaments/${data.tournamentId}`);

    return {
      success: true,
      data: {
        status: result.status,
        verified: result.matching,
        matching: result.matching,
        conflict: result.conflict,
        message: result.message,
      },
      message: result.message || 'Score submitted successfully',
    };
  } catch (err: any) {
    console.error('submitPlayerScoreAction error:', err);
    return { success: false, error: err.message || 'Internal server error submitting score' };
  }
}

/**
 * NEW WORKFLOW: Submit Screenshot Evidence for Disputed Match (Cloudinary-backed)
 */
export async function submitMatchScreenshotProofAction(data: {
  matchId: string;
  tournamentId: string;
  participantId: string;
  screenshotUrl: string;
  screenshotPublicId?: string;
}): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return { success: false, error: 'Authentication required to submit screenshot proof' };
    }

    const adminClient = createAdminClient();

    const { data: rpcData, error: rpcErr } = await (adminClient.rpc as any)('submit_match_screenshot_proof', {
      p_match_id: data.matchId,
      p_participant_id: data.participantId,
      p_user_id: user.id,
      p_screenshot_url: data.screenshotUrl,
      p_screenshot_public_id: data.screenshotPublicId || null,
    });

    if (rpcErr) {
      return { success: false, error: rpcErr.message || 'Failed to submit screenshot proof' };
    }

    const result = rpcData as { success: boolean; error?: string; message?: string };
    if (!result || !result.success) {
      return { success: false, error: result?.error || 'Unable to submit screenshot proof' };
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/matches');
    revalidatePath(`/admin/tournaments/${data.tournamentId}/disputes`);

    return {
      success: true,
      message: result.message || 'Screenshot proof submitted. Admin team will review your evidence.',
    };
  } catch (err: any) {
    console.error('submitMatchScreenshotProofAction error:', err);
    return { success: false, error: err.message || 'Internal server error submitting proof' };
  }
}

/**
 * NEW WORKFLOW: Check Match Timeout (30-minute Window Enforcement)
 */
export async function checkMatchTimeoutAction(matchId: string, tournamentId: string): Promise<ActionResult> {
  try {
    const adminClient = createAdminClient();
    const { data: match, error: fetchErr } = await (adminClient.from('matches') as any)
      .select('id, status, actual_start_time, completion_deadline, participant_a, participant_b')
      .eq('id', matchId)
      .single();

    if (fetchErr || !match) {
      return { success: false, error: 'Match not found' };
    }

    const now = new Date();
    const deadline = match.completion_deadline ? new Date(match.completion_deadline) : null;

    if (
      deadline &&
      now > deadline &&
      (match.status === 'in_progress' || match.status === 'awaiting_result' || match.status === 'result_verification')
    ) {
      // Transition to result_pending_admin
      await (adminClient.from('matches') as any)
        .update({
          status: 'result_pending_admin',
          forfeit_reason: '30-minute result submission deadline expired without verified score',
          updated_at: now.toISOString(),
        })
        .eq('id', matchId);

      // Create dispute ticket
      await (adminClient.from('match_disputes') as any).insert({
        match_id: matchId,
        tournament_id: tournamentId,
        reporter_participant_id: match.participant_a,
        opponent_participant_id: match.participant_b,
        reason: 'timeout_no_result',
        details: 'Match 30-minute result window expired without verified scores from both players',
        status: 'open',
      });

      revalidatePath('/dashboard');
      revalidatePath('/dashboard/matches');
      revalidatePath(`/admin/tournaments/${tournamentId}/disputes`);

      return {
        success: true,
        message: 'Match flagged as RESULT_PENDING_ADMIN due to 30-minute timeout.',
      };
    }

    return { success: true, message: 'Match is within valid time window.' };
  } catch (err: any) {
    console.error('checkMatchTimeoutAction error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * PHASE 3 & 6: Trigger Server-Authoritative Deadline Evaluation
 */
export async function evaluateOverdueMatchesAction(tournamentId?: string): Promise<ActionResult> {
  try {
    const adminClient = createAdminClient();
    const { data, error } = await (adminClient.rpc as any)('evaluate_overdue_matches', {
      p_tournament_id: tournamentId || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (tournamentId) {
      revalidatePath(`/admin/tournaments/${tournamentId}/schedule`);
      revalidatePath(`/admin/tournaments/${tournamentId}/disputes`);
      revalidatePath(`/tournaments/${tournamentId}`);
    }

    return {
      success: true,
      data,
      message: `Deadlines evaluated successfully (${data.both_noshow_flagged} no-shows, ${data.overdue_live_flagged} overdue live matches flagged)`,
    };
  } catch (err: any) {
    console.error('evaluateOverdueMatchesAction error:', err);
    return { success: false, error: err.message || 'Error evaluating deadlines' };
  }
}
