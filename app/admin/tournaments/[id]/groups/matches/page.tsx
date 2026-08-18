'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Swords,
  Clock,
  AlertCircle,
  Loader2,
  Edit,
  Eye,
  PlusCircle,
  Radio,
  Search,
  Trophy,
  Filter,
  X,
  CheckCircle2,
} from 'lucide-react';
import { getTournamentGroups, GroupStageOverview } from '@/services/groupService';
import { submitMatchResult, editMatchResult, FullMatchData } from '@/services/matchService';
import { formatDate, cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import dynamic from 'next/dynamic';

const ScoreEntryModal = dynamic(
  () => import('@/components/match/ScoreEntryModal').then((mod) => mod.ScoreEntryModal),
  { ssr: false }
);

export default function AdminGroupMatchesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  const [overview, setOverview] = useState<GroupStageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedRound, setSelectedRound] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Score Entry Modal State
  const [activeScoreMatch, setActiveScoreMatch] = useState<FullMatchData | null>(null);

  const fetchGroupData = async () => {
    try {
      const data = await getTournamentGroups(tournamentId);
      setOverview(data);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load group matches';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupData();
  }, [tournamentId]);

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#0B3323]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs font-semibold">Loading Group Matches...</span>
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-[#0B3323]">{error || 'Groups Not Found'}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/tournaments/${tournamentId}/groups`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Groups Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  const { tournament, groups, totalGroupMatches, roundsPerPair } = overview;

  // Flatten and enhance all group matches with group name & round label
  const allGroupMatchesWithDetails: (FullMatchData & { groupName: string; roundName?: string })[] = [];
  const uniqueRoundNames = new Set<string>();

  for (const gDet of groups) {
    for (const m of gDet.matches) {
      allGroupMatchesWithDetails.push({
        ...m,
        groupName: gDet.group.name,
      });
    }
  }

  // Filter logic
  const filteredMatches = allGroupMatchesWithDetails.filter((m) => {
    // Group filter
    if (selectedGroup !== 'all' && m.group_id !== selectedGroup) return false;

    // Status filter
    if (selectedStatus !== 'all' && m.status !== selectedStatus) return false;

    // Round filter
    if (selectedRound !== 'all') {
      if (selectedRound === '1' && m.round_id) {
        // Leg 1 check
      } else if (selectedRound === '2' && m.round_id) {
        // Leg 2 check
      }
    }

    // Smart Search filter (matches usernames, real names, seed numbers, match position, or score)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const pA = m.participantAUser?.username.toLowerCase() || '';
      const pAReal = m.participantAUser?.real_name?.toLowerCase() || '';
      const pB = m.participantBUser?.username.toLowerCase() || '';
      const pBReal = m.participantBUser?.real_name?.toLowerCase() || '';
      const matchPos = `#${m.match_position}`.toLowerCase();
      const scoreStr = `${m.score_a}-${m.score_b}`;

      const matchesSearch =
        pA.includes(q) ||
        pAReal.includes(q) ||
        pB.includes(q) ||
        pBReal.includes(q) ||
        matchPos.includes(q) ||
        scoreStr.includes(q) ||
        q === `#${m.match_position}` ||
        q === `${m.match_position}`;

      if (!matchesSearch) return false;
    }

    return true;
  });

  const handleSaveScore = async (scoreA: number, scoreB: number) => {
    if (!activeScoreMatch) return;
    setActionLoading(true);
    try {
      if (activeScoreMatch.status === 'completed' || activeScoreMatch.status === 'walkover') {
        await editMatchResult(activeScoreMatch.id, tournamentId, {
          score_a: scoreA,
          score_b: scoreB,
          result_type: 'normal',
        });
      } else {
        await submitMatchResult(activeScoreMatch.id, tournamentId, {
          score_a: scoreA,
          score_b: scoreB,
          result_type: 'normal',
        });
      }
      setActiveScoreMatch(null);
      await fetchGroupData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update match score');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary -ml-2 mb-1">
            <Link href={`/admin/tournaments/${tournamentId}/groups`}>
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Groups Dashboard</span>
            </Link>
          </Button>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
              Fixture Schedule & Score Center
            </h1>
            <Badge variant="efootball" className="text-xs py-1 px-3 gap-1 font-bold">
              <Swords className="h-3.5 w-3.5 text-primary" />
              <span>{totalGroupMatches} Matches Total</span>
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Tournament: <span className="font-bold text-[#0B3323]">{tournament.name}</span>
          </p>
        </div>

        <Button asChild variant="outline" size="sm" className="font-bold gap-2 rounded-xl text-xs border-border">
          <Link href={`/admin/tournaments/${tournamentId}/groups`}>
            <Trophy className="h-4 w-4 text-amber-500" />
            <span>View Points Table</span>
          </Link>
        </Button>
      </div>

      {/* Smart Search & Filters Bar */}
      <Card className="p-4 bg-white border-border shadow-xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <span className="text-xs font-extrabold text-[#0B3323] uppercase tracking-wider">
              Smart Fixture Search & Filters
            </span>
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground">
            Showing <strong className="text-[#0B3323] font-bold">{filteredMatches.length}</strong> of {totalGroupMatches} Matches
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Smart Player / Match Search */}
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Smart Search by player name, match #, or score..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs h-9 font-semibold bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Group Filter */}
          <div>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-[#0B3323]"
            >
              <option value="all">All Groups</option>
              {groups.map((gDet) => (
                <option key={gDet.group.id} value={gDet.group.id}>
                  {gDet.group.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-[#0B3323]"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending (Unplayed)</option>
              <option value="live">Live Now</option>
              <option value="completed">Completed</option>
              <option value="walkover">Walkover</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Status Badges */}
        <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'All Fixtures' },
            { id: 'pending', label: '⏳ Pending' },
            { id: 'live', label: '🔴 Live' },
            { id: 'completed', label: '✓ Completed' },
          ].map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => setSelectedStatus(st.id)}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                selectedStatus === st.id
                  ? 'bg-primary text-white shadow-2xs'
                  : 'bg-[#F4F8F5] text-slate-700 hover:bg-[#E4ECE7]'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Matches Grid / Empty State */}
      {filteredMatches.length === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center bg-white">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-primary mb-4">
            <Swords className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-[#0B3323]">No matches found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-6">
            No fixtures matched your search query "{searchQuery}". Try searching for another player or clearing your filters.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setSelectedGroup('all');
              setSelectedRound('all');
              setSelectedStatus('all');
              setSearchQuery('');
            }}
            className="font-bold gap-2 rounded-xl text-xs"
          >
            Clear Search & Filters
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMatches.map((m) => (
            <AdminGroupMatchCard
              key={m.id}
              match={m}
              tournamentId={tournamentId}
              onOpenScoreModal={() => setActiveScoreMatch(m)}
            />
          ))}
        </div>
      )}

      {/* Smart Inline Score Modal */}
      {activeScoreMatch && (
        <ScoreEntryModal
          isOpen={Boolean(activeScoreMatch)}
          onClose={() => setActiveScoreMatch(null)}
          onCompleteMatch={(scoreA, scoreB) => handleSaveScore(scoreA, scoreB)}
          onSubmitScore={(scoreA, scoreB) => handleSaveScore(scoreA, scoreB)}
          participantA={activeScoreMatch.participantAUser?.username || 'Player A'}
          participantB={activeScoreMatch.participantBUser?.username || 'Player B'}
          currentScoreA={activeScoreMatch.score_a}
          currentScoreB={activeScoreMatch.score_b}
          isLive={activeScoreMatch.status === 'live'}
          isGroupMatch={Boolean(activeScoreMatch.group_id)}
          allowDraw={true}
          isLoading={actionLoading}
        />
      )}
    </div>
  );
}

function AdminGroupMatchCard({
  match,
  tournamentId,
  onOpenScoreModal,
}: {
  match: FullMatchData & { groupName: string };
  tournamentId: string;
  onOpenScoreModal: () => void;
}) {
  const playerA = match.participantAUser;
  const playerB = match.participantBUser;
  const winner = match.winnerUser;

  const isCompleted = match.status === 'completed' || match.status === 'walkover';
  const isDraw = isCompleted && match.status === 'completed' && match.score_a === match.score_b;
  const isLive = match.status === 'live';

  return (
    <Card className="border-border bg-white shadow-xs hover:border-primary/50 transition-all p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between font-mono text-xs pb-2 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-extrabold text-[10px]">
            {match.groupName}
          </Badge>
          <span className="font-bold text-[#0B3323]">Match #{match.match_position}</span>
          {match.scheduled_time && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(match.scheduled_time)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isDraw && (
            <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-800 border-amber-300 font-bold">
              Draw (1 pt each)
            </Badge>
          )}
          <Badge
            variant={isLive ? 'destructive' : isCompleted ? 'default' : 'secondary'}
            className="capitalize font-bold text-[10px]"
          >
            {isLive && <Radio className="h-3 w-3 mr-1 animate-pulse" />}
            {match.status}
          </Badge>
        </div>
      </div>

      {/* Participants & Scores */}
      <div className="space-y-2 py-1">
        {/* Slot A */}
        <div
          className={`flex items-center justify-between p-2 rounded-xl border text-xs font-semibold ${
            winner?.id === playerA?.id
              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-bold'
              : 'bg-[#F4F8F5] border-border text-[#0B3323]'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            {playerA?.seed_number && (
              <Badge variant="efootball" className="text-[10px] px-1.5 py-0 font-mono">
                #{playerA.seed_number}
              </Badge>
            )}
            <span className="truncate">{playerA ? playerA.username : 'TBD'}</span>
          </div>
          <span className="font-mono font-extrabold text-sm ml-2">{isCompleted ? match.score_a : '-'}</span>
        </div>

        {/* Slot B */}
        <div
          className={`flex items-center justify-between p-2 rounded-xl border text-xs font-semibold ${
            winner?.id === playerB?.id
              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-bold'
              : 'bg-[#F4F8F5] border-border text-[#0B3323]'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            {playerB?.seed_number && (
              <Badge variant="efootball" className="text-[10px] px-1.5 py-0 font-mono">
                #{playerB.seed_number}
              </Badge>
            )}
            <span className="truncate">{playerB ? playerB.username : 'TBD'}</span>
          </div>
          <span className="font-mono font-extrabold text-sm ml-2">{isCompleted ? match.score_b : '-'}</span>
        </div>
      </div>

      {/* Winner Display if Completed */}
      {winner && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-100/60 p-2 rounded-xl font-bold">
          <Trophy className="h-3.5 w-3.5 shrink-0" />
          <span>Match Winner: {winner.username} (3 Pts)</span>
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-semibold">
          <Link href={`/admin/tournaments/${tournamentId}/matches/${match.id}`}>
            <Eye className="h-3.5 w-3.5 mr-1" />
            <span>Details</span>
          </Link>
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={onOpenScoreModal}
          className={`h-8 text-xs font-bold gap-1 rounded-xl ${
            isCompleted
              ? 'bg-secondary text-[#0B3323] hover:bg-secondary/80 border border-border'
              : 'bg-primary text-white shadow-2xs'
          }`}
        >
          {isCompleted ? <Edit className="h-3.5 w-3.5" /> : <PlusCircle className="h-3.5 w-3.5" />}
          <span>{isCompleted ? 'Edit Score' : 'Record Score'}</span>
        </Button>
      </div>
    </Card>
  );
}
