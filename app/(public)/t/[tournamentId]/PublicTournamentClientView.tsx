'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Trophy,
  Users,
  Calendar,
  ChevronLeft,
  Loader2,
  RefreshCw,
  LayoutGrid,
  Target,
  Swords,
  GitBranch,
  Share2,
  Sparkles,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn, formatDate } from '@/lib/utils';
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
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches';
import PublicGroupsTab from '@/components/public/tournament/PublicGroupsTab';
import PublicMatchesTab from '@/components/public/tournament/PublicMatchesTab';
import PublicBracketTab from '@/components/public/tournament/PublicBracketTab';
import PublicOverviewTab from '@/components/public/tournament/PublicOverviewTab';
import PublicParticipantsTab from '@/components/public/tournament/PublicParticipantsTab';
import PublicChampionBanner from '@/components/public/tournament/PublicChampionBanner';
import { ShareModal } from '@/components/share/ShareModal';
import { WinnerCelebrationOverlay } from '@/components/tournament/WinnerCelebrationOverlay';

type TabKey = 'overview' | 'participants' | 'groups' | 'matches' | 'bracket';

function formatTournamentFormat(format: string) {
  switch (format) {
    case 'group_knockout':
    case 'single_league_knockout':
      return 'League + Knockout';
    case 'knockout':
      return 'Knockout';
    case 'league':
      return 'League';
    default:
      return format.replace(/_/g, ' ');
  }
}

export default function PublicTournamentClientView({ tournamentId }: { tournamentId: string }) {
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
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

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
      const [pRes, sInfo, gRes, bRes, mRes] = await Promise.all([
        getPublicParticipants(tournamentId).catch(() => []),
        getPublicTournamentStageInfo(tournamentId).catch(() => null),
        getPublicGroupStage(tournamentId).catch(() => null),
        getPublicBracket(tournamentId).catch(() => null),
        getPublicMatches(tournamentId).catch(() => []),
      ]);

      setParticipants(pRes);
      setStageInfo(sInfo);
      if (sInfo) setSubStage(sInfo.subStage);
      setGroupStage(gRes);
      setBracket(bRes);
      setRounds(mRes);

      // Auto trigger celebration if completed
      if (t.status === 'completed' && t.championUser) {
        setShowCelebration(true);
      }
      setError(null);
    } catch (err: unknown) {
      console.error('Error fetching public tournament:', err);
      setError('failed_load');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime subscription callback
  const handleRealtimeUpdate = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  useRealtimeMatches(handleRealtimeUpdate, tournamentId);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
        <p className="text-sm font-extrabold text-[#0B3323]">Loading Public Tournament Details...</p>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-100 text-rose-600 shadow-xs">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-[#0B3323]">Tournament Not Found</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            This tournament may have been deleted, or the public link is invalid. Please check the URL and try again.
          </p>
        </div>
        <Button asChild className="font-extrabold rounded-2xl bg-[#0B3323] hover:bg-[#0B3323]/90 text-white gap-2 shadow-md">
          <Link href="/tournaments">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Tournaments</span>
          </Link>
        </Button>
      </div>
    );
  }

  const isCompleted = tournament.status === 'completed';
  const champion = tournament.championUser;
  const runnerUp = tournament.runnerUpUser;

  const showGroups = tournament.format !== 'knockout' || (groupStage?.groups?.length || 0) > 0;
  const showBracket = tournament.format === 'knockout' || tournament.format === 'group_knockout' || (tournament.format as string) === 'single_league_knockout' || (bracket?.rounds?.length || 0) > 0;

  return (
    <div className="min-h-screen bg-[#F4F8F5]/50 pb-16">
      {/* 🏆 WINNER CELEBRATION OVERLAY */}
      {isCompleted && champion && (
        <WinnerCelebrationOverlay
          isOpen={showCelebration}
          championName={champion.username}
          runnerUpName={runnerUp?.username}
          tournamentName={tournament.name}
          onClose={() => setShowCelebration(false)}
        />
      )}

      {/* 1. PUBLIC HERO BANNER */}
      <div className="bg-gradient-to-b from-[#0B2518] via-[#0B3323] to-[#0D3B29] text-white border-b border-emerald-800/40 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10 space-y-6">
          {/* Breadcrumb & Share Trigger */}
          <div className="flex items-center justify-between gap-4">
            <Button asChild variant="ghost" size="sm" className="text-emerald-200 hover:text-white hover:bg-emerald-800/50 -ml-2 rounded-xl text-xs font-bold gap-1.5">
              <Link href="/tournaments">
                <ChevronLeft className="h-4 w-4" />
                <span>All Tournaments</span>
              </Link>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setIsShareModalOpen(true)}
                className="h-8 px-3 text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-[#0B3323] gap-1.5 rounded-xl shadow-xs"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share Link & QR</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchAll}
                className="h-8 px-2 text-emerald-300 hover:text-white hover:bg-emerald-800/50 rounded-xl"
                title="Refresh Tournament Data"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Title & Metadata Header */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-emerald-400 text-slate-950 font-black text-[10px] uppercase px-2.5 py-0.5 border-0">
                OFFICIAL PUBLIC EVENT
              </Badge>
              <Badge variant="outline" className="text-emerald-200 border-emerald-700 font-bold text-[10px] uppercase">
                {formatTournamentFormat(tournament.format)}
              </Badge>
              {tournament.status === 'ongoing' ? (
                <Badge className="bg-rose-600 text-white font-extrabold text-[10px] uppercase px-2 py-0.5 border-0 animate-pulse">
                  ● LIVE NOW
                </Badge>
              ) : isCompleted ? (
                <Badge className="bg-amber-400 text-slate-950 font-extrabold text-[10px] uppercase px-2.5 py-0.5 border-0">
                  🏆 COMPLETED
                </Badge>
              ) : (
                <Badge variant="secondary" className="font-bold text-[10px] uppercase">
                  {tournament.status}
                </Badge>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-emerald-100 to-emerald-300">
              {tournament.name}
            </h1>

            {tournament.description && (
              <p className="text-sm text-emerald-100/90 max-w-2xl font-medium leading-relaxed">
                {tournament.description}
              </p>
            )}

            {/* Quick Metadata Stats */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-emerald-200/90 pt-2 border-t border-emerald-800/50">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-emerald-400" />
                <span>{tournament.participant_count} / {tournament.max_participants} Participants</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-emerald-400" />
                <span>Started {formatDate(tournament.start_date)}</span>
              </span>
              {tournament.end_date && (
                <>
                  <span>•</span>
                  <span>Ends {formatDate(tournament.end_date)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. CHAMPION BANNER (IF COMPLETED) */}
      {isCompleted && champion && (
        <div className="max-w-6xl mx-auto px-4 mt-6">
          <PublicChampionBanner
            champion={champion}
            runnerUp={runnerUp}
            completedAt={tournament.completed_at}
          />
        </div>
      )}

      {/* 3. PUBLIC TABS NAVIGATION */}
      <div className="max-w-6xl mx-auto px-4 mt-6">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              'px-4 py-2 text-xs font-extrabold rounded-2xl transition-all whitespace-nowrap flex items-center gap-2 border',
              activeTab === 'overview'
                ? 'bg-[#0B3323] text-white border-[#0B3323] shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-[#0B3323]'
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('participants')}
            className={cn(
              'px-4 py-2 text-xs font-extrabold rounded-2xl transition-all whitespace-nowrap flex items-center gap-2 border',
              activeTab === 'participants'
                ? 'bg-[#0B3323] text-white border-[#0B3323] shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-[#0B3323]'
            )}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Participants ({participants.length})</span>
          </button>

          {showGroups && (
            <button
              onClick={() => setActiveTab('groups')}
              className={cn(
                'px-4 py-2 text-xs font-extrabold rounded-2xl transition-all whitespace-nowrap flex items-center gap-2 border',
                activeTab === 'groups'
                  ? 'bg-[#0B3323] text-white border-[#0B3323] shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-[#0B3323]'
              )}
            >
              <Target className="h-3.5 w-3.5" />
              <span>{groupStage?.groups.length === 1 ? 'Points Table' : 'Groups & Standings'}</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('matches')}
            className={cn(
              'px-4 py-2 text-xs font-extrabold rounded-2xl transition-all whitespace-nowrap flex items-center gap-2 border',
              activeTab === 'matches'
                ? 'bg-[#0B3323] text-white border-[#0B3323] shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-[#0B3323]'
            )}
          >
            <Swords className="h-3.5 w-3.5" />
            <span>Fixtures & Results</span>
          </button>

          {showBracket && (
            <button
              onClick={() => setActiveTab('bracket')}
              className={cn(
                'px-4 py-2 text-xs font-extrabold rounded-2xl transition-all whitespace-nowrap flex items-center gap-2 border',
                activeTab === 'bracket'
                  ? 'bg-[#0B3323] text-white border-[#0B3323] shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-[#0B3323]'
              )}
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>Playoff Bracket</span>
            </button>
          )}
        </div>

        {/* 4. TAB CONTENT PANELS */}
        <div className="mt-6">
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

          {activeTab === 'groups' && showGroups && (
            <PublicGroupsTab groupStage={groupStage} />
          )}

          {activeTab === 'matches' && (
            <PublicMatchesTab rounds={rounds} groupStage={groupStage} />
          )}

          {activeTab === 'bracket' && showBracket && (
            <PublicBracketTab bracket={bracket} />
          )}
        </div>
      </div>

      {/* SHARE MODAL */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        tournamentId={tournamentId}
        tournamentName={tournament.name}
      />
    </div>
  );
}
