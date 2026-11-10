'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ShieldAlert,
  Clock,
  Swords,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Loader2,
  ExternalLink,
  MessageSquare,
  FileText,
  User,
  History,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn, formatDate } from '@/lib/utils';
import { getTournamentById, TournamentWithStats } from '@/services/tournamentService';
import {
  getTournamentDisputes,
  getMatchActivityLogs,
  MatchDisputeRecord,
  MatchActivityLogRecord,
} from '@/services/matchService';
import { resolveDisputeAction } from '@/app/actions/matchSchedulingActions';

export default function AdminDisputesDeskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  const [tournament, setTournament] = useState<TournamentWithStats | null>(null);
  const [disputes, setDisputes] = useState<MatchDisputeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Resolution modal state
  const [activeDispute, setActiveDispute] = useState<MatchDisputeRecord | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<
    'approve_walkover' | 'reject_walkover' | 'reschedule' | 'dismiss' | 'resolve_with_scores'
  >('approve_walkover');
  const [winnerParticipantId, setWinnerParticipantId] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [newKickoffTime, setNewKickoffTime] = useState<string>('');
  const [scoreA, setScoreA] = useState<string>('0');
  const [scoreB, setScoreB] = useState<string>('0');

  // Audit activity logs drawer/state
  const [auditLogsMatchId, setAuditLogsMatchId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<MatchActivityLogRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [tData, dData] = await Promise.all([
        getTournamentById(tournamentId),
        getTournamentDisputes(tournamentId),
      ]);
      setTournament(tData);
      setDisputes(dData);
    } catch (err: any) {
      console.error('Failed to load disputes:', err);
      setError(err.message || 'Failed to load disputes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tournamentId]);

  const loadAuditLogs = async (matchId: string) => {
    setAuditLogsMatchId(matchId);
    setAuditLoading(true);
    try {
      const logs = await getMatchActivityLogs(matchId);
      setAuditLogs(logs);
    } catch (err) {
      console.error('Error loading audit logs:', err);
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const filteredDisputes = disputes.filter((d) => {
    if (statusFilter === 'all') return true;
    return d.status === statusFilter;
  });

  const handleOpenResolution = (dispute: MatchDisputeRecord) => {
    setActiveDispute(dispute);
    if (dispute.reason === 'conflicting_scores' || dispute.reporter_score_a !== undefined) {
      setSelectedDecision('resolve_with_scores');
    } else {
      setSelectedDecision('approve_walkover');
    }
    setWinnerParticipantId(dispute.reporter_participant_id || '');
    setAdminNotes('');
    setNewKickoffTime('');
    setScoreA(
      dispute.reporter_score_a !== undefined && dispute.reporter_score_a !== null
        ? String(dispute.reporter_score_a)
        : '0'
    );
    setScoreB(
      dispute.reporter_score_b !== undefined && dispute.reporter_score_b !== null
        ? String(dispute.reporter_score_b)
        : '0'
    );
  };

  const handleConfirmResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDispute) return;

    setActionLoading(true);
    setFeedback(null);

    const parsedScoreA = parseInt(scoreA, 10);
    const parsedScoreB = parseInt(scoreB, 10);

    const res = await resolveDisputeAction({
      disputeId: activeDispute.id,
      matchId: activeDispute.match_id,
      tournamentId,
      decision: selectedDecision,
      winnerParticipantId: selectedDecision === 'approve_walkover' ? winnerParticipantId : undefined,
      scoreA: selectedDecision === 'resolve_with_scores' ? (isNaN(parsedScoreA) ? 0 : parsedScoreA) : undefined,
      scoreB: selectedDecision === 'resolve_with_scores' ? (isNaN(parsedScoreB) ? 0 : parsedScoreB) : undefined,
      adminNotes: adminNotes.trim() || undefined,
      newScheduledTime: selectedDecision === 'reschedule' ? new Date(newKickoffTime).toISOString() : undefined,
    });

    setActionLoading(false);

    if (!res.success) {
      setFeedback({ type: 'error', message: res.error || 'Failed to resolve dispute' });
    } else {
      setFeedback({ type: 'success', message: res.message || 'Dispute resolved successfully' });
      setActiveDispute(null);
      await loadData();
    }
  };

  if (loading) {
    return (
      <div className="min-h-[500px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-white">
          <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00]" />
          <span className="text-xs font-semibold">Loading Admin Dispute Desk...</span>
        </div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-white">{error || 'Tournament not found'}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/tournaments/${tournamentId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Link>
        </Button>
      </div>
    );
  }

  const openTicketsCount = disputes.filter((d) => d.status === 'open' || d.status === 'under_review').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <Button asChild variant="ghost" size="sm" className="gap-2 text-white/70 hover:text-white -ml-2 mb-1">
            <Link href={`/admin/tournaments/${tournamentId}/schedule`}>
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Scheduling Desk</span>
            </Link>
          </Button>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider font-display">
              Match Dispute Management Desk
            </h1>
            <Badge className="bg-rose-500 text-white font-black text-xs px-2.5 py-0.5 rounded-full">
              {openTicketsCount} Pending Review
            </Badge>
          </div>
          <p className="text-xs text-white/60 mt-1">
            Tournament: <span className="text-white font-bold">{tournament.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10 text-xs font-bold rounded-xl gap-1.5">
            <Link href={`/admin/tournaments/${tournamentId}/schedule`}>
              <Clock className="h-3.5 w-3.5 text-[#FFFF00]" />
              <span>Match Scheduler</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={cn(
            'p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold animate-in fade-in',
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          )}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="underline text-white/60 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 bg-[#0A0A7A] p-2 rounded-2xl border border-white/10 overflow-x-auto scrollbar-none">
        {[
          { id: 'open', label: 'Open Issues', count: disputes.filter((d) => d.status === 'open').length },
          { id: 'under_review', label: 'Under Review', count: disputes.filter((d) => d.status === 'under_review').length },
          { id: 'resolved', label: 'Resolved', count: disputes.filter((d) => d.status === 'resolved').length },
          { id: 'rejected', label: 'Rejected', count: disputes.filter((d) => d.status === 'rejected').length },
          { id: 'all', label: 'All Tickets', count: disputes.length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer',
              statusFilter === tab.id
                ? 'bg-[#FFFF00] text-[#08088F]'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            )}
          >
            <span>{tab.label}</span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.2 rounded-full font-black',
                statusFilter === tab.id ? 'bg-[#08088F] text-[#FFFF00]' : 'bg-white/10 text-white'
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Disputes Ticket List */}
      <div className="space-y-4">
        {filteredDisputes.length === 0 ? (
          <Card className="p-12 text-center bg-[#1818D4] border border-white/10 rounded-2xl text-white">
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-400 opacity-80 mb-2" />
            <h3 className="font-bold text-sm">No {statusFilter} dispute tickets found</h3>
            <p className="text-xs text-white/60 mt-1">All matches in this category are operating smoothly.</p>
          </Card>
        ) : (
          filteredDisputes.map((dispute) => {
            const match = dispute.match;
            const pAName = match?.participantAUser?.username || 'Player A';
            const pBName = match?.participantBUser?.username || 'Player B';
            const hasStartedA = Boolean(match?.player_a_started_at);
            const hasStartedB = Boolean(match?.player_b_started_at);

            return (
              <Card
                key={dispute.id}
                className={cn(
                  'p-5 bg-[#1818D4] border rounded-2xl text-white space-y-4 shadow-xl',
                  dispute.status === 'open' || dispute.status === 'under_review'
                    ? 'border-rose-500/60 ring-1 ring-rose-500/20'
                    : 'border-white/10'
                )}
              >
                {/* Header: Reason & Status */}
                <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-rose-500 text-white font-black text-xs uppercase px-2.5 py-0.5 border-0">
                        {dispute.reason.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-xs text-white/60 font-mono">
                        Ticket: #{dispute.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-white/60">
                        Filed {formatDate(dispute.created_at)}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white mt-1.5 flex items-center gap-2">
                      <span>Reporter: {dispute.reporterName}</span>
                      <span className="text-white/40">vs</span>
                      <span>Opponent: {dispute.opponentName}</span>
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        'text-xs font-black uppercase px-2.5 py-0.5 rounded-full border-0',
                        dispute.status === 'open'
                          ? 'bg-amber-400 text-slate-950 animate-pulse'
                          : dispute.status === 'under_review'
                          ? 'bg-blue-500 text-white'
                          : dispute.status === 'resolved'
                          ? 'bg-emerald-500 text-[#08088F]'
                          : 'bg-rose-600 text-white'
                      )}
                    >
                      {dispute.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </div>

                  {/* Dispute Details & Evidence */}
                  <div className="space-y-3 bg-[#0A0A7A] p-4 rounded-xl border border-white/10 text-xs">
                    {/* Conflicting Scores Block if Applicable */}
                    {(dispute.reason === 'conflicting_scores' ||
                      dispute.reporter_score_a !== undefined ||
                      dispute.reporter_screenshot_url ||
                      dispute.opponent_screenshot_url) && (
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-rose-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            Conflicting Match Submissions & Cloudinary Evidence
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Reporter Submission */}
                          <div className="p-2.5 rounded-lg bg-black/40 border border-white/10 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white text-[11px]">{dispute.reporterName}</span>
                              <Badge variant="outline" className="text-[9px] border-blue-400 text-blue-300">
                                Reporter
                              </Badge>
                            </div>
                            <div className="text-sm font-black text-[#FFFF00] font-mono">
                              Reported Score: {dispute.reporter_score_a ?? '-'} - {dispute.reporter_score_b ?? '-'}
                            </div>
                            {dispute.reporter_screenshot_url ? (
                              <div className="space-y-1">
                                <span className="text-[10px] text-white/60 block">Screenshot Evidence:</span>
                                <a
                                  href={dispute.reporter_screenshot_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:text-blue-300 underline"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>View Cloudinary Image</span>
                                </a>
                              </div>
                            ) : (
                              <span className="text-[10px] text-white/40 italic block">No screenshot uploaded yet</span>
                            )}
                          </div>

                          {/* Opponent Submission */}
                          <div className="p-2.5 rounded-lg bg-black/40 border border-white/10 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white text-[11px]">{dispute.opponentName}</span>
                              <Badge variant="outline" className="text-[9px] border-white/30 text-white/70">
                                Opponent
                              </Badge>
                            </div>
                            <div className="text-sm font-black text-[#FFFF00] font-mono">
                              Reported Score: {dispute.opponent_score_a ?? '-'} - {dispute.opponent_score_b ?? '-'}
                            </div>
                            {dispute.opponent_screenshot_url ? (
                              <div className="space-y-1">
                                <span className="text-[10px] text-white/60 block">Screenshot Evidence:</span>
                                <a
                                  href={dispute.opponent_screenshot_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:text-blue-300 underline"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>View Cloudinary Image</span>
                                </a>
                              </div>
                            ) : (
                              <span className="text-[10px] text-white/40 italic block">No screenshot uploaded yet</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div>
                          <span className="text-[10px] text-white/60 uppercase font-semibold block">Player Statement</span>
                          <p className="text-white mt-0.5 leading-relaxed bg-white/5 p-2 rounded-lg border border-white/5">
                            {dispute.details || 'No additional details provided by reporter.'}
                          </p>
                        </div>

                        {dispute.evidence_url && !dispute.reporter_screenshot_url && (
                          <div>
                            <span className="text-[10px] text-white/60 uppercase font-semibold block">Evidence URL</span>
                            <a
                              href={dispute.evidence_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-bold underline mt-0.5"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>View Evidence Attachment</span>
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Match & Player Presence Audit */}
                      <div className="space-y-2">
                        <span className="text-[10px] text-white/60 uppercase font-semibold block">Match Presence Status</span>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                            <div className="text-[11px] font-bold text-white truncate">{pAName}</div>
                            <div className="mt-1">
                              {hasStartedA ? (
                                <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Started
                                </span>
                              ) : (
                                <span className="text-[10px] text-rose-400 font-bold">Absent (Not Started)</span>
                              )}
                            </div>
                          </div>

                          <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                            <div className="text-[11px] font-bold text-white truncate">{pBName}</div>
                            <div className="mt-1">
                              {hasStartedB ? (
                                <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Started
                                </span>
                              ) : (
                                <span className="text-[10px] text-rose-400 font-bold">Absent (Not Started)</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {dispute.admin_notes && (
                          <div className="mt-2 text-[11px] text-amber-300 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                            <span className="font-bold block">Admin Decision Log:</span>
                            {dispute.admin_notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => loadAuditLogs(dispute.match_id)}
                    className="text-xs text-white/70 hover:text-white gap-1.5"
                  >
                    <History className="w-3.5 h-3.5 text-[#FFFF00]" />
                    <span>View Match Audit Logs</span>
                  </Button>

                  {dispute.status !== 'resolved' && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleOpenResolution(dispute)}
                      className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs rounded-xl shadow-lg uppercase tracking-wider"
                    >
                      Make Administrative Decision
                    </Button>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal: Administrative Resolution Decision */}
      {activeDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-2xl bg-[#0B0E17] border border-slate-800 p-6 shadow-2xl text-white space-y-4">
            <h3 className="text-lg font-bold text-white">Dispute Decision Desk</h3>
            <p className="text-xs text-slate-400">
              Resolve dispute #{activeDispute.id.slice(0, 8)} ({activeDispute.reason.replace(/_/g, ' ')})
            </p>

            <form onSubmit={handleConfirmResolution} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Select Action</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'resolve_with_scores', label: 'Determine Score' },
                    { id: 'approve_walkover', label: 'Approve Walkover (3-0)' },
                    { id: 'reject_walkover', label: 'Reject / Force Play' },
                    { id: 'reschedule', label: 'Reschedule Match' },
                    { id: 'dismiss', label: 'Dismiss Claim' },
                  ].map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => setSelectedDecision(action.id as any)}
                      className={cn(
                        'p-2.5 rounded-xl border text-xs font-bold text-left transition-colors cursor-pointer',
                        selectedDecision === action.id
                          ? 'bg-[#1818D4] border-[#FFFF00] text-white ring-1 ring-[#FFFF00]'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                      )}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>

              {selectedDecision === 'resolve_with_scores' && (
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 space-y-3">
                  <span className="text-xs font-bold text-[#FFFF00] block">Official Score Override</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1 truncate">
                        {activeDispute.reporterName} Score
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={scoreA}
                        onChange={(e) => setScoreA(e.target.value)}
                        required
                        className="bg-black/50 border-slate-700 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1 truncate">
                        {activeDispute.opponentName} Score
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={scoreB}
                        onChange={(e) => setScoreB(e.target.value)}
                        required
                        className="bg-black/50 border-slate-700 text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedDecision === 'approve_walkover' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Advancing Winner</label>
                  <select
                    value={winnerParticipantId}
                    onChange={(e) => setWinnerParticipantId(e.target.value)}
                    required
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-xs text-white"
                  >
                    <option value={activeDispute.reporter_participant_id}>
                      {activeDispute.reporterName} (Reporter)
                    </option>
                    {activeDispute.opponent_participant_id && (
                      <option value={activeDispute.opponent_participant_id}>
                        {activeDispute.opponentName} (Opponent)
                      </option>
                    )}
                  </select>
                </div>
              )}

              {selectedDecision === 'reschedule' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">New Kickoff Date & Time</label>
                  <Input
                    type="datetime-local"
                    value={newKickoffTime}
                    onChange={(e) => setNewKickoffTime(e.target.value)}
                    required
                    className="bg-slate-900 border-slate-700 text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Official Administrative Notes</label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Record why this decision was made..."
                  rows={3}
                  required
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveDispute(null)}
                  className="flex-1 border-slate-700 bg-slate-800 text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Execute Decision'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit Activity Logs Modal */}
      {auditLogsMatchId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-2xl bg-[#0B0E17] border border-slate-800 p-6 shadow-2xl text-white space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-[#FFFF00]" />
                <span>Match Activity Audit History</span>
              </h3>
              <button
                onClick={() => setAuditLogsMatchId(null)}
                className="text-slate-400 hover:text-white text-xs underline"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {auditLoading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading audit trail...</div>
              ) : auditLogs.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">No activity logged for this match yet.</div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-400 uppercase tracking-wider text-[10px]">
                        [{log.actor_role}] {log.action}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                    {log.details && (
                      <pre className="text-[11px] text-slate-300 font-mono bg-black/40 p-2 rounded overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
