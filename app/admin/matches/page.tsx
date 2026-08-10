'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Swords,
  Search,
  Calendar,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  Edit,
  Radio,
  Clock,
  Zap,
} from 'lucide-react';
import {
  getAllAdminMatches,
  getMatchDashboardStats,
  startMatch,
  updateLiveScore,
  submitMatchResult,
  MatchWithDetails,
  MatchDashboardStats,
} from '@/services/matchService';
import { getTournaments } from '@/services/tournamentService';
import type { Tournament } from '@/types/database';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches';
import dynamic from 'next/dynamic';

const ScoreEntryModal = dynamic(
  () => import('@/components/match/ScoreEntryModal').then((mod) => mod.ScoreEntryModal),
  { ssr: false }
);

const STAGE_OPTIONS = [
  { label: 'All Stages', value: 'all' },
  { label: 'Group Stage', value: 'group' },
  { label: 'Round of 16', value: 'round_of_16' },
  { label: 'Quarterfinal', value: 'quarterfinal' },
  { label: 'Semifinal', value: 'semifinal' },
  { label: 'Final', value: 'final' },
];

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Scheduled', value: 'pending' },
  { label: 'Live', value: 'live' },
  { label: 'Completed', value: 'completed' },
  { label: 'Walkover', value: 'walkover' },
];

export default function AdminMatchCenterPage() {
  const [matches, setMatches] = useState<MatchWithDetails[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [stats, setStats] = useState<MatchDashboardStats>({
    totalMatches: 0,
    liveCount: 0,
    scheduledCount: 0,
    completedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedTournament, setSelectedTournament] = useState('all');
  const [selectedStage, setSelectedStage] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today'>('all');
  const [search, setSearch] = useState('');

  // Modal State
  const [activeScoreMatch, setActiveScoreMatch] = useState<MatchWithDetails | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchMatchCenterData = useCallback(async () => {
    try {
      const [mList, sData, tList] = await Promise.all([
        getAllAdminMatches({
          tournamentId: selectedTournament,
          stage: selectedStage,
          status: selectedStatus,
          date: dateFilter,
          search,
        }),
        getMatchDashboardStats(selectedTournament !== 'all' ? selectedTournament : undefined),
        getTournaments(),
      ]);

      setMatches(mList);
      setStats(sData);
      setTournaments(tList);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load match center data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedTournament, selectedStage, selectedStatus, dateFilter, search]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const [mList, sData, tList] = await Promise.all([
          getAllAdminMatches({
            tournamentId: selectedTournament,
            stage: selectedStage,
            status: selectedStatus,
            date: dateFilter,
            search,
          }),
          getMatchDashboardStats(selectedTournament !== 'all' ? selectedTournament : undefined),
          getTournaments(),
        ]);

        if (isMounted) {
          setMatches(mList);
          setStats(sData);
          setTournaments(tList);
          setError(null);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load match center data';
          setError(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [selectedTournament, selectedStage, selectedStatus, dateFilter, search]);

  // Supabase Realtime Subscription
  useRealtimeMatches(fetchMatchCenterData);

  const handleStartMatch = async (m: MatchWithDetails) => {
    setActionLoading(true);
    try {
      await startMatch(m.id, m.tournamentId);
      fetchMatchCenterData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start match';
      alert(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateLiveScore = async (scoreA: number, scoreB: number) => {
    if (!activeScoreMatch) return;
    try {
      await updateLiveScore(activeScoreMatch.id, activeScoreMatch.tournamentId, scoreA, scoreB);
      fetchMatchCenterData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update live score';
      console.error(msg);
      throw err;
    }
  };

  const handleCompleteMatch = async (scoreA: number, scoreB: number) => {
    if (!activeScoreMatch) return;
    setActionLoading(true);
    try {
      await submitMatchResult(activeScoreMatch.id, activeScoreMatch.tournamentId, {
        score_a: scoreA,
        score_b: scoreB,
        result_type: 'normal',
      });
      setActiveScoreMatch(null);
      fetchMatchCenterData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to complete match';
      alert(msg);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
              Match Center & Live Scoring
            </h1>
            <Badge variant="efootball" className="gap-1.5 py-1 px-3">
              <Radio className="h-3 w-3 animate-pulse text-emerald-400" />
              <span>Realtime Connected</span>
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Centralized tournament fixture control, live score updates, and match results.
          </p>
        </div>
      </div>

      {/* Dynamic Summary Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white border-border shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Matches
              </p>
              <h3 className="text-2xl font-black text-[#0B3323] mt-0.5">{stats.totalMatches}</h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-secondary text-primary flex items-center justify-center font-bold">
              <Swords className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200 shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                Live Now
              </p>
              <h3 className="text-2xl font-black text-emerald-950 mt-0.5">{stats.liveCount}</h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold animate-pulse">
              <Radio className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-border shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Scheduled
              </p>
              <h3 className="text-2xl font-black text-[#0B3323] mt-0.5">{stats.scheduledCount}</h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-border shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Completed
              </p>
              <h3 className="text-2xl font-black text-[#0B3323] mt-0.5">{stats.completedCount}</h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-[#F4F8F5] text-emerald-700 flex items-center justify-center font-bold">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Controls Bar */}
      <Card className="bg-white border-border p-4 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Tournament Filter */}
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
              Tournament
            </label>
            <select
              value={selectedTournament}
              onChange={(e) => setSelectedTournament(e.target.value)}
              className="w-full h-9 rounded-xl border border-border bg-white px-3 text-xs font-medium text-[#0B3323] focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All Tournaments</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Stage Filter */}
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
              Stage / Round
            </label>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="w-full h-9 rounded-xl border border-border bg-white px-3 text-xs font-medium text-[#0B3323] focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {STAGE_OPTIONS.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-9 rounded-xl border border-border bg-white px-3 text-xs font-medium text-[#0B3323] focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {STATUS_OPTIONS.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date Toggle */}
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
              Date Filter
            </label>
            <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#F4F8F5] rounded-xl border border-border/60 h-9">
              <button
                type="button"
                onClick={() => setDateFilter('all')}
                className={`text-xs font-bold rounded-lg transition-all ${
                  dateFilter === 'all'
                    ? 'bg-white text-[#0B3323] shadow-xs'
                    : 'text-muted-foreground hover:text-[#0B3323]'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('today')}
                className={`text-xs font-bold rounded-lg transition-all ${
                  dateFilter === 'today'
                    ? 'bg-white text-[#0B3323] shadow-xs'
                    : 'text-muted-foreground hover:text-[#0B3323]'
                }`}
              >
                Today
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Player, Tournament, Match #"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 text-xs rounded-xl"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Main Content Area */}
      {loading ? (
        <div className="min-h-[300px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-[#0B3323]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-xs font-semibold">Loading Match Center...</span>
          </div>
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-destructive/10 rounded-2xl border border-destructive/20 space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <h3 className="text-lg font-bold text-[#0B3323]">{error}</h3>
        </div>
      ) : matches.length === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary mb-3">
            <Swords className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-bold text-[#0B3323]">No matches found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
            No matches correspond to the active filters or search query.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {matches.map((m) => {
            const isCompleted = m.status === 'completed' || m.status === 'walkover';
            const isLive = m.status === 'live';
            const isScheduled = m.status === 'pending';
            const isLocked = m.tournamentStatus === 'completed' || (m.group_id && m.isGroupStageFinalized);

            return (
              <Card
                key={m.id}
                className={`transition-all bg-white border-border flex flex-col justify-between ${
                  isLive ? 'border-emerald-500 shadow-md ring-1 ring-emerald-500/30' : 'hover:border-primary/40'
                }`}
              >
                {/* Match Header */}
                <CardHeader className="p-4 pb-2 space-y-2 border-b border-border/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground truncate max-w-[180px]">
                      {m.tournamentName}
                    </span>
                    <Badge
                      variant={isLive ? 'default' : isCompleted ? 'outline' : 'secondary'}
                      className={`text-[10px] uppercase font-bold py-0.5 px-2 ${
                        isLive ? 'bg-emerald-600 text-white animate-pulse' : ''
                      }`}
                    >
                      {isLive ? 'LIVE' : m.status}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Badge variant="efootball" className="text-[10px] font-bold uppercase">
                      {m.stageType} — Match {String(m.match_position).padStart(2, '0')}
                    </Badge>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {m.roundName}
                    </span>
                  </div>
                </CardHeader>

                {/* Score & Participant Display */}
                <CardContent className="p-4 py-5 space-y-3">
                  <div className="grid grid-cols-5 items-center gap-2 text-center">
                    {/* Player A */}
                    <div className="col-span-2 text-left space-y-0.5">
                      <span className="text-xs font-extrabold text-[#0B3323] truncate block">
                        {m.participantAUser?.username || 'TBD'}
                      </span>
                      {m.winner_id === m.participant_a && (
                        <Badge variant="efootball" className="text-[9px] py-0 px-1 font-mono">
                          WINNER
                        </Badge>
                      )}
                    </div>

                    {/* Score */}
                    <div className="col-span-1 py-1.5 rounded-xl bg-[#F4F8F5] border border-border flex items-center justify-center font-mono font-black text-base text-[#0B3323]">
                      {isScheduled ? (
                        <span className="text-xs text-muted-foreground font-normal">VS</span>
                      ) : (
                        <span>
                          {m.score_a} - {m.score_b}
                        </span>
                      )}
                    </div>

                    {/* Player B */}
                    <div className="col-span-2 text-right space-y-0.5">
                      <span className="text-xs font-extrabold text-[#0B3323] truncate block">
                        {m.participantBUser?.username || 'TBD'}
                      </span>
                      {m.winner_id === m.participant_b && (
                        <Badge variant="efootball" className="text-[9px] py-0 px-1 font-mono">
                          WINNER
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Scheduled Time info */}
                  {m.scheduled_time && (
                    <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                      <Calendar className="h-3 w-3 text-primary" />
                      <span>{formatDate(m.scheduled_time)}</span>
                    </div>
                  )}
                </CardContent>

                {/* Action Buttons Footer */}
                <div className="p-3 bg-[#F4F8F5] border-t border-border/50 flex items-center justify-between gap-2">
                  <Button asChild variant="outline" size="sm" className="h-8 px-2 text-xs font-semibold">
                    <Link href={`/admin/tournaments/${m.tournamentId}/matches/${m.id}`}>
                      <Eye className="h-3.5 w-3.5 mr-1 text-primary" />
                      Details
                    </Link>
                  </Button>

                  <div className="flex items-center gap-1.5">
                    {/* Scheduled Match -> Start Match */}
                    {isScheduled && !isLocked && (
                      <Button
                        size="sm"
                        onClick={() => handleStartMatch(m)}
                        disabled={actionLoading || !m.participant_a || !m.participant_b}
                        className="h-8 px-2.5 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white gap-1"
                      >
                        <Play className="h-3 w-3 fill-current" />
                        <span>Start</span>
                      </Button>
                    )}

                    {/* Live Match -> Update Live Score */}
                    {isLive && !isLocked && (
                      <Button
                        size="sm"
                        onClick={() => setActiveScoreMatch(m)}
                        className="h-8 px-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1 animate-pulse"
                      >
                        <Zap className="h-3 w-3" />
                        <span>Score</span>
                      </Button>
                    )}

                    {/* Completed Match -> Edit Result */}
                    {isCompleted && !isLocked && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveScoreMatch(m)}
                        className="h-8 px-2.5 text-xs font-semibold text-[#0B3323]"
                      >
                        <Edit className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                    )}

                    {/* Locked Match -> View Only */}
                    {isLocked && (
                      <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                        Locked
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Quick Score Modal */}
      {activeScoreMatch && (
        <ScoreEntryModal
          isOpen={Boolean(activeScoreMatch)}
          onClose={() => setActiveScoreMatch(null)}
          onUpdateLiveScore={handleUpdateLiveScore}
          onCompleteMatch={handleCompleteMatch}
          participantA={activeScoreMatch.participantAUser?.username || 'Player A'}
          participantB={activeScoreMatch.participantBUser?.username || 'Player B'}
          currentScoreA={activeScoreMatch.score_a}
          currentScoreB={activeScoreMatch.score_b}
          isLive={activeScoreMatch.status === 'live'}
          isGroupMatch={Boolean(activeScoreMatch.group_id)}
          isLoading={actionLoading}
        />
      )}
    </div>
  );
}
