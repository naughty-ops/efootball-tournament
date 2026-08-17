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
} from 'lucide-react';
import { getTournamentGroups, GroupStageOverview } from '@/services/groupService';
import { formatDate, cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FullMatchData } from '@/services/matchService';

export default function AdminGroupMatchesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  const [overview, setOverview] = useState<GroupStageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedRound, setSelectedRound] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    async function load() {
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
    }
    load();
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

  // Flatten and filter all group matches
  const allGroupMatchesWithGroupName: (FullMatchData & { groupName: string })[] = [];
  for (const gDet of groups) {
    for (const m of gDet.matches) {
      allGroupMatchesWithGroupName.push({
        ...m,
        groupName: gDet.group.name,
      });
    }
  }

  const filteredMatches = allGroupMatchesWithGroupName.filter((m) => {
    // Group filter
    if (selectedGroup !== 'all' && m.group_id !== selectedGroup) return false;

    // Status filter
    if (selectedStatus !== 'all' && m.status !== selectedStatus) return false;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const pA = m.participantAUser?.username.toLowerCase() || '';
      const pB = m.participantBUser?.username.toLowerCase() || '';
      if (!pA.includes(q) && !pB.includes(q)) return false;
    }

    return true;
  });

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
              Group Stage Match Schedule
            </h1>
            <Badge variant="efootball" className="text-xs py-1 px-3 gap-1 font-bold">
              <Swords className="h-3.5 w-3.5 text-primary" />
              <span>{totalGroupMatches} Matches ({roundsPerPair} Round Mode)</span>
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Tournament: <span className="font-bold text-[#0B3323]">{tournament.name}</span>
          </p>
        </div>

        <Button asChild variant="outline" size="sm" className="font-bold gap-2 rounded-xl text-xs border-border">
          <Link href={`/admin/tournaments/${tournamentId}/groups`}>
            <span>View Group Standings</span>
          </Link>
        </Button>
      </div>

      {/* Live Standings Card */}
      {groups.length > 0 && (
        <Card className="bg-white border-border shadow-2xs overflow-hidden">
          <div className="p-4 bg-[#F4F8F5] border-b border-border flex items-center justify-between">
            <h3 className="text-xs font-extrabold text-[#0B3323] uppercase tracking-wider flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <span>{groups.length === 1 ? 'Live League Standings Table' : 'Live Group Standings Summary'}</span>
            </h3>
            <Badge variant="outline" className="text-[10px] font-mono font-bold text-muted-foreground">
              Realtime Standings
            </Badge>
          </div>
          <div className="w-full overflow-x-auto no-scrollbar">
            <table className="w-full min-w-[500px] text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left py-2 px-3 font-bold text-[#0B3323]">Player</th>
                  <th className="py-2 px-2 font-bold text-center text-muted-foreground">P</th>
                  <th className="py-2 px-2 font-bold text-center text-emerald-600">W</th>
                  <th className="py-2 px-2 font-bold text-center text-amber-600">D</th>
                  <th className="py-2 px-2 font-bold text-center text-red-500">L</th>
                  <th className="py-2 px-2 font-bold text-center text-muted-foreground">GF</th>
                  <th className="py-2 px-2 font-bold text-center text-muted-foreground">GA</th>
                  <th className="py-2 px-2 font-bold text-center text-muted-foreground">GD</th>
                  <th className="py-2 px-2 font-bold text-center text-[#0B3323]">PTS</th>
                </tr>
              </thead>
              <tbody>
                {(groups[0]?.standings || []).map((row, idx) => {
                  const isTopQual = idx < (overview.qualifiersPerGroup || 8);
                  return (
                    <tr key={row.participant.id} className={cn('border-b border-border/40 last:border-0 hover:bg-[#F4F8F5]/60 transition-colors', isTopQual ? 'bg-emerald-50/40 font-semibold' : '')}>
                      <td className="py-2 px-3 flex items-center gap-2">
                        <span className={cn('flex h-4 w-4 items-center justify-center rounded text-[9px] font-black', isTopQual ? 'bg-emerald-500 text-white' : 'bg-secondary text-muted-foreground')}>
                          {idx + 1}
                        </span>
                        <span className="font-bold text-[#0B3323] truncate max-w-[130px]">{row.participant.username}</span>
                        {idx === 0 && <span className="text-[10px]">🏆</span>}
                      </td>
                      <td className="py-2 px-2 text-center text-muted-foreground">{row.played}</td>
                      <td className="py-2 px-2 text-center text-emerald-600 font-semibold">{row.wins}</td>
                      <td className="py-2 px-2 text-center text-amber-600 font-semibold">{row.draws}</td>
                      <td className="py-2 px-2 text-center text-red-500 font-semibold">{row.losses}</td>
                      <td className="py-2 px-2 text-center text-muted-foreground">{row.goalsFor}</td>
                      <td className="py-2 px-2 text-center text-muted-foreground">{row.goalsAgainst}</td>
                      <td className="py-2 px-2 text-center font-bold">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                      <td className="py-2 px-2 text-center font-black text-[#0B3323]">{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Search & Filters Bar */}
      <Card className="p-4 bg-white border-border shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative col-span-1 sm:col-span-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search player..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs h-9"
            />
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

          {/* Round Filter */}
          <div>
            <select
              value={selectedRound}
              onChange={(e) => setSelectedRound(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-[#0B3323]"
            >
              <option value="all">All Rounds</option>
              <option value="1">Round 1 (First Legs)</option>
              {roundsPerPair === 2 && <option value="2">Round 2 (Second Legs)</option>}
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
              <option value="pending">Pending</option>
              <option value="live">Live</option>
              <option value="completed">Completed</option>
              <option value="walkover">Walkover</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Matches Grid / Empty State */}
      {filteredMatches.length === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-primary mb-4">
            <Swords className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-[#0B3323]">No group matches found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-6">
            No fixtures matched your selected filters. Try broadening your filter options.
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
            Clear Filters
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMatches.map((m) => (
            <AdminGroupMatchCard key={m.id} match={m} tournamentId={tournamentId} />
          ))}
        </div>
      )}
    </div>
  );
}

function AdminGroupMatchCard({
  match,
  tournamentId,
}: {
  match: FullMatchData & { groupName: string };
  tournamentId: string;
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

        {isCompleted ? (
          <Button asChild variant="outline" size="sm" className="h-8 text-xs font-bold border-border">
            <Link href={`/admin/tournaments/${tournamentId}/matches/${match.id}`}>
              <Edit className="h-3.5 w-3.5 mr-1" />
              <span>Edit Result</span>
            </Link>
          </Button>
        ) : (
          <Button asChild size="sm" className="h-8 text-xs font-bold gap-1 rounded-xl">
            <Link href={`/admin/tournaments/${tournamentId}/matches/${match.id}`}>
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Enter Result</span>
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}
