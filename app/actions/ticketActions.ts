'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin, getAuthenticatedUser } from '@/lib/auth/server';
import { resolveDisputeAction } from '@/app/actions/matchSchedulingActions';
import { uploadImage } from '@/services/mediaService';
import type { TicketPriority, TicketStatus, TicketSource } from '@/types/tickets';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Creates a new support ticket from the public contact page or player dashboard
 */
export async function createSupportTicketAction(params: {
  name: string;
  email: string;
  category: string;
  subject: string;
  description: string;
  priority?: TicketPriority;
  tournamentId?: string;
  matchId?: string;
  evidenceUrl?: string;
  evidencePublicId?: string;
  evidenceFile?: FormData;
}): Promise<ActionResult<{ ticketNumber: string; ticketId: string }>> {
  try {
    const name = params.name?.trim();
    const email = params.email?.trim().toLowerCase();
    const category = params.category || 'other';
    const subject = params.subject?.trim() || 'General Support Inquiry';
    const description = params.description?.trim();

    if (!name || name.length < 2) {
      return { success: false, error: 'Full name must be at least 2 characters.' };
    }
    if (!email || !email.includes('@') || !email.includes('.')) {
      return { success: false, error: 'Please provide a valid email address.' };
    }
    if (!description || description.length < 10) {
      return { success: false, error: 'Please provide more details (minimum 10 characters).' };
    }

    const { user: authUser } = await getAuthenticatedUser();
    const adminClient = createAdminClient();

    let uploadedEvidenceUrl = params.evidenceUrl || null;
    let uploadedEvidencePublicId = params.evidencePublicId || null;

    if (params.evidenceFile) {
      const file = params.evidenceFile.get('file') as File | null;
      if (file && file.size > 0) {
        if (file.size > 2 * 1024 * 1024) {
          return { success: false, error: 'File size exceeds the 2 MB limit. Please select a smaller screenshot.' };
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const asset = await uploadImage(buffer, {
          category: 'dispute_evidence',
          userId: authUser?.id || null,
        });
        uploadedEvidenceUrl = asset.secure_url;
        uploadedEvidencePublicId = asset.cloudinary_public_id;
      }
    }

    const insertPayload: any = {
      player_name: name,
      player_email: email,
      category,
      subject,
      description,
      priority: params.priority || 'normal',
      status: 'open',
      tournament_id: params.tournamentId || null,
      match_id: params.matchId || null,
      evidence_url: uploadedEvidenceUrl,
      evidence_public_id: uploadedEvidencePublicId,
      user_id: authUser?.id || null,
    };

    const { data, error } = await (adminClient.from('support_tickets') as any)
      .insert(insertPayload)
      .select('id, ticket_number')
      .single();

    if (error || !data) {
      console.error('createSupportTicketAction error:', error);
      return { success: false, error: error?.message || 'Failed to submit support ticket.' };
    }

    // Add initial message into thread
    await (adminClient.from('ticket_messages') as any).insert({
      ticket_id: data.id,
      sender_id: authUser?.id || null,
      sender_role: 'player',
      sender_name: name,
      message: description,
      evidence_url: params.evidenceUrl || null,
      evidence_public_id: params.evidencePublicId || null,
      is_internal: false,
    });

    // Add initial audit log
    await (adminClient.from('ticket_audit_logs') as any).insert({
      ticket_id: data.id,
      admin_name: 'System',
      action: 'ticket_created',
      previous_value: null,
      new_value: 'open',
      explanation: `Support ticket ${data.ticket_number} created by ${name}`,
    });

    revalidatePath('/admin/tickets');
    revalidatePath('/admin/dashboard');
    revalidatePath('/dashboard/tickets');
    revalidatePath('/dashboard');

    return {
      success: true,
      data: {
        ticketNumber: data.ticket_number,
        ticketId: data.id,
      },
      message: `Your ticket ${data.ticket_number} has been registered successfully. Our operations team will respond promptly.`,
    };
  } catch (err: any) {
    console.error('createSupportTicketAction unexpected error:', err);
    return { success: false, error: err.message || 'An unexpected error occurred submitting the ticket.' };
  }
}

/**
 * Assigns an administrator to a ticket or dispute
 */
export async function assignTicketAction(params: {
  ticketId: string;
  source: TicketSource;
  adminId: string | null;
  adminEmail?: string | null;
  explanation?: string;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireAdmin();
    const adminClient = createAdminClient();
    const table = params.source === 'dispute' ? 'match_disputes' : 'support_tickets';

    const { data: current } = await (adminClient.from(table) as any)
      .select('assigned_admin_id, ticket_number')
      .eq('id', params.ticketId)
      .single();

    await (adminClient.from(table) as any)
      .update({
        assigned_admin_id: params.adminId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.ticketId);

    const logPayload: any = {
      admin_id: adminUser.id,
      admin_name: adminUser.email || 'Administrator',
      action: 'admin_assigned',
      previous_value: current?.assigned_admin_id || 'unassigned',
      new_value: params.adminId ? (params.adminEmail || params.adminId) : 'unassigned',
      explanation: params.explanation || `Assigned to ${params.adminEmail || params.adminId || 'unassigned'}`,
    };

    if (params.source === 'dispute') {
      logPayload.dispute_id = params.ticketId;
    } else {
      logPayload.ticket_id = params.ticketId;
    }

    await (adminClient.from('ticket_audit_logs') as any).insert(logPayload);

    revalidatePath('/admin/tickets');
    revalidatePath(`/admin/tickets/${params.ticketId}`);
    revalidatePath('/admin/dashboard');

    return { success: true, message: 'Administrator assigned successfully.' };
  } catch (err: any) {
    console.error('assignTicketAction error:', err);
    return { success: false, error: err.message || 'Failed to assign administrator.' };
  }
}

/**
 * Updates the priority of a ticket or dispute
 */
export async function updateTicketPriorityAction(params: {
  ticketId: string;
  source: TicketSource;
  priority: TicketPriority;
  explanation?: string;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireAdmin();
    const adminClient = createAdminClient();
    const table = params.source === 'dispute' ? 'match_disputes' : 'support_tickets';

    const { data: current } = await (adminClient.from(table) as any)
      .select('priority')
      .eq('id', params.ticketId)
      .single();

    await (adminClient.from(table) as any)
      .update({
        priority: params.priority,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.ticketId);

    const logPayload: any = {
      admin_id: adminUser.id,
      admin_name: adminUser.email || 'Administrator',
      action: 'priority_changed',
      previous_value: current?.priority || 'normal',
      new_value: params.priority,
      explanation: params.explanation || `Priority changed to ${params.priority}`,
    };

    if (params.source === 'dispute') {
      logPayload.dispute_id = params.ticketId;
    } else {
      logPayload.ticket_id = params.ticketId;
    }

    await (adminClient.from('ticket_audit_logs') as any).insert(logPayload);

    revalidatePath('/admin/tickets');
    revalidatePath(`/admin/tickets/${params.ticketId}`);
    revalidatePath('/admin/dashboard');

    return { success: true, message: `Priority updated to ${params.priority.toUpperCase()}.` };
  } catch (err: any) {
    console.error('updateTicketPriorityAction error:', err);
    return { success: false, error: err.message || 'Failed to update priority.' };
  }
}

/**
 * Updates the status lifecycle of a ticket or dispute
 */
export async function updateTicketStatusAction(params: {
  ticketId: string;
  source: TicketSource;
  status: TicketStatus;
  explanation?: string;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireAdmin();
    const adminClient = createAdminClient();
    const table = params.source === 'dispute' ? 'match_disputes' : 'support_tickets';

    const { data: current } = await (adminClient.from(table) as any)
      .select('status')
      .eq('id', params.ticketId)
      .single();

    await (adminClient.from(table) as any)
      .update({
        status: params.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.ticketId);

    const logPayload: any = {
      admin_id: adminUser.id,
      admin_name: adminUser.email || 'Administrator',
      action: 'status_changed',
      previous_value: current?.status || 'open',
      new_value: params.status,
      explanation: params.explanation || `Status changed to ${params.status}`,
    };

    if (params.source === 'dispute') {
      logPayload.dispute_id = params.ticketId;
    } else {
      logPayload.ticket_id = params.ticketId;
    }

    await (adminClient.from('ticket_audit_logs') as any).insert(logPayload);

    revalidatePath('/admin/tickets');
    revalidatePath(`/admin/tickets/${params.ticketId}`);
    revalidatePath('/admin/dashboard');

    return { success: true, message: `Status updated to ${params.status.replace(/_/g, ' ').toUpperCase()}.` };
  } catch (err: any) {
    console.error('updateTicketStatusAction error:', err);
    return { success: false, error: err.message || 'Failed to update status.' };
  }
}

/**
 * Sends a conversation message (player response, admin reply, evidence request, or internal note)
 */
export async function sendTicketMessageAction(params: {
  ticketId: string;
  source: TicketSource;
  message: string;
  isInternal?: boolean;
  evidenceUrl?: string;
  evidencePublicId?: string;
  requestEvidence?: boolean;
}): Promise<ActionResult> {
  try {
    const message = params.message?.trim();
    if (!message) {
      return { success: false, error: 'Message cannot be empty.' };
    }

    const { user: authUser, isAdmin } = await getAuthenticatedUser();
    if (!authUser) {
      return { success: false, error: 'Authentication required to post message.' };
    }

    const adminClient = createAdminClient();

    // Strict Player Authorization: verify player owns the ticket or is a match participant
    if (!isAdmin) {
      if (params.source === 'dispute') {
        const { data: dispute } = await (adminClient.from('match_disputes') as any)
          .select('reporter_participant_id, opponent_participant_id')
          .eq('id', params.ticketId)
          .maybeSingle();

        if (!dispute) {
          return { success: false, error: 'Match dispute not found.' };
        }

        const partIds = [dispute.reporter_participant_id, dispute.opponent_participant_id].filter(Boolean);
        const { data: parts } = await (adminClient.from('participants') as any)
          .select('user_id')
          .in('id', partIds);

        const isParticipant = (parts || []).some((p: any) => p.user_id === authUser.id);
        if (!isParticipant) {
          return { success: false, error: 'Unauthorized: You are not a participant in this match dispute.' };
        }
      } else {
        const { data: ticket } = await (adminClient.from('support_tickets') as any)
          .select('user_id')
          .eq('id', params.ticketId)
          .maybeSingle();

        if (!ticket) {
          return { success: false, error: 'Support ticket not found.' };
        }
        if (ticket.user_id !== authUser.id) {
          return { success: false, error: 'Unauthorized: You do not have permission to message on this ticket.' };
        }
      }
    }

    // Internal notes can ONLY be authored by admins
    const isInternal = Boolean(params.isInternal && isAdmin);
    const senderRole = isAdmin ? 'admin' : 'player';
    const senderName = isAdmin ? 'Tournament Administrator' : (authUser.user_metadata?.full_name || 'Player');

    const msgPayload: any = {
      sender_id: authUser.id,
      sender_role: senderRole,
      sender_name: senderName,
      message,
      is_internal: isInternal,
      evidence_url: params.evidenceUrl || null,
      evidence_public_id: params.evidencePublicId || null,
    };

    if (params.source === 'dispute') {
      msgPayload.dispute_id = params.ticketId;
    } else {
      msgPayload.ticket_id = params.ticketId;
    }

    const { error: msgErr } = await (adminClient.from('ticket_messages') as any).insert(msgPayload);
    if (msgErr) {
      console.error('sendTicketMessageAction message insert error:', msgErr);
      return { success: false, error: msgErr.message || 'Failed to deliver message.' };
    }

    // Lifecycle state transition based on message context
    const table = params.source === 'dispute' ? 'match_disputes' : 'support_tickets';

    if (isAdmin && params.requestEvidence) {
      // Admin requests evidence: move to WAITING_FOR_PLAYER
      await (adminClient.from(table) as any)
        .update({
          status: 'waiting_for_player',
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.ticketId);

      const logPayload: any = {
        admin_id: authUser.id,
        admin_name: authUser.email,
        action: 'evidence_requested',
        previous_value: null,
        new_value: 'waiting_for_player',
        explanation: 'Admin requested additional screenshot evidence / details from player.',
      };
      if (params.source === 'dispute') logPayload.dispute_id = params.ticketId;
      else logPayload.ticket_id = params.ticketId;
      await (adminClient.from('ticket_audit_logs') as any).insert(logPayload);
    } else if (!isAdmin) {
      // Player responded: move ticket to pending_review for renewed admin attention
      await (adminClient.from(table) as any)
        .update({
          status: 'pending_review',
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.ticketId);
    } else {
      // Regular admin update timestamp
      await (adminClient.from(table) as any)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', params.ticketId);
    }

    revalidatePath('/admin/tickets');
    revalidatePath(`/admin/tickets/${params.ticketId}`);
    revalidatePath('/dashboard/tickets');
    revalidatePath(`/dashboard/tickets/${params.ticketId}`);

    return {
      success: true,
      message: isInternal
        ? 'Internal note saved securely (never visible to player).'
        : 'Message delivered to conversation thread.',
    };
  } catch (err: any) {
    console.error('sendTicketMessageAction error:', err);
    return { success: false, error: err.message || 'Failed to deliver message.' };
  }
}

/**
 * Resolves a ticket or dispute with comprehensive notes and optional match adjudication
 */
export async function resolveTicketAction(params: {
  ticketId: string;
  source: TicketSource;
  resolutionNotes: string;
  matchDecision?: 'approve_walkover' | 'reject_walkover' | 'reschedule' | 'dismiss' | 'resolve_with_scores';
  winnerParticipantId?: string;
  scoreA?: number;
  scoreB?: number;
  newKickoffTime?: string;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireAdmin();
    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    if (params.source === 'dispute') {
      const { data: dispute } = await (adminClient.from('match_disputes') as any)
        .select('*')
        .eq('id', params.ticketId)
        .single();

      if (!dispute) {
        return { success: false, error: 'Match dispute record not found.' };
      }

      // If a match determination decision is provided, trigger the match result engine
      if (params.matchDecision) {
        const res = await resolveDisputeAction({
          disputeId: params.ticketId,
          matchId: dispute.match_id,
          tournamentId: dispute.tournament_id,
          decision: params.matchDecision,
          winnerParticipantId: params.winnerParticipantId,
          scoreA: params.scoreA,
          scoreB: params.scoreB,
          adminNotes: params.resolutionNotes,
          newScheduledTime: params.newKickoffTime,
        });

        if (!res.success) {
          return { success: false, error: res.error || 'Failed to adjudicate match.' };
        }
      } else {
        await (adminClient.from('match_disputes') as any)
          .update({
            status: 'resolved',
            admin_notes: params.resolutionNotes,
            resolved_by: adminUser.id,
            resolved_at: now,
            updated_at: now,
          })
          .eq('id', params.ticketId);
      }

      await (adminClient.from('ticket_audit_logs') as any).insert({
        dispute_id: params.ticketId,
        admin_id: adminUser.id,
        admin_name: adminUser.email,
        action: 'ticket_resolved',
        previous_value: dispute.status,
        new_value: 'resolved',
        explanation: params.resolutionNotes || 'Dispute resolved by administrator.',
      });
    } else {
      const { data: ticket } = await (adminClient.from('support_tickets') as any)
        .select('*')
        .eq('id', params.ticketId)
        .single();

      if (!ticket) {
        return { success: false, error: 'Support ticket record not found.' };
      }

      await (adminClient.from('support_tickets') as any)
        .update({
          status: 'resolved',
          resolution_notes: params.resolutionNotes,
          resolved_by: adminUser.id,
          resolved_at: now,
          updated_at: now,
        })
        .eq('id', params.ticketId);

      await (adminClient.from('ticket_audit_logs') as any).insert({
        ticket_id: params.ticketId,
        admin_id: adminUser.id,
        admin_name: adminUser.email,
        action: 'ticket_resolved',
        previous_value: ticket.status,
        new_value: 'resolved',
        explanation: params.resolutionNotes || 'Ticket resolved by administrator.',
      });
    }

    revalidatePath('/admin/tickets');
    revalidatePath(`/admin/tickets/${params.ticketId}`);
    revalidatePath('/admin/dashboard');
    revalidatePath('/dashboard/tickets');

    return { success: true, message: 'Ticket resolved successfully.' };
  } catch (err: any) {
    console.error('resolveTicketAction error:', err);
    return { success: false, error: err.message || 'Failed to resolve ticket.' };
  }
}

/**
 * Rejects a ticket or dispute with a mandatory explanation
 */
export async function rejectTicketAction(params: {
  ticketId: string;
  source: TicketSource;
  rejectionReason: string;
}): Promise<ActionResult> {
  try {
    const reason = params.rejectionReason?.trim();
    if (!reason || reason.length < 5) {
      return { success: false, error: 'A mandatory rejection reason is required (minimum 5 characters).' };
    }

    const { user: adminUser } = await requireAdmin();
    const adminClient = createAdminClient();
    const table = params.source === 'dispute' ? 'match_disputes' : 'support_tickets';
    const now = new Date().toISOString();

    const { data: current } = await (adminClient.from(table) as any)
      .select('status')
      .eq('id', params.ticketId)
      .single();

    await (adminClient.from(table) as any)
      .update({
        status: 'rejected',
        rejection_reason: reason,
        updated_at: now,
      })
      .eq('id', params.ticketId);

    const logPayload: any = {
      admin_id: adminUser.id,
      admin_name: adminUser.email,
      action: 'ticket_rejected',
      previous_value: current?.status || 'open',
      new_value: 'rejected',
      explanation: reason,
    };

    if (params.source === 'dispute') logPayload.dispute_id = params.ticketId;
    else logPayload.ticket_id = params.ticketId;

    await (adminClient.from('ticket_audit_logs') as any).insert(logPayload);

    // Also add system notice to conversation thread
    const msgPayload: any = {
      sender_id: adminUser.id,
      sender_role: 'system',
      sender_name: 'System Notification',
      message: `Ticket rejected by Administrator. Reason: ${reason}`,
      is_internal: false,
    };
    if (params.source === 'dispute') msgPayload.dispute_id = params.ticketId;
    else msgPayload.ticket_id = params.ticketId;
    await (adminClient.from('ticket_messages') as any).insert(msgPayload);

    revalidatePath('/admin/tickets');
    revalidatePath(`/admin/tickets/${params.ticketId}`);
    revalidatePath('/admin/dashboard');
    revalidatePath('/dashboard/tickets');

    return { success: true, message: 'Ticket rejected and explanation logged.' };
  } catch (err: any) {
    console.error('rejectTicketAction error:', err);
    return { success: false, error: err.message || 'Failed to reject ticket.' };
  }
}

/**
 * Reopens a previously resolved or rejected ticket
 */
export async function reopenTicketAction(params: {
  ticketId: string;
  source: TicketSource;
  explanation: string;
}): Promise<ActionResult> {
  try {
    const explanation = params.explanation?.trim() || 'Ticket reopened for further investigation.';
    const { user: adminUser } = await requireAdmin();
    const adminClient = createAdminClient();
    const table = params.source === 'dispute' ? 'match_disputes' : 'support_tickets';
    const now = new Date().toISOString();

    const { data: current } = await (adminClient.from(table) as any)
      .select('status')
      .eq('id', params.ticketId)
      .single();

    await (adminClient.from(table) as any)
      .update({
        status: 'under_investigation',
        resolved_at: null,
        resolved_by: null,
        updated_at: now,
      })
      .eq('id', params.ticketId);

    const logPayload: any = {
      admin_id: adminUser.id,
      admin_name: adminUser.email,
      action: 'ticket_reopened',
      previous_value: current?.status || 'resolved',
      new_value: 'under_investigation',
      explanation,
    };

    if (params.source === 'dispute') logPayload.dispute_id = params.ticketId;
    else logPayload.ticket_id = params.ticketId;

    await (adminClient.from('ticket_audit_logs') as any).insert(logPayload);

    revalidatePath('/admin/tickets');
    revalidatePath(`/admin/tickets/${params.ticketId}`);
    revalidatePath('/admin/dashboard');

    return { success: true, message: 'Ticket reopened and placed under investigation.' };
  } catch (err: any) {
    console.error('reopenTicketAction error:', err);
    return { success: false, error: err.message || 'Failed to reopen ticket.' };
  }
}

/**
 * Bulk assigns multiple tickets to an administrator
 */
export async function bulkAssignTicketsAction(params: {
  tickets: { id: string; source: TicketSource }[];
  adminId: string | null;
  adminEmail?: string | null;
  explanation?: string;
}): Promise<ActionResult<{ updatedCount: number }>> {
  try {
    const { user: adminUser } = await requireAdmin();
    if (!params.tickets || params.tickets.length === 0) {
      return { success: false, error: 'No tickets selected.' };
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();
    let updatedCount = 0;

    for (const t of params.tickets) {
      const table = t.source === 'dispute' ? 'match_disputes' : 'support_tickets';
      await (adminClient.from(table) as any)
        .update({
          assigned_admin_id: params.adminId || null,
          updated_at: now,
        })
        .eq('id', t.id);

      const logPayload: any = {
        admin_id: adminUser.id,
        admin_name: adminUser.email,
        action: 'bulk_admin_assigned',
        previous_value: null,
        new_value: params.adminEmail || params.adminId || 'unassigned',
        explanation: params.explanation || `Bulk assigned to ${params.adminEmail || 'admin'}`,
      };
      if (t.source === 'dispute') logPayload.dispute_id = t.id;
      else logPayload.ticket_id = t.id;
      await (adminClient.from('ticket_audit_logs') as any).insert(logPayload);
      updatedCount++;
    }

    revalidatePath('/admin/tickets');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      data: { updatedCount },
      message: `Successfully assigned ${updatedCount} ticket(s) to ${params.adminEmail || 'administrator'}.`,
    };
  } catch (err: any) {
    console.error('bulkAssignTicketsAction error:', err);
    return { success: false, error: err.message || 'Failed to bulk assign tickets.' };
  }
}

/**
 * Bulk updates the priority of multiple tickets
 */
export async function bulkUpdateTicketPriorityAction(params: {
  tickets: { id: string; source: TicketSource }[];
  priority: TicketPriority;
  explanation?: string;
}): Promise<ActionResult<{ updatedCount: number }>> {
  try {
    const { user: adminUser } = await requireAdmin();
    if (!params.tickets || params.tickets.length === 0) {
      return { success: false, error: 'No tickets selected.' };
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();
    let updatedCount = 0;

    for (const t of params.tickets) {
      const table = t.source === 'dispute' ? 'match_disputes' : 'support_tickets';
      await (adminClient.from(table) as any)
        .update({
          priority: params.priority,
          updated_at: now,
        })
        .eq('id', t.id);

      const logPayload: any = {
        admin_id: adminUser.id,
        admin_name: adminUser.email,
        action: 'bulk_priority_changed',
        previous_value: null,
        new_value: params.priority,
        explanation: params.explanation || `Bulk priority changed to ${params.priority}`,
      };
      if (t.source === 'dispute') logPayload.dispute_id = t.id;
      else logPayload.ticket_id = t.id;
      await (adminClient.from('ticket_audit_logs') as any).insert(logPayload);
      updatedCount++;
    }

    revalidatePath('/admin/tickets');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      data: { updatedCount },
      message: `Priority updated to ${params.priority.toUpperCase()} for ${updatedCount} ticket(s).`,
    };
  } catch (err: any) {
    console.error('bulkUpdateTicketPriorityAction error:', err);
    return { success: false, error: err.message || 'Failed to bulk update priority.' };
  }
}

/**
 * Bulk updates the status of multiple tickets
 */
export async function bulkUpdateTicketStatusAction(params: {
  tickets: { id: string; source: TicketSource }[];
  status: TicketStatus;
  explanation?: string;
}): Promise<ActionResult<{ updatedCount: number }>> {
  try {
    const { user: adminUser } = await requireAdmin();
    if (!params.tickets || params.tickets.length === 0) {
      return { success: false, error: 'No tickets selected.' };
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();
    let updatedCount = 0;

    for (const t of params.tickets) {
      const table = t.source === 'dispute' ? 'match_disputes' : 'support_tickets';
      const updateData: any = {
        status: params.status,
        updated_at: now,
      };
      if (params.status === 'resolved' || params.status === 'closed') {
        updateData.resolved_at = now;
        updateData.resolved_by = adminUser.id;
        updateData.resolution_notes = params.explanation || 'Bulk resolved by administrator.';
      }

      await (adminClient.from(table) as any).update(updateData).eq('id', t.id);

      const logPayload: any = {
        admin_id: adminUser.id,
        admin_name: adminUser.email,
        action: 'bulk_status_changed',
        previous_value: null,
        new_value: params.status,
        explanation: params.explanation || `Bulk status changed to ${params.status}`,
      };
      if (t.source === 'dispute') logPayload.dispute_id = t.id;
      else logPayload.ticket_id = t.id;
      await (adminClient.from('ticket_audit_logs') as any).insert(logPayload);
      updatedCount++;
    }

    revalidatePath('/admin/tickets');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      data: { updatedCount },
      message: `Status updated to ${params.status.replace(/_/g, ' ').toUpperCase()} for ${updatedCount} ticket(s).`,
    };
  } catch (err: any) {
    console.error('bulkUpdateTicketStatusAction error:', err);
    return { success: false, error: err.message || 'Failed to bulk update status.' };
  }
}

/**
 * Escalates a ticket to senior operations with urgent priority and internal audit
 */
export async function escalateTicketAction(params: {
  ticketId: string;
  source: TicketSource;
  reason: string;
}): Promise<ActionResult> {
  try {
    const { user: adminUser } = await requireAdmin();
    const reason = params.reason?.trim();
    if (!reason) {
      return { success: false, error: 'Escalation reason is required.' };
    }

    const adminClient = createAdminClient();
    const table = params.source === 'dispute' ? 'match_disputes' : 'support_tickets';
    const now = new Date().toISOString();

    await (adminClient.from(table) as any)
      .update({
        priority: 'urgent',
        status: 'under_investigation',
        updated_at: now,
      })
      .eq('id', params.ticketId);

    const logPayload: any = {
      admin_id: adminUser.id,
      admin_name: adminUser.email,
      action: 'ticket_escalated',
      previous_value: null,
      new_value: 'urgent',
      explanation: `Escalated by ${adminUser.email}: ${reason}`,
    };
    if (params.source === 'dispute') logPayload.dispute_id = params.ticketId;
    else logPayload.ticket_id = params.ticketId;
    await (adminClient.from('ticket_audit_logs') as any).insert(logPayload);

    // Add internal note to conversation thread
    const notePayload: any = {
      sender_id: adminUser.id,
      sender_role: 'admin',
      sender_name: 'Lead Operations',
      message: `🚨 TICKET ESCALATED TO LEAD OPERATIONS: ${reason}`,
      is_internal: true,
    };
    if (params.source === 'dispute') notePayload.dispute_id = params.ticketId;
    else notePayload.ticket_id = params.ticketId;
    await (adminClient.from('ticket_messages') as any).insert(notePayload);

    revalidatePath('/admin/tickets');
    revalidatePath(`/admin/tickets/${params.ticketId}`);
    revalidatePath('/admin/dashboard');

    return { success: true, message: 'Ticket escalated to senior administrator and flagged URGENT.' };
  } catch (err: any) {
    console.error('escalateTicketAction error:', err);
    return { success: false, error: err.message || 'Failed to escalate ticket.' };
  }
}
