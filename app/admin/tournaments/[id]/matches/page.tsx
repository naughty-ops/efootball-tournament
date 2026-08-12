'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Swords,
  Clock,
  Trophy,
  AlertCircle,
  Loader2,
  Edit,
  Eye,
  PlusCircle,
  Radio,
} from 'lucide-react';
import { getTournamentById, TournamentWithStats } from '@/services/tournamentService';
import { getMatchesByTournament, RoundWithMatches, FullMatchData } from '@/services/matchService';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const STATUS_TABS = [
  { label: 'All Matches', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Live Now', value: 'live' },
  { label: 'Completed', value: 'completed' },
  { label: 'Walkover', value: 'walkover' },
];

export default function AdminMatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params);

  const [tournament, setTournament] = useState<TournamentWithStats | null>(null);
  const [rounds, setRounds] = useState<RoundWithMatches[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRoundId, setSelectedRoundId] = useState('all');

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const [tData, rData] = await Promise.all([
          getTournamentById(tournamentId),
          getMatchesByTournament(tournamentId, statusFilter),
        ]);
        if (isMounted) {
          if (!tData) {
            setError('Tournament not found.');
          } else {
            setTournament(tData);
            setRounds(rData);
            setError(null);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load tournament matches';
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
  }, [tournamentId, statusFilter]);

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#0B3323]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs font-semibold">Loading Tournament Matches...</span>
        </div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-[#0B3323]">{error || 'Tournament Not Found'}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/tournaments">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tournaments
          </Link>
        </Button>
      </div>
    );
  }

  const totalMatchesCount = rounds.reduce((acc, r) => acc + r.matches.length, 0);

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary -ml-2 mb-1">
            <Link href={`/admin/tournaments/${tournament.id}`}>
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Tournament Details</span>
            </Link>
          </Button>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
              Match Schedule & Results
            </h1>
            <Badge variant="efootball" className="text-xs py-1 px-3 gap-1 font-bold">
              <Swords className="h-3.5 w-3.5 text-primary" />
              <span>{totalMatchesCount} Matches</span>
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Tournament: <span className="font-bold text-[#0B3323]">{tournament.name}</span>
          </p>
        </div>

        <Button asChild variant="outline" size="sm" className="font-bold gap-2 rounded-xl text-xs border-border">
          <Link href={`/admin/tournaments/${tournamentId}/bracket`}>
            <span>View Full Bracket</span>
          </Link>
        </Button>
      </div>

      {/* Filter Bar: Status & Round Selector */}
      <div className="space-y-3 bg-white p-4 rounded-2xl border border-border shadow-xs">
        {/* Status Filter Tabs */}
        <div>
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block mb-1.5">
            Status Filter
          </span>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap touch-target ${
                  statusFilter === tab.value
                    ? 'bg-[#0B3323] text-white shadow-xs'
                    : 'bg-white border border-border text-muted-foreground hover:bg-secondary hover:text-[#0B3323]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Round Filter Tabs (Knockout / League Round Selector) */}
        {rounds.length > 0 && (
          <div className="pt-2 border-t border-border/50">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block mb-1.5">
              Select Round
            </span>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              <button
                onClick={() => setSelectedRoundId('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap touch-target ${
                  selectedRoundId === 'all'
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-white border border-border text-muted-foreground hover:bg-secondary hover:text-[#0B3323]'
                }`}
              >
                All Rounds ({rounds.length})
              </button>
              {rounds.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRoundId(r.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap touch-target ${
                    selectedRoundId === r.id
                      ? 'bg-primary text-white shadow-xs'
                      : 'bg-white border border-border text-muted-foreground hover:bg-secondary hover:text-[#0B3323]'
                  }`}
                >
                  {r.name} ({r.matches.length})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Matches List Grouped by Round / Empty State */}
      {rounds.length === 0 || totalMatchesCount === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-primary mb-4">
            <Swords className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-[#0B3323]">No matches found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-6">
            {statusFilter !== 'all'
              ? `No matches found matching filter "${statusFilter}".`
              : 'Tournament matches have not been generated yet. Visit the Bracket Generator to create fixtures.'}
          </p>
          <Button asChild className="font-bold gap-2 rounded-xl">
            <Link href={`/admin/tournaments/${tournamentId}/bracket`}>
              <Swords className="h-4 w-4" />
              <span>Go to Bracket Generator</span>
            </Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-8">
          {rounds
            .filter((round) => selectedRoundId === 'all' || round.id === selectedRoundId)
            .map((round) => (
              <div key={round.id} className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h3 className="text-lg font-extrabold text-[#0B3323] flex items-center gap-2">
                    <span>{round.name}</span>
                    <Badge variant="outline" className="text-[11px] font-mono font-bold">
                      {round.matches.length} {round.matches.length === 1 ? 'Match' : 'Matches'}
                    </Badge>
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {round.matches.map((m) => (
                    <AdminMatchCard key={m.id} match={m} tournamentId={tournamentId} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * Admin Match Row/Card Component
 */
function AdminMatchCard({ match, tournamentId }: { match: FullMatchData; tournamentId: string }) {
  const playerA = match.participantAUser;
  const playerB = match.participantBUser;
  const winner = match.winnerUser;

  const isReadyToPlay = Boolean(playerA && playerB);
  const isCompleted = match.status === 'completed' || match.status === 'walkover';
  const isLive = match.status === 'live';

  return (
    <Card className="border-border bg-white shadow-xs hover:border-primary/50 transition-all p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between font-mono text-xs pb-2 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#0B3323]">Match #{match.match_position}</span>
          {match.scheduled_time && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(match.scheduled_time)}
            </span>
          )}
        </div>

        <Badge
          variant={
            isLive ? 'destructive' : isCompleted ? 'default' : isReadyToPlay ? 'secondary' : 'outline'
          }
          className="capitalize font-bold text-[10px]"
        >
          {isLive && <Radio className="h-3 w-3 mr-1 animate-pulse" />}
          {match.status}
        </Badge>
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
            <span className="truncate">{playerA ? playerA.username : 'Waiting for opponent...'}</span>
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
            <span className="truncate">{playerB ? playerB.username : 'Waiting for opponent...'}</span>
          </div>

          <span className="font-mono font-extrabold text-sm ml-2">{isCompleted ? match.score_b : '-'}</span>
        </div>
      </div>

      {/* Winner Display if Completed */}
      {winner && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-100/60 p-2 rounded-xl font-bold">
          <Trophy className="h-3.5 w-3.5 shrink-0" />
          <span>Winner: {winner.username}</span>
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
          <Button
            asChild
            size="sm"
            disabled={!playerA || !playerB}
            className="h-8 text-xs font-bold gap-1 rounded-xl"
          >
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
