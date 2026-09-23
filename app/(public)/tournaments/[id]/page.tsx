'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Trophy, Users, Calendar, ChevronLeft, Loader2, RefreshCw,
  LayoutGrid, Target, Swords, GitBranch,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import {
  getPublicTournament,
  getPublicTournamentStageInfo,
  getPublicParticipants,
  getPublicGroupStage,
  getPublicBracket,
  getPublicMatches,
  type PublicParticipant,
} from '@/services/publicTournamentService';
import type { TournamentWithStats } from '@/services/tournamentService';
import type { GroupStageOverview } from '@/services/groupService';
import type { BracketOverview } from '@/services/bracketService';
import type { RoundWithMatches } from '@/services/matchService';
import { useRealtimeMatches, type RealtimePayload } from '@/hooks/useRealtimeMatches';
import PublicGroupsTab from '@/components/public/tournament/PublicGroupsTab';
import PublicMatchesTab from '@/components/public/tournament/PublicMatchesTab';
import PublicBracketTab from '@/components/public/tournament/PublicBracketTab';
import PublicOverviewTab from '@/components/public/tournament/PublicOverviewTab';
import PublicParticipantsTab from '@/components/public/tournament/PublicParticipantsTab';
import PublicChampionBanner from '@/components/public/tournament/PublicChampionBanner';

type TabKey = 'overview' | 'participants' | 'groups' | 'matches' | 'bracket';

function formatTournamentFormat(format: string) {
  switch (format) {
    case 'group_knockout':
    case 'single_league_knockout': return 'League + Knockout';
    case 'knockout': return 'Knockout';
    case 'league': return 'League';
    default: return format.replace(/_/g, ' ');
  }
}

function getStatusLabel(status: string, subStage?: string) {
  if (status === 'completed') return { label: 'COMPLETED', color: 'outline' as const };
  if (status === 'registration') return { label: 'REGISTRATION', color: 'secondary' as const };
  if (subStage === 'group_stage') return { label: 'GROUP STAGE', color: 'default' as const };
  if (subStage === 'group_stage_finalized') return { label: 'GROUP STAGE', color: 'default' as const };
  if (subStage === 'knockout') return { label: 'KNOCKOUT', color: 'default' as const };
  if (subStage === 'final') return { label: 'FINAL', color: 'default' as const };
  return { label: status.toUpperCase(), color: 'default' as const };
}

function StatusBadge({ status, subStage }: { status: string; subStage?: string }) {
  const { label, color } = getStatusLabel(status, subStage);
  if (status === 'ongoing') {
    return (
      <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white border-0 gap-1.5 font-bold">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
        </span>
        {label}
      </Badge>
    );
  }
  return <Badge variant={color} className="font-bold">{label}</Badge>;
}

export default function PublicTournamentPage() {
  const params = useParams();
  const tournamentId = params?.id as string;

  const [tournament, setTournament] = useState<TournamentWithStats | null>(null);
  const [participants, setParticipants] = useState<PublicParticipant[]>([]);
  const [groupStage, setGroupStage] = useState<GroupStageOverview | null>(null);
  const [bracket, setBracket] = useState<BracketOverview | null>(null);
  const [rounds, setRounds] = useState<RoundWithMatches[]>([]);
  const [subStage, setSubStage] = useState<string | undefined>(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stageInfo, setStageInfo] = useState<Record<string, any> | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const fetchAll = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const t = await getPublicTournament(tournamentId);
      if (!t) {
        setError('not_found');
        setLoading(false);
        return;
      }
      setTournament(t);

      // Fetch everything in parallel
      const [pList, info] = await Promise.all([
        getPublicParticipants(tournamentId),
        getPublicTournamentStageInfo(tournamentId),
      ]);
      setParticipants(pList);
      setStageInfo(info);
      setSubStage(info.subStage);

      // Conditionally fetch group/bracket data
      if (t.format !== 'knockout') {
        try {
          const gs = await getPublicGroupStage(tournamentId);
          setGroupStage(gs);
        } catch { /* groups might not be set up yet */ }
      }
      if (t.format === 'knockout' || t.format === 'group_knockout' || (t.format as string) === 'single_league_knockout') {
        try {
          const br = await getPublicBracket(tournamentId);
          setBracket(br);
        } catch { /* bracket might not be generated yet */ }
      }
      try {
        const m = await getPublicMatches(tournamentId);
        setRounds(m);
      } catch { /* no matches yet */ }

      setError(null);
    } catch {
      setError('load_error');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await fetchAll();
    })();
    return () => { cancelled = true; };
  }, [fetchAll]);

  // Realtime: refresh match data when admin updates
  const tournamentFormat = tournament?.format;
  const handleRealtimeUpdate = useCallback(
    async (payload?: RealtimePayload) => {
      if (!tournamentId) return;

      // Immediate in-place React state update for zero-latency UI re-render
      if (payload?.new && payload.new.id) {
        const updatedMatch = payload.new;

        setRounds((prevRounds) =>
          prevRounds.map((r) => ({
            ...r,
            matches: r.matches.map((m) => {
              if (m.id === updatedMatch.id) {
                return {
                  ...m,
                  score_a: updatedMatch.score_a ?? m.score_a,
                  score_b: updatedMatch.score_b ?? m.score_b,
                  status: updatedMatch.status ?? m.status,
                  winner_id: updatedMatch.winner_id ?? m.winner_id,
                };
              }
              return m;
            }),
          }))
        );

        setGroupStage((prevGroupStage) => {
          if (!prevGroupStage) return prevGroupStage;
          return {
            ...prevGroupStage,
            groups: prevGroupStage.groups.map((g) => ({
              ...g,
              matches: g.matches.map((m) => {
                if (m.id === updatedMatch.id) {
                  return {
                    ...m,
                    score_a: updatedMatch.score_a ?? m.score_a,
                    score_b: updatedMatch.score_b ?? m.score_b,
                    status: updatedMatch.status ?? m.status,
                    winner_id: updatedMatch.winner_id ?? m.winner_id,
                  };
                }
                return m;
              }),
            })),
          };
        });
      }

      // Re-fetch in background for full stage info/standings/bracket consistency
      try {
        const [info, m] = await Promise.all([
          getPublicTournamentStageInfo(tournamentId),
          getPublicMatches(tournamentId),
        ]);
        setStageInfo(info);
        setSubStage(info.subStage);
        setRounds(m);
        if (tournamentFormat === 'group_knockout' || tournamentFormat === 'league') {
          const gs = await getPublicGroupStage(tournamentId).catch(() => null);
          if (gs) setGroupStage(gs);
        }
        if (tournamentFormat === 'knockout' || tournamentFormat === 'group_knockout') {
          const br = await getPublicBracket(tournamentId).catch(() => null);
          if (br) setBracket(br);
        }
        const t = await getPublicTournament(tournamentId);
        if (t) setTournament(t);
      } catch { /* silent */ }
    },
    [tournamentId, tournamentFormat]
  );

  const { connectionStatus } = useRealtimeMatches(handleRealtimeUpdate, tournamentId);

  // Determine tabs to show based on format
  const isSingleLeague = groupStage?.groups.length === 1 || (tournament?.format as string) === 'single_league_knockout';
  const hasGroups = tournament?.format !== 'knockout' || (groupStage?.groups?.length || 0) > 0;
  const hasBracket = tournament?.format === 'knockout' || tournament?.format === 'group_knockout' || (tournament?.format as string) === 'single_league_knockout' || (bracket?.rounds?.length || 0) > 0;

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutGrid },
    { key: 'participants', label: 'Participants', icon: Users },
    ...(hasGroups ? [{ key: 'groups' as TabKey, label: isSingleLeague ? 'Points Table' : 'Groups & Standings', icon: Target }] : []),
    { key: 'matches', label: 'Matches & Fixtures', icon: Swords },
    ...(hasBracket ? [{ key: 'bracket' as TabKey, label: 'Playoff Bracket', icon: GitBranch }] : []),
  ];

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary mr-3" />
        <span className="text-sm font-semibold text-[#0B3323]">Loading tournament...</span>
      </div>
    );
  }

  if (error === 'not_found') {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center text-center gap-4">
        <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center">
          <Trophy className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#0B3323]">Tournament Not Found</h2>
          <p className="text-sm text-muted-foreground mt-1">
            The tournament you&apos;re looking for doesn&apos;t exist or is no longer publicly available.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/tournaments">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Tournaments
          </Link>
        </Button>
      </div>
    );
  }

  if (error === 'load_error' || !tournament) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center text-center gap-4">
        <p className="text-sm text-muted-foreground">Unable to load tournament information.</p>
        <Button variant="outline" size="sm" onClick={fetchAll}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Back Link */}
      <Link
        href="/tournaments"
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-[#0B3323] transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        All Tournaments
      </Link>

      {/* Connection Reconnecting / Interrupted Banner */}
      {connectionStatus === 'reconnecting' && (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center justify-between animate-pulse">
          <span>Live connection interrupted. Reconnecting...</span>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
        </div>
      )}

      {/* Hero Banner Image if provided */}
      {tournament.banner_image && (
        <div className="relative w-full aspect-[21/8] min-h-[200px] max-h-[380px] rounded-2xl sm:rounded-3xl overflow-hidden border border-border shadow-lg bg-slate-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={tournament.banner_image}
            alt={tournament.name}
            className="w-full h-full object-cover object-center"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/images/banner1.jpg';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B3323] via-[#0B3323]/50 to-transparent" />
          <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between">
            <Badge variant="efootball" className="bg-[#00C853] text-white font-extrabold text-xs shadow-md">
              Official Tournament Banner
            </Badge>
          </div>
        </div>
      )}

      {/* Tournament Header */}
      <div className="rounded-2xl border border-border bg-white p-5 sm:p-7 space-y-4 shadow-xs">
        <div className="flex flex-wrap gap-2 items-center">
          <StatusBadge status={tournament.status} subStage={subStage} />
          <Badge variant="efootball" className="font-bold text-xs">
            {formatTournamentFormat(tournament.format)}
          </Badge>
          {rounds.flatMap((r) => r.matches).filter((m) => m.status === 'live').length > 0 && (
            <Badge className="bg-red-500 hover:bg-red-500 text-white border-0 gap-1.5 font-bold text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              {rounds.flatMap((r) => r.matches).filter((m) => m.status === 'live').length}{' '}
              {rounds.flatMap((r) => r.matches).filter((m) => m.status === 'live').length === 1
                ? 'Match'
                : 'Matches'}{' '}
              Currently Live
            </Badge>
          )}
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B3323] tracking-tight leading-tight">
            {tournament.name}
          </h1>
          {tournament.description && (
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              {tournament.description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold text-[#0B3323]">{tournament.participant_count}</span>
            <span>/ {tournament.max_participants} Participants</span>
          </div>
          {tournament.start_date && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span>Starts {formatDate(tournament.start_date)}</span>
            </div>
          )}
          {tournament.end_date && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span>Ends {formatDate(tournament.end_date)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Champion Banner (if completed) */}
      {tournament.status === 'completed' && (tournament.championUser || stageInfo?.champion) && (
        <PublicChampionBanner
          champion={tournament.championUser || stageInfo!.champion!}
          runnerUp={tournament.runnerUpUser}
          completedAt={tournament.completed_at}
        />
      )}

      {/* Tab Navigation */}
      <div className="w-full overflow-x-auto no-scrollbar">
        <div className="flex gap-1 min-w-max border-b border-border pb-0">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              id={`tab-${key}`}
              onClick={() => setActiveTab(key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap',
                activeTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-[#0B3323] hover:border-border'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && (
          <PublicOverviewTab
            tournament={tournament}
            groupStage={groupStage}
            bracket={bracket}
          />
        )}
        {activeTab === 'participants' && (
          <PublicParticipantsTab participants={participants} />
        )}
        {activeTab === 'groups' && (
          <PublicGroupsTab groupStage={groupStage} />
        )}
        {activeTab === 'matches' && (
          <PublicMatchesTab rounds={rounds} groupStage={groupStage} />
        )}
        {activeTab === 'bracket' && (
          <PublicBracketTab bracket={bracket} />
        )}
      </div>
    </div>
  );
}
