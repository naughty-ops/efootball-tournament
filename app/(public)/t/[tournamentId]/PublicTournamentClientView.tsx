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
      return 'Group + Knockout';
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
    let cancelled = false;
    void (async () => {
      if (!cancelled) await fetchAll();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  // Realtime subscription callback
  const handleRealtimeUpdate = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  useRealtimeMatches(handleRealtimeUpdate, tournamentId);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-[#FFFF00]" />
        <p className="text-sm font-black font-display uppercase tracking-widest text-white">Loading Tournament Details...</p>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#FF168B]/20 text-[#FF168B] shadow-lg border border-[#FF168B]/30">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black font-display uppercase text-white">Tournament Not Found</h2>
          <p className="text-xs text-[#D9DCFF]/80 max-w-sm mx-auto">
            This tournament may have been deleted, or the public link is invalid. Please check the URL and try again.
          </p>
        </div>
        <Button asChild className="font-black rounded-full bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] gap-2 shadow-lg">
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
    <div className="min-h-screen bg-transparent pb-16">
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
      <div className="bg-[#1010C5] text-white border-b border-white/20 shadow-xl relative overflow-hidden rounded-[32px] mx-4 sm:mx-6 my-4 p-6 sm:p-8">
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-[#3434FF]/30 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-6xl mx-auto space-y-6 relative z-10">
          {/* Breadcrumb & Share Trigger */}
          <div className="flex items-center justify-between gap-4">
            <Button asChild variant="ghost" size="sm" className="text-[#D9DCFF] hover:text-white hover:bg-white/10 rounded-full text-xs font-black gap-1.5 px-3">
              <Link href="/tournaments">
                <ChevronLeft className="h-4 w-4" />
                <span>All Tournaments</span>
              </Link>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setIsShareModalOpen(true)}
                className="h-8 px-4 text-xs font-black bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] gap-1.5 rounded-full shadow-md"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share Link & QR</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchAll}
                className="h-8 px-2.5 text-[#D9DCFF] hover:text-white hover:bg-white/10 rounded-full"
                title="Refresh Tournament Data"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Title & Metadata Header */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] uppercase px-3 py-1 rounded-full shadow-sm">
                OFFICIAL COMPETITION
              </span>
              <span className="bg-[#3434FF] text-white border border-white/20 font-bold text-[10px] uppercase px-3 py-1 rounded-full">
                {formatTournamentFormat(tournament.format)}
              </span>
              {tournament.status === 'ongoing' ? (
                <span className="bg-[#FF168B] text-white font-black text-[10px] uppercase px-3 py-1 rounded-full shadow-[0_0_12px_rgba(255,22,139,0.5)] animate-pulse flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  LIVE NOW
                </span>
              ) : isCompleted ? (
                <span className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] uppercase px-3 py-1 rounded-full">
                  🏆 COMPLETED
                </span>
              ) : (
                <span className="bg-[#1818D4] text-white border border-white/20 font-bold text-[10px] uppercase px-3 py-1 rounded-full">
                  {tournament.status}
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black font-display uppercase tracking-wider text-white">
              {tournament.name}
            </h1>

            {tournament.description && (
              <p className="text-sm text-[#D9DCFF]/90 max-w-2xl font-medium leading-relaxed">
                {tournament.description}
              </p>
            )}

            {/* Quick Metadata Stats */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-[#D9DCFF]/90 pt-3 border-t border-white/20">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-[#FFFF00]" />
                <span>{tournament.participant_count} / {tournament.max_participants} Participants</span>
              </span>
              <span className="text-white/40">•</span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-[#FFFF00]" />
                <span>Started {formatDate(tournament.start_date)}</span>
              </span>
              {tournament.end_date && (
                <>
                  <span className="text-white/40">•</span>
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
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-3 border-b border-white/20">
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              'px-4 py-2 text-xs font-black uppercase tracking-wider rounded-full transition-all whitespace-nowrap flex items-center gap-2 border',
              activeTab === 'overview'
                ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.35)]'
                : 'bg-[#1010C5] text-white/90 border-white/20 hover:border-[#FFFF00] hover:text-white'
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('participants')}
            className={cn(
              'px-4 py-2 text-xs font-black uppercase tracking-wider rounded-full transition-all whitespace-nowrap flex items-center gap-2 border',
              activeTab === 'participants'
                ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.35)]'
                : 'bg-[#1010C5] text-white/90 border-white/20 hover:border-[#FFFF00] hover:text-white'
            )}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Participants ({participants.length})</span>
          </button>

          {showGroups && (
            <button
              onClick={() => setActiveTab('groups')}
              className={cn(
                'px-4 py-2 text-xs font-black uppercase tracking-wider rounded-full transition-all whitespace-nowrap flex items-center gap-2 border',
                activeTab === 'groups'
                  ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.35)]'
                  : 'bg-[#1010C5] text-white/90 border-white/20 hover:border-[#FFFF00] hover:text-white'
              )}
            >
              <Target className="h-3.5 w-3.5" />
              <span>{groupStage?.groups.length === 1 ? 'Points Table' : 'Groups & Standings'}</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('matches')}
            className={cn(
              'px-4 py-2 text-xs font-black uppercase tracking-wider rounded-full transition-all whitespace-nowrap flex items-center gap-2 border',
              activeTab === 'matches'
                ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.35)]'
                : 'bg-[#1010C5] text-white/90 border-white/20 hover:border-[#FFFF00] hover:text-white'
            )}
          >
            <Swords className="h-3.5 w-3.5" />
            <span>Fixtures & Results</span>
          </button>

          {showBracket && (
            <button
              onClick={() => setActiveTab('bracket')}
              className={cn(
                'px-4 py-2 text-xs font-black uppercase tracking-wider rounded-full transition-all whitespace-nowrap flex items-center gap-2 border',
                activeTab === 'bracket'
                  ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.35)]'
                : 'bg-[#1010C5] text-white/90 border-white/20 hover:border-[#FFFF00] hover:text-white'
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
