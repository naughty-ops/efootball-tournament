'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Swords,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Flame,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn, formatDate } from '@/lib/utils';
import { getTournamentById, TournamentWithStats } from '@/services/tournamentService';
import { getAllAdminMatches, MatchWithDetails } from '@/services/matchService';
import {
  scheduleMatchAction,
  bulkScheduleMatchdayAction,
  rescheduleMatchAction,
  extendDeadlineAction,
  evaluateOverdueMatchesAction,
} from '@/app/actions/matchSchedulingActions';

export default function AdminMatchSchedulerDeskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  const [tournament, setTournament] = useState<TournamentWithStats | null>(null);
  const [matches, setMatches] = useState<MatchWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMatchday, setSelectedMatchday] = useState<string>('all');

  // Modals & Panels
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<MatchWithDetails | null>(null);
  const [reschedulingMatch, setReschedulingMatch] = useState<MatchWithDetails | null>(null);
  const [extendingMatch, setExtendingMatch] = useState<MatchWithDetails | null>(null);

  // Bulk schedule form state
  const [bulkStartTime, setBulkStartTime] = useState('');
  const [bulkDuration, setBulkDuration] = useState(25);
  const [bulkInterval, setBulkInterval] = useState(30);
  const [bulkGrace, setBulkGrace] = useState(15);
  const [bulkMatchdayNum, setBulkMatchdayNum] = useState<number>(1);

  // Individual schedule form state
  const [singleStartTime, setSingleStartTime] = useState('');
  const [singleCompletion, setSingleCompletion] = useState('');
  const [singleGrace, setSingleGrace] = useState(15);
  const [singleMatchday, setSingleMatchday] = useState<number>(1);

  // Reschedule form state
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');

  // Extend deadline state
  const [extendMinutes, setExtendMinutes] = useState(15);
  const [extendReason, setExtendReason] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [tData, mData] = await Promise.all([
        getTournamentById(tournamentId),
        getAllAdminMatches({ tournamentId }),
      ]);
      setTournament(tData);
      setMatches(mData);
    } catch (err: any) {
      console.error('Failed to load scheduler data:', err);
      setError(err.message || 'Failed to load tournament match schedule');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tournamentId]);

  // Derived Matchdays
  const matchdays = Array.from(
    new Set(
      matches
        .map((m: any) => m.matchday)
        .filter((d): d is number => typeof d === 'number' && d > 0)
    )
  ).sort((a, b) => a - b);

  // Filtering matches
  const filteredMatches = matches.filter((m) => {
    // Status filter
    if (statusFilter === 'overdue') {
      const isPastCheckin =
        m.checkin_deadline &&
        new Date(m.checkin_deadline).getTime() < Date.now() &&
        (!m.player_a_started_at || !m.player_b_started_at) &&
        !['completed', 'walkover', 'cancelled'].includes(m.status);
      const isPastCompletion =
        (m.completion_deadline || (m as any).submission_deadline) &&
        new Date((m as any).submission_deadline || m.completion_deadline).getTime() < Date.now() &&
        ['live', 'in_progress', 'awaiting_result', 'result_verification'].includes(m.status);
      if (!isPastCheckin && !isPastCompletion && !['under_review', 'disputed', 'result_pending_admin'].includes(m.status)) return false;
    } else if (statusFilter === 'under_review') {
      if (!['under_review', 'disputed', 'result_pending_admin', 'admin_review'].includes(m.status)) return false;
    } else if (statusFilter === 'live') {
      if (!['live', 'in_progress', 'awaiting_result', 'result_verification'].includes(m.status)) return false;
    } else if (statusFilter === 'completed') {
      if (!['completed', 'walkover', 'cancelled'].includes(m.status)) return false;
    } else if (statusFilter !== 'all') {
      if (m.status !== statusFilter) return false;
    }

    // Matchday filter
    if (selectedMatchday !== 'all') {
      if (String((m as any).matchday) !== selectedMatchday) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const pA = m.participantAUser?.username?.toLowerCase() || '';
      const pB = m.participantBUser?.username?.toLowerCase() || '';
      const rName = m.roundName?.toLowerCase() || '';
      if (!pA.includes(q) && !pB.includes(q) && !rName.includes(q)) return false;
    }

    return true;
  });

  // Handler: Run Overdue Deadlines check
  const handleEvaluateDeadlines = async () => {
    setActionLoading(true);
    setFeedback(null);
    const res = await evaluateOverdueMatchesAction(tournamentId);
    setActionLoading(false);
    if (!res.success) {
      setFeedback({ type: 'error', message: res.error || 'Failed to evaluate deadlines' });
    } else {
      setFeedback({ type: 'success', message: res.message || 'Evaluated overdue matches successfully' });
      await loadData();
    }
  };

  // Handler: Submit Bulk Schedule
  const handleBulkSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkStartTime) {
      setFeedback({ type: 'error', message: 'Please select a kickoff start time' });
      return;
    }

    setActionLoading(true);
    setFeedback(null);
    const res = await bulkScheduleMatchdayAction({
      tournamentId,
      matchday: bulkMatchdayNum || undefined,
      startTime: new Date(bulkStartTime).toISOString(),
      matchDurationMinutes: Number(bulkDuration),
      intervalMinutes: Number(bulkInterval),
      gracePeriodMinutes: Number(bulkGrace),
    });

    setActionLoading(false);
    if (!res.success) {
      setFeedback({ type: 'error', message: res.error || 'Failed to bulk schedule matchday' });
    } else {
      setFeedback({ type: 'success', message: res.message || 'Matchday scheduled successfully' });
      setIsBulkOpen(false);
      await loadData();
    }
  };

  // Handler: Submit Individual Schedule
  const handleSingleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMatch || !singleStartTime) return;

    setActionLoading(true);
    setFeedback(null);
    const res = await scheduleMatchAction({
      matchId: editingMatch.id,
      tournamentId,
      scheduledTime: new Date(singleStartTime).toISOString(),
      completionDeadline: singleCompletion ? new Date(singleCompletion).toISOString() : null,
      gracePeriodMinutes: Number(singleGrace),
      matchday: Number(singleMatchday) || null,
    });

    setActionLoading(false);
    if (!res.success) {
      setFeedback({ type: 'error', message: res.error || 'Failed to schedule match' });
    } else {
      setFeedback({ type: 'success', message: 'Match schedule updated' });
      setEditingMatch(null);
      await loadData();
    }
  };

  // Handler: Reschedule Match
  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingMatch || !rescheduleTime) return;

    setActionLoading(true);
    setFeedback(null);
    const res = await rescheduleMatchAction({
      matchId: reschedulingMatch.id,
      tournamentId,
      newScheduledTime: new Date(rescheduleTime).toISOString(),
      reason: rescheduleReason.trim() || undefined,
    });

    setActionLoading(false);
    if (!res.success) {
      setFeedback({ type: 'error', message: res.error || 'Failed to reschedule match' });
    } else {
      setFeedback({ type: 'success', message: 'Match rescheduled successfully' });
      setReschedulingMatch(null);
      await loadData();
    }
  };

  // Handler: Extend Deadline
  const handleExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendingMatch) return;

    setActionLoading(true);
    setFeedback(null);
    const res = await extendDeadlineAction({
      matchId: extendingMatch.id,
      tournamentId,
      additionalMinutes: Number(extendMinutes),
      reason: extendReason.trim() || undefined,
    });

    setActionLoading(false);
    if (!res.success) {
      setFeedback({ type: 'error', message: res.error || 'Failed to extend deadline' });
    } else {
      setFeedback({ type: 'success', message: res.message || 'Deadline extended' });
      setExtendingMatch(null);
      await loadData();
    }
  };

  if (loading) {
    return (
      <div className="min-h-[500px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-white">
          <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00]" />
          <span className="text-xs font-semibold">Loading Match Scheduling Desk...</span>
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

  const overdueCount = matches.filter((m) => {
    const isPastCheckin =
      m.checkin_deadline &&
      new Date(m.checkin_deadline).getTime() < Date.now() &&
      (!m.player_a_started_at || !m.player_b_started_at) &&
      !['completed', 'walkover', 'cancelled'].includes(m.status);
    return isPastCheckin || m.status === 'under_review' || m.status === 'disputed';
  }).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 px-4 sm:px-6">
      {/* Header & Sub-navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <Button asChild variant="ghost" size="sm" className="gap-2 text-white/70 hover:text-white -ml-2 mb-1">
            <Link href={`/admin/tournaments/${tournamentId}`}>
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Tournament Details</span>
            </Link>
          </Button>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider font-display">
              Match Scheduling Desk
            </h1>
            <Badge className="bg-[#FFFF00] text-[#08088F] font-black text-xs px-2.5 py-0.5 rounded-full">
              {matches.length} Matches
            </Badge>
            {overdueCount > 0 && (
              <Badge className="bg-rose-500 text-white font-black text-xs px-2.5 py-0.5 rounded-full animate-pulse">
                {overdueCount} Overdue / Review
              </Badge>
            )}
          </div>
          <p className="text-xs text-white/60 mt-1">
            Tournament: <span className="text-white font-bold">{tournament.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleEvaluateDeadlines}
            disabled={actionLoading}
            className="border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-bold rounded-xl gap-1.5"
          >
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span>Evaluate Deadlines</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => setIsBulkOpen(true)}
            className="bg-[#00C853] hover:bg-[#00B048] text-[#08088F] font-black text-xs rounded-xl shadow-lg gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Bulk Schedule Matchday</span>
          </Button>

          <Button asChild variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10 text-xs font-bold rounded-xl gap-1.5">
            <Link href={`/admin/tournaments/${tournamentId}/disputes`}>
              <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
              <span>Disputes & Tickets</span>
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

      {/* Controls Bar: Status Pills, Matchday Dropdown, Search */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-[#0A0A7A] p-4 rounded-2xl border border-white/10">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {[
            { id: 'all', label: 'All' },
            { id: 'scheduled', label: 'Scheduled' },
            { id: 'live', label: 'Live' },
            { id: 'overdue', label: 'Overdue / Alerts' },
            { id: 'under_review', label: 'Under Review' },
            { id: 'completed', label: 'Completed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors cursor-pointer',
                statusFilter === tab.id
                  ? 'bg-[#FFFF00] text-[#08088F]'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {matchdays.length > 0 && (
            <select
              value={selectedMatchday}
              onChange={(e) => setSelectedMatchday(e.target.value)}
              className="bg-[#1818D4] border border-white/20 text-white text-xs rounded-xl px-3 py-2 font-bold focus:outline-none focus:border-[#FFFF00]"
            >
              <option value="all">All Matchdays</option>
              {matchdays.map((d) => (
                <option key={d} value={String(d)}>
                  Matchday {d}
                </option>
              ))}
            </select>
          )}

          <div className="relative w-full md:w-60">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/50" />
            <Input
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs bg-[#1818D4] border-white/20 text-white placeholder:text-white/40 focus:border-[#FFFF00] rounded-xl"
            />
          </div>
        </div>
      </div>

      {/* Matches Schedule Table / Cards */}
      <div className="space-y-3">
        {filteredMatches.length === 0 ? (
          <Card className="p-10 text-center bg-[#1818D4] border border-white/10 rounded-2xl text-white">
            <Swords className="h-10 w-10 mx-auto text-[#FFFF00] opacity-80 mb-2" />
            <p className="text-sm font-bold">No matches match your filter criteria.</p>
          </Card>
        ) : (
          filteredMatches.map((m) => {
            const pAName = m.participantAUser?.username || 'TBD';
            const pBName = m.participantBUser?.username || 'TBD';
            const hasStartedA = Boolean(m.player_a_started_at);
            const hasStartedB = Boolean(m.player_b_started_at);

            const isPastCheckin =
              m.checkin_deadline &&
              new Date(m.checkin_deadline).getTime() < Date.now() &&
              (!hasStartedA || !hasStartedB) &&
              !['completed', 'walkover', 'cancelled'].includes(m.status);

            const isPastCompletion =
              m.completion_deadline &&
              new Date(m.completion_deadline).getTime() < Date.now() &&
              m.status === 'live';

            return (
              <div
                key={m.id}
                className={cn(
                  'p-4 rounded-2xl border transition-all bg-[#1818D4] text-white flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4',
                  m.status === 'under_review' || m.status === 'disputed'
                    ? 'border-amber-500 bg-[#121288]'
                    : isPastCheckin || isPastCompletion
                    ? 'border-rose-500/70 bg-[#141490]'
                    : 'border-white/10 hover:border-white/30'
                )}
              >
                {/* Left: Round, Matchday & Matchup */}
                <div className="space-y-1.5 min-w-[280px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-white/70">{m.roundName}</span>
                    {m.matchday && (
                      <span className="text-[10px] font-black text-[#FFFF00] bg-[#0A0A7A] px-2 py-0.5 rounded-full border border-white/10">
                        MD {m.matchday}
                      </span>
                    )}
                    <Badge
                      className={cn(
                        'text-[10px] font-black uppercase rounded-full border-0 px-2 py-0.5',
                        m.status === 'live'
                          ? 'bg-[#FF168B] text-white animate-pulse'
                          : m.status === 'completed'
                          ? 'bg-[#00C853] text-[#08088F]'
                          : m.status === 'under_review' || m.status === 'disputed'
                          ? 'bg-amber-500 text-slate-950 font-black'
                          : 'bg-[#0A0A7A] text-white border border-white/20'
                      )}
                    >
                      {m.status}
                    </Badge>
                  </div>

                  <div className="text-sm font-black flex items-center gap-2">
                    <span className={cn('truncate', m.winner_id === m.participant_a && 'text-[#FFFF00]')}>
                      {pAName}
                    </span>
                    <span className="text-white/40 text-xs">vs</span>
                    <span className={cn('truncate', m.winner_id === m.participant_b && 'text-[#FFFF00]')}>
                      {pBName}
                    </span>
                  </div>

                  {m.forfeit_reason && (
                    <p className="text-[11px] text-amber-300 font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
                      <span>{m.forfeit_reason}</span>
                    </p>
                  )}
                </div>

                {/* Middle: Timing, Deadlines & Check-in Progress */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-[320px] bg-[#0A0A7A] p-3 rounded-xl border border-white/10 text-xs">
                  <div>
                    <div className="text-[10px] text-white/60 font-semibold uppercase">Schedule</div>
                    <div className="font-mono text-white mt-0.5">
                      {m.scheduled_time ? formatDate(m.scheduled_time) : 'Not scheduled'}
                    </div>
                    {m.completion_deadline && (
                      <div className="text-[10px] text-white/60 mt-0.5">
                        Deadline: {new Date(m.completion_deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] text-white/60 font-semibold uppercase">Check-In Progress</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded font-bold',
                          hasStartedA ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                        )}
                        title={m.player_a_started_at ? `Checked in: ${new Date(m.player_a_started_at).toLocaleTimeString()}` : 'Not checked in'}
                      >
                        P1: {hasStartedA ? 'Ready' : 'Absent'}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded font-bold',
                          hasStartedB ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                        )}
                        title={m.player_b_started_at ? `Checked in: ${new Date(m.player_b_started_at).toLocaleTimeString()}` : 'Not checked in'}
                      >
                        P2: {hasStartedB ? 'Ready' : 'Absent'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Administrative Actions */}
                <div className="flex items-center gap-2 self-end lg:self-center flex-wrap">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingMatch(m);
                      setSingleStartTime(m.scheduled_time ? new Date(m.scheduled_time).toISOString().slice(0, 16) : '');
                      setSingleCompletion(m.completion_deadline ? new Date(m.completion_deadline).toISOString().slice(0, 16) : '');
                      setSingleGrace(m.grace_period_minutes || 15);
                      setSingleMatchday(m.matchday || 1);
                    }}
                    className="h-8 text-xs border-white/20 bg-white/5 hover:bg-white/10 text-white rounded-xl"
                  >
                    <Calendar className="h-3.5 w-3.5 mr-1 text-[#FFFF00]" />
                    <span>Schedule</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReschedulingMatch(m);
                      setRescheduleTime(m.scheduled_time ? new Date(m.scheduled_time).toISOString().slice(0, 16) : '');
                      setRescheduleReason('');
                    }}
                    className="h-8 text-xs border-white/20 bg-white/5 hover:bg-white/10 text-white rounded-xl"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1 text-blue-400" />
                    <span>Reschedule</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setExtendingMatch(m);
                      setExtendMinutes(15);
                      setExtendReason('');
                    }}
                    className="h-8 text-xs border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-xl"
                  >
                    <Clock className="h-3.5 w-3.5 mr-1 text-amber-400" />
                    <span>+Extend</span>
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Bulk Schedule Matchday */}
      {isBulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-2xl bg-[#0B0E17] border border-slate-800 p-6 shadow-2xl text-white">
            <h3 className="text-lg font-bold text-white mb-1">Bulk Schedule Matchday</h3>
            <p className="text-xs text-slate-400 mb-4">
              Sequentially schedule all fixtures in a matchday or round with automatic staggered kickoff times and deadlines.
            </p>

            <form onSubmit={handleBulkSchedule} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Matchday Number</label>
                  <Input
                    type="number"
                    min={1}
                    value={bulkMatchdayNum}
                    onChange={(e) => setBulkMatchdayNum(Number(e.target.value))}
                    required
                    className="bg-slate-900 border-slate-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">First Kickoff Date & Time</label>
                  <Input
                    type="datetime-local"
                    value={bulkStartTime}
                    onChange={(e) => setBulkStartTime(e.target.value)}
                    required
                    className="bg-slate-900 border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Duration (Mins)</label>
                  <Input
                    type="number"
                    min={10}
                    max={120}
                    value={bulkDuration}
                    onChange={(e) => setBulkDuration(Number(e.target.value))}
                    className="bg-slate-900 border-slate-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Interval (Mins)</label>
                  <Input
                    type="number"
                    min={10}
                    max={120}
                    value={bulkInterval}
                    onChange={(e) => setBulkInterval(Number(e.target.value))}
                    className="bg-slate-900 border-slate-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Grace Period</label>
                  <Input
                    type="number"
                    min={5}
                    max={60}
                    value={bulkGrace}
                    onChange={(e) => setBulkGrace(Number(e.target.value))}
                    className="bg-slate-900 border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsBulkOpen(false)}
                  className="flex-1 border-slate-700 bg-slate-800 text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 bg-[#00C853] hover:bg-[#00B048] text-[#08088F] font-black"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply Bulk Schedule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Individual Match Scheduling */}
      {editingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-2xl bg-[#0B0E17] border border-slate-800 p-6 shadow-2xl text-white">
            <h3 className="text-lg font-bold text-white mb-1">Schedule Match</h3>
            <p className="text-xs text-slate-400 mb-4">
              {editingMatch.participantAUser?.username || 'TBD'} vs {editingMatch.participantBUser?.username || 'TBD'}
            </p>

            <form onSubmit={handleSingleSchedule} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Scheduled Kickoff Time</label>
                <Input
                  type="datetime-local"
                  value={singleStartTime}
                  onChange={(e) => setSingleStartTime(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Grace Period (Mins)</label>
                  <Input
                    type="number"
                    min={5}
                    max={60}
                    value={singleGrace}
                    onChange={(e) => setSingleGrace(Number(e.target.value))}
                    className="bg-slate-900 border-slate-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Matchday</label>
                  <Input
                    type="number"
                    min={1}
                    value={singleMatchday}
                    onChange={(e) => setSingleMatchday(Number(e.target.value))}
                    className="bg-slate-900 border-slate-700 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Completion Deadline (Optional)</label>
                <Input
                  type="datetime-local"
                  value={singleCompletion}
                  onChange={(e) => setSingleCompletion(e.target.value)}
                  placeholder="Defaults to Kickoff + Grace + 30m"
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingMatch(null)}
                  className="flex-1 border-slate-700 bg-slate-800 text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Schedule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reschedule Match */}
      {reschedulingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-2xl bg-[#0B0E17] border border-slate-800 p-6 shadow-2xl text-white">
            <h3 className="text-lg font-bold text-white mb-1">Reschedule Match</h3>
            <p className="text-xs text-slate-400 mb-4">
              Rescheduling resets player check-ins and clears open no-show flags.
            </p>

            <form onSubmit={handleReschedule} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">New Kickoff Date & Time</label>
                <Input
                  type="datetime-local"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Reason for Rescheduling</label>
                <textarea
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="Server outage, player request approved, etc."
                  rows={2}
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReschedulingMatch(null)}
                  className="flex-1 border-slate-700 bg-slate-800 text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Reschedule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Extend Deadline */}
      {extendingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-2xl bg-[#0B0E17] border border-slate-800 p-6 shadow-2xl text-white">
            <h3 className="text-lg font-bold text-white mb-1">Extend Match Deadline</h3>
            <p className="text-xs text-slate-400 mb-4">
              Add extra time to the match completion and check-in window.
            </p>

            <form onSubmit={handleExtend} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Additional Minutes</label>
                <select
                  value={extendMinutes}
                  onChange={(e) => setExtendMinutes(Number(e.target.value))}
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-xs text-white"
                >
                  <option value={10}>+10 Minutes</option>
                  <option value={15}>+15 Minutes</option>
                  <option value={30}>+30 Minutes</option>
                  <option value={45}>+45 Minutes</option>
                  <option value={60}>+60 Minutes</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Administrative Note (Optional)</label>
                <Input
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                  placeholder="Extra time granted for reconnect"
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setExtendingMatch(null)}
                  className="flex-1 border-slate-700 bg-slate-800 text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Extend Deadline'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
