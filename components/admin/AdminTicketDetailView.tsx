'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ShieldAlert,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Send,
  Lock,
  MessageSquare,
  FileText,
  ExternalLink,
  History,
  Swords,
  Trophy,
  ZoomIn,
  Sparkles,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';
import type { UnifiedTicket, TicketMessage, TicketAuditLog, TicketStatus, TicketPriority } from '@/types/tickets';
import {
  sendTicketMessageAction,
  updateTicketStatusAction,
  updateTicketPriorityAction,
  assignTicketAction,
  resolveTicketAction,
  rejectTicketAction,
  reopenTicketAction,
  escalateTicketAction,
} from '@/app/actions/ticketActions';

interface AdminTicketDetailViewProps {
  ticket: UnifiedTicket;
  messages: TicketMessage[];
  auditLogs: TicketAuditLog[];
  adminEmail: string;
}

export default function AdminTicketDetailView({
  ticket,
  messages,
  auditLogs,
  adminEmail,
}: AdminTicketDetailViewProps) {
  const router = useRouter();

  // Composer State
  const [composerTab, setComposerTab] = useState<'reply' | 'evidence_request' | 'internal_note'>('reply');
  const [messageText, setMessageText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Resolution Form
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [matchDecision, setMatchDecision] = useState<
    'approve_walkover' | 'reject_walkover' | 'reschedule' | 'dismiss' | 'resolve_with_scores'
  >('resolve_with_scores');
  const [winnerParticipantId, setWinnerParticipantId] = useState(ticket.player_id || '');
  const [scoreA, setScoreA] = useState(String(ticket.reporter_score_a ?? 0));
  const [scoreB, setScoreB] = useState(String(ticket.reporter_score_b ?? 0));
  const [newKickoffTime, setNewKickoffTime] = useState('');

  // Rejection Form
  const [rejectionReason, setRejectionReason] = useState('');

  // Status / Priority inline state
  const [currentPriority, setCurrentPriority] = useState<TicketPriority>(ticket.priority);
  const [currentStatus, setCurrentStatus] = useState<TicketStatus>(ticket.status);
  const [assigneeEmail, setAssigneeEmail] = useState(ticket.assigned_admin_email || adminEmail);

  // Send message handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    try {
      setIsSubmitting(true);
      setFeedback(null);

      const isInternal = composerTab === 'internal_note';
      const requestEvidence = composerTab === 'evidence_request';

      const res = await sendTicketMessageAction({
        ticketId: ticket.id,
        source: ticket.source,
        message: messageText.trim(),
        isInternal,
        requestEvidence,
      });

      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Message posted successfully.' });
        setMessageText('');
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to send message.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'An error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resolve Ticket handler
  const handleResolveSubmit = async () => {
    try {
      setIsSubmitting(true);
      setFeedback(null);

      const res = await resolveTicketAction({
        ticketId: ticket.id,
        source: ticket.source,
        resolutionNotes,
        matchDecision: ticket.source === 'dispute' ? matchDecision : undefined,
        winnerParticipantId: ticket.source === 'dispute' ? winnerParticipantId : undefined,
        scoreA: ticket.source === 'dispute' ? parseInt(scoreA, 10) || 0 : undefined,
        scoreB: ticket.source === 'dispute' ? parseInt(scoreB, 10) || 0 : undefined,
        newKickoffTime: ticket.source === 'dispute' ? newKickoffTime : undefined,
      });

      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Ticket resolved successfully.' });
        setIsResolveModalOpen(false);
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to resolve ticket.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reject Ticket handler
  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      setFeedback({ type: 'error', message: 'Rejection reason is mandatory.' });
      return;
    }

    try {
      setIsSubmitting(true);
      setFeedback(null);

      const res = await rejectTicketAction({
        ticketId: ticket.id,
        source: ticket.source,
        rejectionReason: rejectionReason.trim(),
      });

      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Ticket rejected successfully.' });
        setIsRejectModalOpen(false);
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to reject ticket.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reopen Ticket handler
  const handleReopenSubmit = async () => {
    try {
      setIsSubmitting(true);
      setFeedback(null);

      const res = await reopenTicketAction({
        ticketId: ticket.id,
        source: ticket.source,
        explanation: 'Reopened by Administrator for further investigation.',
      });

      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Ticket reopened.' });
        setIsReopenModalOpen(false);
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to reopen ticket.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Escalate Ticket handler
  const handleEscalateSubmit = async () => {
    if (!escalateReason.trim()) {
      setFeedback({ type: 'error', message: 'Escalation reason is required.' });
      return;
    }
    try {
      setIsSubmitting(true);
      setFeedback(null);
      const res = await escalateTicketAction({
        ticketId: ticket.id,
        source: ticket.source,
        reason: escalateReason.trim(),
      });
      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Ticket escalated successfully.' });
        setIsEscalateModalOpen(false);
        setCurrentPriority('urgent');
        setCurrentStatus('under_investigation');
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to escalate ticket.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status change handler
  const handleStatusChange = async (newStatus: TicketStatus) => {
    setCurrentStatus(newStatus);
    try {
      const res = await updateTicketStatusAction({
        ticketId: ticket.id,
        source: ticket.source,
        status: newStatus,
        explanation: `Status updated to ${newStatus}`,
      });
      if (res.success) {
        setFeedback({ type: 'success', message: `Status updated to ${newStatus.toUpperCase()}` });
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to update status' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  // Priority change handler
  const handlePriorityChange = async (newPriority: TicketPriority) => {
    setCurrentPriority(newPriority);
    try {
      const res = await updateTicketPriorityAction({
        ticketId: ticket.id,
        source: ticket.source,
        priority: newPriority,
        explanation: `Priority changed to ${newPriority}`,
      });
      if (res.success) {
        setFeedback({ type: 'success', message: `Priority set to ${newPriority.toUpperCase()}` });
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to update priority' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  // Assign admin handler
  const handleAssignSubmit = async () => {
    try {
      const res = await assignTicketAction({
        ticketId: ticket.id,
        source: ticket.source,
        adminId: assigneeEmail ? 'admin' : null,
        adminEmail: assigneeEmail,
        explanation: `Assigned to ${assigneeEmail}`,
      });
      if (res.success) {
        setFeedback({ type: 'success', message: 'Assigned successfully.' });
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to assign' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const isClosed = currentStatus === 'resolved' || currentStatus === 'rejected' || currentStatus === 'closed';

  return (
    <div className="space-y-6 text-white pb-16">
      {/* Top Navigation & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-full border-white/20 bg-[#0A0A7A] hover:bg-white/10 text-white text-xs font-bold"
          >
            <Link href="/admin/tickets">
              <ChevronLeft className="h-4 w-4 mr-1" />
              <span>Back to Tickets</span>
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xl sm:text-2xl font-black text-[#FFFF00]">
              {ticket.ticket_number}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/80 text-[10px] font-black uppercase tracking-wider">
              {ticket.source === 'dispute' ? '⚔️ Match Dispute' : '💬 Support Ticket'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Badge */}
          <Badge
            className={`text-xs font-black uppercase tracking-wider px-3 py-1 ${
              currentStatus === 'resolved'
                ? 'bg-[#00C853] text-black font-black'
                : currentStatus === 'rejected'
                ? 'bg-[#FF3B30] text-white'
                : currentStatus === 'waiting_for_player'
                ? 'bg-[#FFFF00] text-[#08088F]'
                : currentStatus === 'under_investigation'
                ? 'bg-[#38BDF8] text-black'
                : 'bg-[#FF9500] text-black'
            }`}
          >
            {currentStatus.replace(/_/g, ' ')}
          </Badge>

          {/* Priority Badge */}
          <Badge
            className={`text-xs font-black uppercase tracking-wider px-3 py-1 ${
              currentPriority === 'urgent'
                ? 'bg-[#FF3B30] text-white'
                : currentPriority === 'high'
                ? 'bg-[#FF9500] text-black font-bold'
                : 'bg-white/15 text-white'
            }`}
          >
            {currentPriority} Priority
          </Badge>

          {/* Quick Resolve / Reopen CTA */}
          {!isClosed ? (
            <Button
              onClick={() => setIsResolveModalOpen(true)}
              size="sm"
              className="rounded-full bg-[#00C853] hover:bg-[#00C853]/90 text-black font-black text-xs uppercase tracking-wider gap-1.5 cursor-pointer shadow-lg"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Resolve Ticket</span>
            </Button>
          ) : (
            <Button
              onClick={() => setIsReopenModalOpen(true)}
              size="sm"
              variant="outline"
              className="rounded-full border-[#FFFF00] text-[#FFFF00] hover:bg-[#FFFF00]/10 font-black text-xs uppercase tracking-wider gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reopen Ticket</span>
            </Button>
          )}

          {!isClosed && (
            <Button
              onClick={() => setIsRejectModalOpen(true)}
              size="sm"
              variant="outline"
              className="rounded-full border-[#FF3B30] text-[#FF3B30] hover:bg-[#FF3B30]/10 font-black text-xs uppercase tracking-wider gap-1.5"
            >
              <XCircle className="h-4 w-4" />
              <span>Reject</span>
            </Button>
          )}
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between text-xs font-bold animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-[#00C853]/20 border border-[#00C853]/40 text-[#00C853]'
              : 'bg-[#FF3B30]/20 border border-[#FF3B30]/40 text-[#FF3B30]'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-white/60 hover:text-white">✕</button>
        </div>
      )}

      {/* Two-Column Investigation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Investigation Dossier & Conversation (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Ticket Information Overview Card */}
          <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] p-6 shadow-xl text-white">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-[#FFFF00]">
                    <span>Category:</span>
                    <span className="font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#0A0A7A] border border-white/15">
                      {ticket.category.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black font-display uppercase tracking-wide text-white mt-1.5">
                    {ticket.subject}
                  </h2>
                </div>

                <div className="text-right text-[11px] text-white/60 space-y-0.5">
                  <p>Filed: <span className="text-white font-medium">{formatDate(ticket.created_at)}</span></p>
                  <p>Last Active: <span className="text-white font-medium">{formatDate(ticket.updated_at)}</span></p>
                </div>
              </div>

              {/* Description Body */}
              <div className="rounded-2xl bg-[#0A0A7A] border border-white/15 p-4 text-xs leading-relaxed text-white/90">
                <p className="font-bold uppercase tracking-wider text-[11px] text-white/50 mb-1">
                  Official Statement / Description:
                </p>
                <div className="whitespace-pre-wrap">{ticket.description}</div>
              </div>

              {/* Rejection / Resolution Notes Banner if applicable */}
              {ticket.resolution_notes && (
                <div className="rounded-2xl bg-[#00C853]/15 border border-[#00C853]/40 p-4 text-xs text-[#00C853] space-y-1">
                  <div className="flex items-center gap-2 font-black uppercase tracking-wider text-[11px]">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Official Resolution Decision</span>
                  </div>
                  <p className="text-white/90">{ticket.resolution_notes}</p>
                </div>
              )}

              {ticket.rejection_reason && (
                <div className="rounded-2xl bg-[#FF3B30]/15 border border-[#FF3B30]/40 p-4 text-xs text-[#FF3B30] space-y-1">
                  <div className="flex items-center gap-2 font-black uppercase tracking-wider text-[11px]">
                    <XCircle className="h-4 w-4" />
                    <span>Mandatory Rejection Explanation</span>
                  </div>
                  <p className="text-white/90">{ticket.rejection_reason}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Related Match & Tournament Context Card */}
          {(ticket.match_id || ticket.tournament_name) && (
            <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] p-6 shadow-xl text-white">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Swords className="h-5 w-5 text-[#FFFF00]" />
                  <h3 className="text-sm font-black uppercase tracking-wider">
                    Match & Tournament Operational Context
                  </h3>
                </div>
                {ticket.tournament_id && (
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs font-bold text-[#FFFF00] hover:bg-white/10 rounded-full"
                  >
                    <Link href={`/admin/tournaments/${ticket.tournament_id}`}>
                      <span>Tournament Desk</span>
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Tournament</span>
                  <p className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Trophy className="h-4 w-4 text-[#FFFF00]" />
                    <span>{ticket.tournament_name || 'Tournament'}</span>
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Match ID</span>
                  <p className="text-xs font-mono font-bold text-[#FFFF00] truncate">
                    {ticket.match_id || 'Not match-scoped'}
                  </p>
                </div>

                {ticket.opponent_name && (
                  <div className="sm:col-span-2 p-4 rounded-2xl bg-[#0A0A7A] border border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">
                        Contested Opponent
                      </span>
                      <p className="text-sm font-bold text-white mt-0.5">{ticket.opponent_name}</p>
                      {ticket.opponent_efootball_id && (
                        <p className="text-xs text-white/60 font-mono">eF ID: {ticket.opponent_efootball_id}</p>
                      )}
                    </div>

                    {(ticket.reporter_score_a !== null || ticket.reporter_score_b !== null) && (
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF9500] block">
                          Reported Scores
                        </span>
                        <p className="text-base font-black font-mono text-[#FFFF00]">
                          {ticket.reporter_score_a ?? 0} — {ticket.reporter_score_b ?? 0}
                        </p>
                        {ticket.opponent_score_a !== null && (
                          <p className="text-[10px] text-white/60 font-mono">
                            Opponent claim: {ticket.opponent_score_a} - {ticket.opponent_score_b}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Match Kickoff & Start Timestamps */}
                {ticket.match_scheduled_time && (
                  <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Scheduled Kickoff</span>
                    <p className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-[#FFFF00]" />
                      <span>{formatDate(ticket.match_scheduled_time)}</span>
                    </p>
                  </div>
                )}

                {ticket.match_actual_start_time && (
                  <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Actual Start Time</span>
                    <p className="text-xs font-mono font-bold text-[#00C853] flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#00C853]" />
                      <span>{formatDate(ticket.match_actual_start_time)}</span>
                    </p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Evidence & Screenshot Inspector Card */}
          {(ticket.evidence_url || ticket.reporter_screenshot_url || ticket.opponent_screenshot_url) && (
            <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] p-6 shadow-xl text-white">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-[#FFFF00]" />
                  <h3 className="text-sm font-black uppercase tracking-wider">
                    Uploaded Evidence & Match Screenshots
                  </h3>
                </div>
                <span className="text-xs font-bold text-[#00C853]">Cloudinary Secured Storage</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {ticket.reporter_screenshot_url && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-white/70 block">
                      Reporter Screenshot Evidence:
                    </span>
                    <div
                      onClick={() => setImagePreviewUrl(ticket.reporter_screenshot_url!)}
                      className="group relative aspect-video rounded-2xl overflow-hidden bg-[#0A0A7A] border border-white/20 cursor-pointer"
                    >
                      <Image
                        src={ticket.reporter_screenshot_url}
                        alt="Reporter Screenshot"
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-xs font-bold text-[#FFFF00]">
                        <ZoomIn className="h-4 w-4" />
                        <span>Inspect Full Image</span>
                      </div>
                    </div>
                  </div>
                )}

                {ticket.opponent_screenshot_url && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-white/70 block">
                      Opponent Counter-Evidence:
                    </span>
                    <div
                      onClick={() => setImagePreviewUrl(ticket.opponent_screenshot_url!)}
                      className="group relative aspect-video rounded-2xl overflow-hidden bg-[#0A0A7A] border border-white/20 cursor-pointer"
                    >
                      <Image
                        src={ticket.opponent_screenshot_url}
                        alt="Opponent Screenshot"
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-xs font-bold text-[#FFFF00]">
                        <ZoomIn className="h-4 w-4" />
                        <span>Inspect Full Image</span>
                      </div>
                    </div>
                  </div>
                )}

                {ticket.evidence_url &&
                  ticket.evidence_url !== ticket.reporter_screenshot_url &&
                  ticket.evidence_url !== ticket.opponent_screenshot_url && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-white/70 block">
                        General Attachment:
                      </span>
                      <div
                        onClick={() => setImagePreviewUrl(ticket.evidence_url!)}
                        className="group relative aspect-video rounded-2xl overflow-hidden bg-[#0A0A7A] border border-white/20 cursor-pointer"
                      >
                        <Image
                          src={ticket.evidence_url}
                          alt="Ticket Attachment"
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-xs font-bold text-[#FFFF00]">
                          <ZoomIn className="h-4 w-4" />
                          <span>Inspect Full Image</span>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Cloudinary Metadata Inspector Strip */}
                {(ticket.evidence_public_id || ticket.evidence_url) && (
                  <div className="sm:col-span-2 pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-white/60">
                    <div>
                      <span>Cloudinary Asset: </span>
                      <strong className="text-[#FFFF00] font-mono">
                        {ticket.evidence_public_id || 'Uploaded Image'}
                      </strong>
                    </div>
                    {ticket.evidence_url && (
                      <a
                        href={ticket.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#FFFF00] hover:underline flex items-center gap-1 font-bold"
                      >
                        <span>Open Direct Cloudinary Asset</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Unified Conversation Timeline Card */}
          <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] p-6 shadow-xl text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-[#FFFF00]" />
                <h3 className="text-sm font-black uppercase tracking-wider">
                  Conversation Thread & Communication History
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-white/60">
                {messages.length} Messages
              </span>
            </div>

            {/* Messages Feed */}
            <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
              {messages.length === 0 ? (
                <div className="py-8 text-center text-white/50 text-xs">
                  No replies yet. Use the composer below to message the player or record an internal note.
                </div>
              ) : (
                messages.map((m) => {
                  const isAdmin = m.sender_role === 'admin';
                  const isSystem = m.sender_role === 'system';
                  const isInternal = m.is_internal;

                  if (isSystem) {
                    return (
                      <div key={m.id} className="py-2 px-4 rounded-full bg-white/10 text-center text-[11px] text-white/70 font-medium mx-auto max-w-md">
                        🔔 {m.message} • <span className="text-white/40">{formatDate(m.created_at)}</span>
                      </div>
                    );
                  }

                  if (isInternal) {
                    return (
                      <div
                        key={m.id}
                        className="p-4 rounded-2xl bg-[#0A0A7A] border-2 border-amber-400/80 shadow-md space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[11px] font-black text-amber-400 uppercase tracking-wider">
                            <Lock className="h-3.5 w-3.5" />
                            <span>INTERNAL NOTE • NOT VISIBLE TO PLAYERS</span>
                          </div>
                          <span className="text-[10px] text-white/50 font-mono">{formatDate(m.created_at)}</span>
                        </div>
                        <p className="text-xs text-white/90 whitespace-pre-wrap leading-relaxed">{m.message}</p>
                        <p className="text-[10px] text-white/40 italic">Authored by {m.sender_name}</p>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={m.id}
                      className={`p-4 rounded-2xl space-y-1.5 ${
                        isAdmin
                          ? 'bg-[#0A0A7A] border border-[#FFFF00]/40 ml-6 text-white'
                          : 'bg-[#08088F] border border-white/15 mr-6 text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`font-bold ${isAdmin ? 'text-[#FFFF00]' : 'text-white'}`}>
                          {isAdmin ? '🛡️ Operations Team' : `👤 ${m.sender_name}`}
                        </span>
                        <span className="text-white/50 font-mono text-[10px]">{formatDate(m.created_at)}</span>
                      </div>
                      <p className="text-xs text-white/90 whitespace-pre-wrap leading-relaxed">{m.message}</p>
                    </div>
                  );
                })
              )}
            </div>

            {/* Conversation Composer */}
            {!isClosed ? (
              <form onSubmit={handleSendMessage} className="space-y-3 pt-3 border-t border-white/10">
                {/* Tabs for reply mode */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setComposerTab('reply')}
                    className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-colors cursor-pointer ${
                      composerTab === 'reply'
                        ? 'bg-[#FFFF00] text-[#08088F]'
                        : 'bg-[#0A0A7A] text-white/70 hover:bg-white/10'
                    }`}
                  >
                    Reply to Player
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setComposerTab('evidence_request');
                      setMessageText(
                        'Dear player, please upload additional screenshot evidence showing the full match result screen and opponent in-game handle so our operations team can resolve this dispute.'
                      );
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-colors cursor-pointer ${
                      composerTab === 'evidence_request'
                        ? 'bg-[#FF9500] text-black font-black'
                        : 'bg-[#0A0A7A] text-white/70 hover:bg-white/10'
                    }`}
                  >
                    Request Evidence
                  </button>

                  <button
                    type="button"
                    onClick={() => setComposerTab('internal_note')}
                    className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 ${
                      composerTab === 'internal_note'
                        ? 'bg-amber-400 text-black font-black'
                        : 'bg-[#0A0A7A] text-white/70 hover:bg-white/10'
                    }`}
                  >
                    <Lock className="h-3 w-3" />
                    <span>Internal Note (Private)</span>
                  </button>
                </div>

                <textarea
                  rows={3}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder={
                    composerTab === 'internal_note'
                      ? 'Type an internal administrative note (strictly confidential, players will NEVER see this)...'
                      : composerTab === 'evidence_request'
                      ? 'Specify what screenshot evidence the player needs to upload...'
                      : 'Write a response message to the player...'
                  }
                  className={`w-full rounded-2xl p-3 text-xs text-white placeholder:text-white/40 focus:outline-none transition-colors resize-none ${
                    composerTab === 'internal_note'
                      ? 'bg-[#0A0A7A] border-2 border-amber-400 focus:ring-2 focus:ring-amber-400'
                      : 'bg-[#0A0A7A] border border-white/20 focus:ring-2 focus:ring-[#FFFF00]'
                  }`}
                />

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/50">
                    {composerTab === 'internal_note' && '🔒 Strictly private admin note'}
                    {composerTab === 'evidence_request' && '⚠️ Will place ticket into WAITING FOR PLAYER state'}
                    {composerTab === 'reply' && '✉️ Player will receive this response'}
                  </span>

                  <Button
                    type="submit"
                    disabled={isSubmitting || !messageText.trim()}
                    className="rounded-full bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] font-black text-xs uppercase tracking-wider gap-1.5 h-10 px-6"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{isSubmitting ? 'Delivering...' : 'Send Message'}</span>
                  </Button>
                </div>
              </form>
            ) : (
              <div className="p-4 rounded-2xl bg-white/5 text-center text-xs text-white/60">
                This ticket is currently <strong className="text-white uppercase">{currentStatus}</strong>. Reopen it to post further messages.
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Player Intelligence, Quick Operations & Audit Trail (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Player Intelligence Card */}
          <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] p-5 shadow-xl text-white space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-white/10">
              <User className="h-5 w-5 text-[#FFFF00]" />
              <h3 className="text-sm font-black uppercase tracking-wider">Player Dossier</h3>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00] font-black text-base overflow-hidden relative">
                {ticket.avatar_url ? (
                  <Image src={ticket.avatar_url} alt={ticket.player_name} fill className="object-cover" />
                ) : (
                  <span>{ticket.player_name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="overflow-hidden">
                <h4 className="font-bold text-white text-sm truncate">{ticket.player_name}</h4>
                {ticket.player_email && (
                  <p className="text-xs text-white/60 truncate">{ticket.player_email}</p>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/10 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-white/60">eFootball ID:</span>
                <span className="font-mono font-bold text-[#FFFF00]">
                  {ticket.efootball_id || 'Not Provided'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-white/60">WhatsApp Verified:</span>
                {ticket.whatsapp_verified ? (
                  <span className="text-[#00C853] font-bold flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                  </span>
                ) : (
                  <span className="text-[#FF9500] font-bold flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Pending / Unverified
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-white/60">Account Status:</span>
                <span
                  className={`font-bold capitalize ${
                    ticket.account_status === 'suspended' ? 'text-[#FF3B30]' : 'text-[#00C853]'
                  }`}
                >
                  {ticket.account_status || 'Active'}
                </span>
              </div>

              {/* Tournament Participation History */}
              {ticket.player_tournaments && ticket.player_tournaments.length > 0 && (
                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">
                    Tournament Participation ({ticket.player_tournaments.length})
                  </span>
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {ticket.player_tournaments.map((t) => (
                      <div key={t.id} className="text-[11px] text-[#FFFF00] font-bold flex items-center gap-1.5 truncate">
                        <Trophy className="h-3 w-3 shrink-0 text-[#FFFF00]" />
                        <span className="truncate">{t.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Previous Tickets History */}
              {ticket.player_previous_tickets && ticket.player_previous_tickets.length > 0 && (
                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">
                    Previous Inquiries ({ticket.player_previous_tickets.length})
                  </span>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {ticket.player_previous_tickets.map((pt) => (
                      <Link
                        key={pt.id}
                        href={`/admin/tickets/${pt.id}`}
                        className="block p-2 rounded-xl bg-[#0A0A7A] border border-white/10 hover:border-white/30 text-[11px] transition-colors"
                      >
                        <div className="flex items-center justify-between font-mono text-[#FFFF00]">
                          <span>{pt.ticket_number}</span>
                          <span className="text-[9px] uppercase font-bold text-white/60">{pt.status}</span>
                        </div>
                        <p className="text-white/80 truncate text-[10px] mt-0.5">{pt.subject}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Quick Operations Controls Card */}
          <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] p-5 shadow-xl text-white space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-white/10">
              <ShieldAlert className="h-5 w-5 text-[#FFFF00]" />
              <h3 className="text-sm font-black uppercase tracking-wider">Operations Desk</h3>
            </div>

            {/* Change Status */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                Ticket Status Lifecycle
              </label>
              <select
                value={currentStatus}
                onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                className="w-full h-10 px-3 text-xs bg-[#0A0A7A] border border-white/20 text-white rounded-2xl focus:outline-none"
              >
                <option value="open">OPEN</option>
                <option value="pending_review">PENDING REVIEW</option>
                <option value="under_investigation">UNDER INVESTIGATION</option>
                <option value="waiting_for_player">WAITING FOR PLAYER</option>
                <option value="resolved">RESOLVED</option>
                <option value="rejected">REJECTED</option>
                <option value="closed">CLOSED</option>
              </select>
            </div>

            {/* Change Priority */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                Priority Ranking
              </label>
              <select
                value={currentPriority}
                onChange={(e) => handlePriorityChange(e.target.value as TicketPriority)}
                className="w-full h-10 px-3 text-xs bg-[#0A0A7A] border border-white/20 text-white rounded-2xl focus:outline-none"
              >
                <option value="urgent">🔴 Urgent</option>
                <option value="high">🟠 High</option>
                <option value="normal">🟡 Normal</option>
                <option value="low">⚪ Low</option>
              </select>
            </div>

            {/* Assign Admin */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                Assigned Administrator
              </label>
              <div className="flex gap-2">
                <Input
                  value={assigneeEmail}
                  onChange={(e) => setAssigneeEmail(e.target.value)}
                  placeholder="admin@domain.com"
                  className="h-10 text-xs bg-[#0A0A7A] border-white/20 text-white rounded-2xl"
                />
                <Button
                  onClick={handleAssignSubmit}
                  size="sm"
                  variant="outline"
                  className="h-10 rounded-2xl border-white/20 text-xs font-bold"
                >
                  Save
                </Button>
              </div>
            </div>

            {/* Escalate to Senior Administrator */}
            {!isClosed && (
              <div className="pt-2 border-t border-white/10">
                <Button
                  onClick={() => setIsEscalateModalOpen(true)}
                  variant="outline"
                  size="sm"
                  className="w-full justify-center border-[#FF3B30]/40 text-[#FF3B30] hover:bg-[#FF3B30]/15 hover:border-[#FF3B30] rounded-2xl font-black text-xs uppercase tracking-wider gap-1.5 h-10 cursor-pointer"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Escalate to Senior Admin</span>
                </Button>
              </div>
            )}
          </Card>

          {/* Audit History Timeline Card */}
          <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] p-5 shadow-xl text-white space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-white/10">
              <History className="h-5 w-5 text-[#FFFF00]" />
              <h3 className="text-sm font-black uppercase tracking-wider">Action Audit Trail</h3>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1 text-xs">
              {auditLogs.length === 0 ? (
                <p className="text-white/50 text-[11px]">No audit logs recorded yet.</p>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3 rounded-xl bg-[#0A0A7A] border border-white/10 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-white/50 font-mono">
                      <span>{log.admin_name || 'System'}</span>
                      <span>{formatDate(log.created_at)}</span>
                    </div>
                    <p className="font-bold text-[#FFFF00] capitalize">{log.action.replace(/_/g, ' ')}</p>
                    {log.explanation && (
                      <p className="text-white/80 text-[11px] leading-relaxed">{log.explanation}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* RESOLUTION MODAL */}
      {isResolveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[#0A0A7A] border border-white/20 rounded-[28px] max-w-lg w-full p-6 space-y-4 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-black font-display uppercase tracking-wider text-[#00C853] flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                <span>Resolve Ticket & Adjudicate</span>
              </h3>
              <button onClick={() => setIsResolveModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            {/* Match Dispute Adjudication Options */}
            {ticket.source === 'dispute' && (
              <div className="space-y-3 bg-[#1818D4] p-4 rounded-2xl border border-white/15">
                <label className="text-xs font-bold uppercase tracking-wider text-[#FFFF00]">
                  Match Adjudication Decision:
                </label>
                <select
                  value={matchDecision}
                  onChange={(e) => setMatchDecision(e.target.value as any)}
                  className="w-full h-10 px-3 text-xs bg-[#0A0A7A] border border-white/20 text-white rounded-2xl"
                >
                  <option value="resolve_with_scores">Authoritative Scores Determination</option>
                  <option value="approve_walkover">Award Walkover (3 - 0)</option>
                  <option value="reschedule">Reschedule Match Fixture</option>
                  <option value="dismiss">Dismiss Dispute (Uphold Scheduled Match)</option>
                </select>

                {matchDecision === 'resolve_with_scores' && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-[10px] font-bold text-white/70 block mb-1">
                        {ticket.player_name} Score:
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={scoreA}
                        onChange={(e) => setScoreA(e.target.value)}
                        className="h-9 bg-[#0A0A7A] text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-white/70 block mb-1">
                        {ticket.opponent_name || 'Opponent'} Score:
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={scoreB}
                        onChange={(e) => setScoreB(e.target.value)}
                        className="h-9 bg-[#0A0A7A] text-xs font-bold"
                      />
                    </div>
                  </div>
                )}

                {matchDecision === 'approve_walkover' && (
                  <div className="pt-2">
                    <label className="text-[10px] font-bold text-white/70 block mb-1">
                      Advancing Winner:
                    </label>
                    <select
                      value={winnerParticipantId}
                      onChange={(e) => setWinnerParticipantId(e.target.value)}
                      className="w-full h-9 px-3 text-xs bg-[#0A0A7A] border border-white/20 text-white rounded-2xl"
                    >
                      <option value={ticket.player_id || ''}>{ticket.player_name} (Reporter)</option>
                      {ticket.opponent_id && (
                        <option value={ticket.opponent_id}>{ticket.opponent_name} (Opponent)</option>
                      )}
                    </select>
                  </div>
                )}

                {matchDecision === 'reschedule' && (
                  <div className="pt-2">
                    <label className="text-[10px] font-bold text-white/70 block mb-1">
                      New Kickoff Time:
                    </label>
                    <Input
                      type="datetime-local"
                      value={newKickoffTime}
                      onChange={(e) => setNewKickoffTime(e.target.value)}
                      className="h-9 bg-[#0A0A7A] text-xs font-bold text-white border-white/20"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-white/70">
                Official Resolution Notes (Visible to all participants):
              </label>
              <textarea
                rows={3}
                required
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Explain the administrative reasoning and match verdict..."
                className="w-full rounded-2xl bg-[#1818D4] border border-white/20 p-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#00C853] resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsResolveModalOpen(false)}
                className="rounded-full border-white/20 text-white"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isSubmitting}
                onClick={handleResolveSubmit}
                className="rounded-full bg-[#00C853] text-black font-black uppercase text-xs px-5 shadow-lg"
              >
                Confirm Resolution
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* REJECTION MODAL */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[#0A0A7A] border border-white/20 rounded-[28px] max-w-md w-full p-6 space-y-4 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-black font-display uppercase tracking-wider text-[#FF3B30] flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                <span>Reject Ticket</span>
              </h3>
              <button onClick={() => setIsRejectModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <p className="text-xs text-white/80">
              A mandatory rejection reason is required. This explanation will be logged and communicated directly to the player.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-white/70">
                Mandatory Rejection Explanation:
              </label>
              <textarea
                rows={3}
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Unverified screenshot submitted, score confirmed via match server telemetry, or rule violation..."
                className="w-full rounded-2xl bg-[#1818D4] border border-white/20 p-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#FF3B30] resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsRejectModalOpen(false)}
                className="rounded-full border-white/20 text-white"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isSubmitting || !rejectionReason.trim()}
                onClick={handleRejectSubmit}
                className="rounded-full bg-[#FF3B30] text-white font-black uppercase text-xs px-5 shadow-lg"
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* REOPEN MODAL */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[#0A0A7A] border border-white/20 rounded-[28px] max-w-md w-full p-6 space-y-4 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-black font-display uppercase tracking-wider text-[#FFFF00] flex items-center gap-2">
                <RotateCcw className="h-5 w-5" />
                <span>Reopen Ticket</span>
              </h3>
              <button onClick={() => setIsReopenModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <p className="text-xs text-white/80">
              Reopening this ticket will transition its status back to <strong>UNDER INVESTIGATION</strong> and record an entry in the audit trail.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReopenModalOpen(false)}
                className="rounded-full border-white/20 text-white"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isSubmitting}
                onClick={handleReopenSubmit}
                className="rounded-full bg-[#FFFF00] text-[#08088F] font-black uppercase text-xs px-5 shadow-lg"
              >
                Reopen Ticket
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ESCALATE MODAL */}
      {isEscalateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[#0A0A7A] border border-white/20 rounded-[28px] max-w-md w-full p-6 space-y-4 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-black font-display uppercase tracking-wider text-[#FF3B30] flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                <span>Escalate to Senior Admin</span>
              </h3>
              <button
                onClick={() => setIsEscalateModalOpen(false)}
                className="text-white/60 hover:text-white cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-white/80">
              Escalating this ticket will elevate its priority to <strong>URGENT</strong>, transition status to <strong>UNDER INVESTIGATION</strong>, log an internal lead operations notice, and alert senior administration.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-white/70">
                Escalation Reason / Notes:
              </label>
              <textarea
                rows={3}
                required
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                placeholder="State why this ticket requires immediate senior intervention..."
                className="w-full rounded-2xl bg-[#1818D4] border border-white/20 p-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#FF3B30] resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEscalateModalOpen(false)}
                className="rounded-full border-white/20 text-white cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isSubmitting || !escalateReason.trim()}
                onClick={handleEscalateSubmit}
                className="rounded-full bg-[#FF3B30] text-white font-black uppercase text-xs px-5 shadow-lg cursor-pointer"
              >
                Confirm Escalation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX IMAGE PREVIEW MODAL */}
      {imagePreviewUrl && (
        <div
          onClick={() => setImagePreviewUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full h-[80vh]">
            <Image
              src={imagePreviewUrl}
              alt="Evidence Full Preview"
              fill
              className="object-contain"
            />
            <button
              onClick={() => setImagePreviewUrl(null)}
              className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white px-3 py-1 rounded-full text-xs font-bold border border-white/20"
            >
              Close ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
