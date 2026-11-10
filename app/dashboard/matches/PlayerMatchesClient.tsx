'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Swords,
  Calendar,
  Radio,
  Flame,
  CheckCircle2,
  Clock,
  Filter,
  Trophy,
  ArrowRight,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Shield,
  Search,
  User,
  Play,
  ShieldAlert,
  Loader2,
  Flag,
  FileImage,
  UploadCloud,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatDate } from '@/lib/utils';
import { SwipeableTabBar, SwipeableTabContainer } from '@/components/ui/SwipeableTabs';
import type { PlayerMatchItem } from '@/services/playerDashboardService';
import OpponentWhatsAppButton from '@/components/dashboard/OpponentWhatsAppButton';
import MatchCountdownTimer from '@/components/match/MatchCountdownTimer';
import ReportMatchIssueModal from '@/components/match/ReportMatchIssueModal';
import SubmitMatchScoreModal from '@/components/match/SubmitMatchScoreModal';
import UploadMatchEvidenceModal from '@/components/match/UploadMatchEvidenceModal';
import {
  recordPlayerCheckinAction,
  requestWalkoverAction,
  startPlayerMatchAction,
} from '@/app/actions/matchSchedulingActions';

interface PlayerMatchesClientProps {
  initialMatches: PlayerMatchItem[];
  userDisplayName: string;
  initialError?: string | null;
}

const TABS = [
  { key: 'all', label: 'All Matches', icon: Filter },
  { key: 'upcoming', label: 'Upcoming', icon: Clock },
  { key: 'live', label: 'Live Now', icon: Flame },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
] as const;

export default function PlayerMatchesClient({
  initialMatches,
  userDisplayName,
  initialError,
}: PlayerMatchesClientProps) {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [disputeModalMatch, setDisputeModalMatch] = useState<PlayerMatchItem | null>(null);
  const [submitScoreMatch, setSubmitScoreMatch] = useState<PlayerMatchItem | null>(null);
  const [uploadEvidenceMatch, setUploadEvidenceMatch] = useState<PlayerMatchItem | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 10;

  const handleTabChange = (tab: string) => {
    setSelectedTab(tab);
    setCurrentPage(1);
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setCurrentPage(1);
  };

  const handleStartMatch = async (match: PlayerMatchItem) => {
    if (!match.userParticipantId) {
      setFeedbackMsg({ type: 'error', text: 'Participant ID not found for this match' });
      return;
    }

    setActionLoadingId(match.id);
    setFeedbackMsg(null);

    const res = await startPlayerMatchAction(match.id, match.userParticipantId);
    setActionLoadingId(null);

    if (!res.success) {
      setFeedbackMsg({ type: 'error', text: res.error || 'Failed to start match' });
      return;
    }

    setFeedbackMsg({
      type: 'success',
      text: res.message || 'Confirmed start! Waiting for opponent confirmation.',
    });
    router.refresh();
  };

  const handleRequestWalkover = async (match: PlayerMatchItem) => {
    if (!match.userParticipantId) {
      setFeedbackMsg({ type: 'error', text: 'Participant ID not found' });
      return;
    }

    if (!window.confirm('Are you sure you want to request a walkover? This will be verified by the admin desk.')) {
      return;
    }

    setActionLoadingId(match.id);
    setFeedbackMsg(null);

    const res = await requestWalkoverAction(match.id, match.userParticipantId, 'Opponent no-show after grace period');
    setActionLoadingId(null);

    if (!res.success) {
      setFeedbackMsg({ type: 'error', text: res.error || 'Failed to request walkover' });
      return;
    }

    setFeedbackMsg({ type: 'success', text: res.message || 'Walkover request filed for review' });
    router.refresh();
  };

  // Calculate real, data-backed match metrics
  const stats = useMemo(() => {
    const total = initialMatches.length;
    const liveCount = initialMatches.filter((m) => m.isLive).length;
    const completedMatches = initialMatches.filter((m) => {
      const s = (m.status || '').toLowerCase();
      return s === 'completed' || s === 'walkover' || s === 'forfeited' || s === 'cancelled';
    });
    const completedCount = completedMatches.length;
    const upcomingCount = initialMatches.filter((m) => {
      const s = (m.status || '').toLowerCase();
      return !m.isLive && s !== 'completed' && s !== 'walkover' && s !== 'forfeited' && s !== 'cancelled';
    }).length;
    const wins = completedMatches.filter((m) => m.result === 'win').length;
    const draws = completedMatches.filter((m) => m.result === 'draw').length;
    const losses = completedMatches.filter((m) => m.result === 'loss').length;
    const winRate = completedCount > 0 ? Math.round((wins / completedCount) * 100) : 0;

    return { total, liveCount, upcomingCount, completedCount, wins, draws, losses, winRate };
  }, [initialMatches]);

  const tabItems = useMemo(
    () => [
      { id: 'all', label: 'All', icon: Filter, badge: stats.total },
      { id: 'upcoming', label: 'Upcoming', icon: Clock, badge: stats.upcomingCount > 0 ? stats.upcomingCount : undefined },
      { id: 'live', label: 'Live Now', icon: Flame, badge: stats.liveCount > 0 ? stats.liveCount : undefined },
      { id: 'completed', label: 'Completed', icon: CheckCircle2, badge: stats.completedCount > 0 ? stats.completedCount : undefined },
    ],
    [stats]
  );
  const tabIds = useMemo(() => ['all', 'upcoming', 'live', 'completed'], []);

  const filteredMatches = useMemo(() => {
    return initialMatches.filter((m) => {
      // Tab matching
      let matchesTab = true;
      const statusLower = (m.status || '').toLowerCase();
      const isCompleted = ['completed', 'walkover', 'forfeited', 'cancelled'].includes(statusLower);

      if (selectedTab === 'live') {
        matchesTab = m.isLive;
      } else if (selectedTab === 'upcoming') {
        matchesTab = !m.isLive && !isCompleted;
      } else if (selectedTab === 'completed') {
        matchesTab = isCompleted;
      }

      // Search matching
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        m.tournamentName.toLowerCase().includes(q) ||
        m.roundName.toLowerCase().includes(q) ||
        m.opponentUsername.toLowerCase().includes(q);

      return matchesTab && matchesSearch;
    });
  }, [initialMatches, selectedTab, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredMatches.length / PAGE_SIZE));
  const paginatedMatches = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredMatches.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredMatches, currentPage]);

  return (
    <div className="space-y-8">
      {/* 1. Summary Cards Section */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Fixtures */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[24px] p-5 shadow-lg text-white">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-black uppercase tracking-wider text-white/70">Total Fixtures</span>
            <div className="h-8 w-8 rounded-full bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
              <Swords className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#FFFF00] font-display">{stats.total}</div>
          <p className="text-[11px] text-white/60 mt-1">Across all tournaments</p>
        </Card>

        {/* Live Matches */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[24px] p-5 shadow-lg text-white">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-black uppercase tracking-wider text-white/70">Live Now</span>
            <div className="h-8 w-8 rounded-full bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FF168B]">
              <Radio className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#FF168B] font-display">{stats.liveCount}</div>
          <p className="text-[11px] text-white/60 mt-1">Active match rooms</p>
        </Card>

        {/* Upcoming Fixtures */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[24px] p-5 shadow-lg text-white">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-black uppercase tracking-wider text-white/70">Upcoming</span>
            <div className="h-8 w-8 rounded-full bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#FFFF00] font-display">{stats.upcomingCount}</div>
          <p className="text-[11px] text-white/60 mt-1">Awaiting kickoff</p>
        </Card>

        {/* Completed Record */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[24px] p-5 shadow-lg text-white">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-black uppercase tracking-wider text-white/70">Record</span>
            <div className="h-8 w-8 rounded-full bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#00C853]">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-display">
            <span className="text-[#00C853]">{stats.wins}W</span> -{' '}
            <span className="text-white/70">{stats.draws}D</span> -{' '}
            <span className="text-red-400">{stats.losses}L</span>
          </div>
          <p className="text-[11px] text-white/60 mt-1">
            {stats.completedCount > 0 ? `${stats.winRate}% win rate` : 'No matches played yet'}
          </p>
        </Card>
      </div>

      {/* Query Error State */}
      {initialError && initialMatches.length === 0 && (
        <Card className="p-8 text-center bg-red-950/40 border border-red-500/30 rounded-3xl space-y-4 text-white">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-400">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-white uppercase font-display">Unable to Retrieve Matches</h3>
            <p className="text-xs text-white/70 max-w-md mx-auto mt-1">
              {initialError}
            </p>
          </div>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            size="sm"
            className="rounded-full text-xs font-black uppercase tracking-wider border-white/30 text-white hover:bg-white/10 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry Query</span>
          </Button>
        </Card>
      )}

      {/* 2. Controls: Search & Tabs Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Swipeable Tabs Bar */}
        <SwipeableTabBar
          tabs={tabItems}
          activeTab={selectedTab}
          onTabChange={handleTabChange}
          className="w-full md:w-auto"
        />

        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-white/50" />
          <Input
            placeholder="Search opponent or tournament..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 h-11 sm:h-10 text-base sm:text-xs bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 focus:border-[#FFFF00] rounded-full"
          />
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div
          className={cn(
            'p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold animate-in fade-in duration-200',
            feedbackMsg.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          )}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-white/60 hover:text-white text-xs underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3. Matches Grid */}
      <SwipeableTabContainer
        activeTab={selectedTab}
        onTabChange={handleTabChange}
        tabs={tabIds}
      >
      {filteredMatches.length === 0 ? (
        <Card className="p-8 sm:p-12 text-center bg-[#1818D4] border border-white/20 rounded-[32px] space-y-4 text-white">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
            {selectedTab === 'live' ? <Radio className="h-8 w-8 text-[#FF168B]" /> : <Swords className="h-8 w-8 text-[#FFFF00]" />}
          </div>
          <div>
            <h3 className="text-lg font-black text-white font-display uppercase tracking-wider">
              {searchQuery
                ? `No fixtures matching "${searchQuery}"`
                : selectedTab === 'all'
                ? 'No Matches Scheduled Yet'
                : selectedTab === 'live'
                ? 'No Live Matches Currently in Progress'
                : `No ${selectedTab} matches found`}
            </h3>
            <p className="text-xs text-white/70 max-w-md mx-auto mt-1 leading-relaxed">
              {searchQuery
                ? 'Try adjusting your search query or switching tabs.'
                : selectedTab === 'live'
                ? 'None of your registered tournament fixtures are currently live on field. Check public tournament broadcasts or wait for your round kickoff.'
                : 'When tournament administrators generate pairings and brackets, your matches and live game rooms will be displayed here.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {selectedTab === 'live' ? (
              <>
                <Button asChild className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs rounded-full shadow-lg uppercase tracking-wider px-6 cursor-pointer">
                  <Link href="/live">Browse Live Broadcasts</Link>
                </Button>
                <Button asChild variant="outline" className="border-white/20 hover:bg-white/10 text-white font-black text-xs rounded-full uppercase tracking-wider px-6 cursor-pointer">
                  <Link href="/dashboard/tournaments">My Tournaments</Link>
                </Button>
              </>
            ) : (
              <Button asChild className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs rounded-full shadow-lg uppercase tracking-wider px-6 cursor-pointer">
                <Link href="/dashboard/tournaments">Check Tournament Status</Link>
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {paginatedMatches.map((m) => {
            const statusUpper = (m.status || '').toUpperCase();
            const isCompleted = ['COMPLETED', 'WALKOVER', 'FORFEITED', 'CANCELLED'].includes(statusUpper);
            const isDisputed = statusUpper === 'DISPUTED';
            const isTimeout = statusUpper === 'RESULT_PENDING_ADMIN';
            const isInProgress = ['IN_PROGRESS', 'AWAITING_RESULT', 'RESULT_VERIFICATION', 'LIVE'].includes(statusUpper);
            const isReview = ['UNDER_REVIEW', 'ADMIN_REVIEW', 'DISPUTED', 'RESULT_PENDING_ADMIN'].includes(statusUpper);
            const isWon = m.result === 'win';
            const isLost = m.result === 'loss';
            const isLoadingThis = actionLoadingId === m.id;

            const checkinTime = m.checkinDeadline
              ? new Date(m.checkinDeadline).getTime()
              : m.scheduledTime
              ? new Date(m.scheduledTime).getTime() + (m.gracePeriodMinutes ?? 15) * 60 * 1000
              : null;
            const gracePeriodExpired = checkinTime ? Date.now() > checkinTime : false;

            const bothStarted = Boolean(
              (m.userStartedAt && m.opponentStartedAt) ||
              m.actualStartTime ||
              isInProgress ||
              isDisputed ||
              isTimeout
            );

            const canStartMatch = !m.userStartedAt && !isCompleted && !isReview && !bothStarted;
            const canSubmitScore = bothStarted && !isCompleted && !isTimeout;
            const canRequestWalkover =
              Boolean(m.userStartedAt) &&
              !m.opponentStartedAt &&
              gracePeriodExpired &&
              !m.walkoverRequestedBy &&
              !isCompleted &&
              !isReview;

            return (
              <Card
                key={m.id}
                className={cn(
                  'p-4 sm:p-5 bg-[#1818D4] border rounded-[28px] shadow-xl transition-all space-y-4 flex flex-col justify-between text-white min-h-[260px]',
                  isDisputed
                    ? 'border-rose-500/80 bg-[#170a2c] shadow-[0_0_20px_rgba(244,63,94,0.3)]'
                    : isTimeout
                    ? 'border-amber-500/70 bg-[#1c1208]'
                    : isInProgress
                    ? 'border-[#00C853] ring-2 ring-[#00C853]/30 shadow-[0_0_20px_rgba(0,200,83,0.2)]'
                    : isReview
                    ? 'border-amber-500/50 bg-[#1414A0]'
                    : 'border-white/20 hover:border-[#FFFF00]/50'
                )}
              >
                {/* Header: Tournament + Round + Matchday + Status */}
                <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <span className="text-sm font-black text-white font-display uppercase tracking-wider block line-clamp-1">
                      {m.tournamentName}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-white/70 font-semibold">
                        {m.roundName}
                      </span>
                      {m.matchday && (
                        <span className="text-[10px] font-black text-white/90 uppercase px-2 py-0.5 rounded-full bg-[#08088F] border border-white/10">
                          Matchday {m.matchday}
                        </span>
                      )}
                      <span className="text-[10px] font-black text-[#FFFF00] uppercase px-2 py-0.5 rounded-full bg-[#0A0A7A] border border-white/10">
                        {m.userSide.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isDisputed ? (
                      <Badge className="bg-rose-500 text-white font-black text-[10px] px-2.5 py-0.5 border-0 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1 animate-pulse">
                        <ShieldAlert className="w-3 h-3" />
                        DISPUTED
                      </Badge>
                    ) : isTimeout ? (
                      <Badge className="bg-amber-500 text-slate-950 font-black text-[10px] px-2.5 py-0.5 border-0 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        PENDING ADMIN
                      </Badge>
                    ) : isInProgress ? (
                      <Badge className="bg-[#00C853] text-[#08088F] font-black text-[10px] animate-pulse px-2.5 py-0.5 border-0 gap-1 rounded-full uppercase tracking-wider shadow-md">
                        <Radio className="h-3 w-3" />
                        IN PROGRESS
                      </Badge>
                    ) : isReview ? (
                      <Badge className="bg-amber-500 text-slate-950 font-black text-[10px] px-2.5 py-0.5 border-0 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        {m.status.toUpperCase()}
                      </Badge>
                    ) : isCompleted ? (
                      isWon ? (
                        <Badge className="bg-[#00C853] text-[#08088F] font-black text-[10px] px-2.5 py-0.5 border-0 rounded-full uppercase tracking-wider shadow-sm">
                          VICTORY
                        </Badge>
                      ) : isLost ? (
                        <Badge variant="destructive" className="font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          DEFEAT
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] font-black text-white border-white/30 rounded-full uppercase tracking-wider">
                          DRAW
                        </Badge>
                      )
                    ) : (
                      <Badge variant="secondary" className="bg-[#0A0A7A] text-white border border-white/20 text-[10px] font-black rounded-full uppercase tracking-wider">
                        {m.status.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Status Banners: Conflicting Scores (Scenario B) / Timeout / In-Progress */}
                {isDisputed && (
                  <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                      <div>
                        <span className="font-bold">Conflicting Scores Reported!</span>
                        <p className="text-[11px] text-rose-300/80">
                          {m.userSubmission?.screenshotUrl
                            ? 'Screenshot evidence submitted. Awaiting Admin Desk decision.'
                            : 'Both players reported different scores. Please upload a screenshot of your match result.'}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setUploadEvidenceMatch(m)}
                      className="h-8 text-xs font-black bg-rose-500 hover:bg-rose-600 text-white rounded-full px-4 shrink-0 uppercase tracking-wider cursor-pointer"
                    >
                      <FileImage className="w-3.5 h-3.5 mr-1" />
                      {m.userSubmission?.screenshotUrl ? 'Re-upload Proof' : 'Upload Screenshot Proof'}
                    </Button>
                  </div>
                )}

                {isTimeout && (
                  <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                      <div>
                        <span className="font-bold">30-Minute Result Window Expired</span>
                        <p className="text-[11px] text-amber-300/80">
                          Submission deadline passed without verified results. An administrator is reviewing this match.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDisputeModalMatch(m)}
                      className="h-8 text-xs font-bold border-amber-500/50 text-amber-300 hover:bg-amber-500/20 rounded-full px-3 shrink-0"
                    >
                      <Flag className="w-3.5 h-3.5 mr-1 text-amber-400" />
                      Report Issue
                    </Button>
                  </div>
                )}

                {/* Score Submission Status Banner for In-Progress Matches */}
                {bothStarted && !isCompleted && !isDisputed && !isTimeout && (
                  <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {m.userSubmission ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-yellow-400 shrink-0" />
                      )}
                      <span>
                        {m.userSubmission ? (
                          <>
                            Your submission: <strong className="text-white font-mono">{m.userSubmission.myScore} - {m.userSubmission.opponentScore}</strong>
                            {m.opponentSubmission ? ' • Opponent submitted' : ' • Waiting for opponent score'}
                          </>
                        ) : (
                          <>30-min Result Window Active. Submit final score when finished.</>
                        )}
                      </span>
                    </div>
                    {m.userSubmission ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSubmitScoreMatch(m)}
                        className="h-7 text-[11px] font-bold text-[#FFFF00] hover:text-white hover:bg-white/10 rounded-full px-2.5 cursor-pointer"
                      >
                        Edit Score
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setSubmitScoreMatch(m)}
                        className="h-7 text-[11px] font-black bg-[#00C853] hover:bg-[#00B048] text-[#08088F] rounded-full px-3 uppercase tracking-wider cursor-pointer"
                      >
                        Submit Score
                      </Button>
                    )}
                  </div>
                )}

                {/* Countdown & Timing Ribbon */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-white/70">
                    <Calendar className="h-3.5 w-3.5 text-white/50" />
                    <span>{m.scheduledTime ? formatDate(m.scheduledTime) : 'Schedule pending'}</span>
                  </div>
                  <MatchCountdownTimer
                    scheduledTime={m.scheduledTime}
                    checkinDeadline={m.checkinDeadline}
                    completionDeadline={m.submissionDeadline || m.completionDeadline}
                    status={m.status}
                    isLive={m.isLive}
                    userStarted={Boolean(m.userStartedAt)}
                    opponentStarted={Boolean(m.opponentStartedAt)}
                  />
                </div>

                {/* Score / Matchup Display */}
                <div className="grid grid-cols-7 items-center gap-1.5 sm:gap-2 py-3.5 bg-[#0A0A7A]/70 rounded-2xl px-3 sm:px-4 border border-white/10 min-h-[76px]">
                  {/* You */}
                  <div className="col-span-3 min-w-0 flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-[#1818D4] border border-[#FFFF00]/60 flex items-center justify-center font-black text-xs text-[#FFFF00] shrink-0">
                      {userDisplayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-black text-[#FFFF00] uppercase tracking-wider block">
                        You ({m.userSide})
                      </span>
                      <span className="text-xs sm:text-sm font-black text-white truncate block">
                        {userDisplayName}
                      </span>
                    </div>
                  </div>

                  {/* Scoreboard */}
                  <div className="col-span-1 text-center shrink-0">
                    {isCompleted || m.isLive ? (
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1.5 text-xl font-black text-[#FFFF00] font-display">
                          <span>{m.userScore}</span>
                          <span className="text-white/40 text-sm">-</span>
                          <span>{m.opponentScore}</span>
                        </div>
                        {m.decidedBy === 'penalties' && (
                          <span className="text-[9px] font-bold text-white/60 tracking-wider">
                            ({m.userPenalties ?? 0} - {m.opponentPenalties ?? 0} pens)
                          </span>
                        )}
                      </div>
                    ) : bothStarted ? (
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">LIVE</span>
                        <div className="flex items-center gap-1 text-sm font-black text-white/70">
                          <span>{m.userSubmission ? m.userSubmission.myScore : '-'}</span>
                          <span className="text-white/40">:</span>
                          <span>{m.userSubmission ? m.userSubmission.opponentScore : '-'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-[#08088F] border border-white/20 mx-auto flex items-center justify-center text-[10px] font-black text-[#FFFF00]">
                        VS
                      </div>
                    )}
                  </div>

                  {/* Opponent */}
                  <div className="col-span-3 min-w-0 flex items-center justify-end gap-2.5 text-right">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider block">
                        Opponent ({m.userSide === 'home' ? 'away' : 'home'})
                      </span>
                      <OpponentWhatsAppButton
                        match={m}
                        yourName={userDisplayName}
                      />
                    </div>
                    <div className="h-9 w-9 rounded-full bg-[#08088F] border border-white/20 flex items-center justify-center font-black text-xs text-white/80 shrink-0">
                      {(m.opponentDisplayName || m.opponentUsername).charAt(0).toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* Independent Check-In / Match Start Status Bar */}
                {!isCompleted && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10">
                    {/* Your Start / Arrival */}
                    <div className="p-2 rounded-xl bg-[#0A0A7A] border border-white/10 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-white/70">Your Status:</span>
                      {m.userStartedAt ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-400 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Started
                        </span>
                      ) : (
                        <span className="font-bold text-yellow-400 text-[11px]">Not Started</span>
                      )}
                    </div>

                    {/* Opponent Start / Arrival */}
                    <div className="p-2 rounded-xl bg-[#0A0A7A] border border-white/10 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-white/70">Opponent:</span>
                      {m.opponentStartedAt ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-400 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Started
                        </span>
                      ) : (
                        <span className="font-bold text-white/50 text-[11px]">Awaiting Start</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons: START MATCH, SUBMIT SCORE, UPLOAD PROOF, CLAIM WALKOVER, REPORT ISSUE, VIEW BRACKET */}
                <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {/* Report Match Issue (Pre-match or general issue, no screenshot proof needed) */}
                    {!isCompleted && !isDisputed && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDisputeModalMatch(m)}
                        className="h-8 text-xs font-bold border-rose-500/40 text-rose-300 hover:bg-rose-500/20 rounded-full gap-1 cursor-pointer"
                        title="Report match issue to Admin Desk"
                      >
                        <Flag className="w-3.5 h-3.5 text-rose-400" />
                        <span>Report Issue</span>
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Prominent START MATCH button (does NOT trigger any livestream) */}
                    {canStartMatch && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleStartMatch(m)}
                        disabled={isLoadingThis}
                        className="h-8 text-xs font-black bg-[#00C853] hover:bg-[#00B048] text-[#08088F] rounded-full gap-1.5 shadow-lg uppercase tracking-wider animate-bounce hover:animate-none cursor-pointer"
                      >
                        {isLoadingThis ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        <span>Start Match</span>
                      </Button>
                    )}

                    {/* Submit Score Action when match is in progress */}
                    {canSubmitScore && !m.userSubmission && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setSubmitScoreMatch(m)}
                        className="h-8 text-xs font-black bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] rounded-full gap-1.5 shadow-lg uppercase tracking-wider cursor-pointer"
                      >
                        <Trophy className="w-3.5 h-3.5" />
                        <span>Submit Score</span>
                      </Button>
                    )}

                    {/* Upload Screenshot Proof Action when match is disputed */}
                    {isDisputed && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setUploadEvidenceMatch(m)}
                        className="h-8 text-xs font-black bg-rose-500 hover:bg-rose-600 text-white rounded-full gap-1.5 shadow-md uppercase tracking-wider cursor-pointer"
                      >
                        <FileImage className="w-3.5 h-3.5" />
                        <span>Upload Proof</span>
                      </Button>
                    )}

                    {/* Walkover Claim Button */}
                    {canRequestWalkover && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleRequestWalkover(m)}
                        disabled={isLoadingThis}
                        className="h-8 text-xs font-black bg-rose-600 hover:bg-rose-700 text-white rounded-full gap-1 shadow-md uppercase tracking-wider cursor-pointer"
                      >
                        {isLoadingThis ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ShieldAlert className="w-3.5 h-3.5" />
                        )}
                        <span>Claim No-Show Walkover</span>
                      </Button>
                    )}

                    {/* View Bracket Link */}
                    <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-black text-[#FFFF00] hover:text-white hover:bg-white/10 rounded-full gap-1 uppercase tracking-wider cursor-pointer">
                      <Link href={`/tournaments/${m.tournamentId}`}>
                        <span>View Bracket</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10">
            <span className="text-xs text-white/60">
              Showing page <strong className="text-white font-bold">{currentPage}</strong> of{' '}
              <strong className="text-white font-bold">{totalPages}</strong> ({filteredMatches.length} matches)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-9 px-4 rounded-full border-white/20 text-white hover:bg-white/10 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Previous
              </Button>
              <div className="flex items-center gap-1 px-2">
                {Array.from({ length: totalPages }).map((_, i) => {
                  const pageNum = i + 1;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={cn(
                        'w-8 h-8 rounded-full text-xs font-black transition-colors cursor-pointer',
                        currentPage === pageNum
                          ? 'bg-[#FFFF00] text-[#08088F]'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-9 px-4 rounded-full border-white/20 text-white hover:bg-white/10 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
      )}
      </SwipeableTabContainer>

      {/* Report Issue Modal (Strictly without screenshot proof for pre-match/general reports) */}
      {disputeModalMatch && (
        <ReportMatchIssueModal
          isOpen={Boolean(disputeModalMatch)}
          onClose={() => setDisputeModalMatch(null)}
          matchId={disputeModalMatch.id}
          tournamentId={disputeModalMatch.tournamentId}
          reporterParticipantId={disputeModalMatch.userParticipantId || ''}
          opponentParticipantId={disputeModalMatch.opponentParticipantId}
          opponentName={disputeModalMatch.opponentDisplayName || disputeModalMatch.opponentUsername}
          onSuccess={() => {
            setFeedbackMsg({
              type: 'success',
              text: 'Issue submitted. Admin Match Desk will investigate promptly.',
            });
            router.refresh();
          }}
        />
      )}

      {/* Submit Match Score Modal (30-Minute Result Submission Window) */}
      {submitScoreMatch && (
        <SubmitMatchScoreModal
          isOpen={Boolean(submitScoreMatch)}
          onClose={() => setSubmitScoreMatch(null)}
          matchId={submitScoreMatch.id}
          tournamentId={submitScoreMatch.tournamentId}
          participantId={submitScoreMatch.userParticipantId || ''}
          userDisplayName={userDisplayName}
          opponentDisplayName={submitScoreMatch.opponentDisplayName || submitScoreMatch.opponentUsername}
          userSide={submitScoreMatch.userSide}
          existingMyScore={submitScoreMatch.userSubmission?.myScore}
          existingOpponentScore={submitScoreMatch.userSubmission?.opponentScore}
          onSuccess={(result) => {
            if (result.matching || result.verified || result.status === 'completed') {
              setFeedbackMsg({
                type: 'success',
                text: 'Both scores matched! Result automatically verified and marked COMPLETED.',
              });
            } else if (result.conflict || result.status === 'disputed') {
              setFeedbackMsg({
                type: 'error',
                text: 'Conflicting scores reported! Match marked DISPUTED. Please upload screenshot proof.',
              });
            } else {
              setFeedbackMsg({
                type: 'success',
                text: 'Score submitted successfully! Waiting for opponent score submission.',
              });
            }
            router.refresh();
          }}
        />
      )}

      {/* Upload Match Evidence Modal (Cloudinary Upload for Conflicting Scores) */}
      {uploadEvidenceMatch && (
        <UploadMatchEvidenceModal
          isOpen={Boolean(uploadEvidenceMatch)}
          onClose={() => setUploadEvidenceMatch(null)}
          matchId={uploadEvidenceMatch.id}
          tournamentId={uploadEvidenceMatch.tournamentId}
          participantId={uploadEvidenceMatch.userParticipantId || ''}
          existingScreenshotUrl={uploadEvidenceMatch.userSubmission?.screenshotUrl}
          onSuccess={() => {
            setFeedbackMsg({
              type: 'success',
              text: 'Screenshot proof uploaded to Cloudinary! Admin dispute ticket updated.',
            });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
