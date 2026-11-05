'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches';
import PublicOverviewTab from '@/components/public/tournament/PublicOverviewTab';
import PublicParticipantsTab from '@/components/public/tournament/PublicParticipantsTab';
import PublicMatchesTab from '@/components/public/tournament/PublicMatchesTab';
import PublicChampionBanner from '@/components/public/tournament/PublicChampionBanner';
import { SwipeableTabBar, SwipeableTabContainer, type TabItem } from '@/components/ui/SwipeableTabs';

// Dynamically import heavy visual components and modal overlays
const PublicGroupsTab = dynamic(() => import('@/components/public/tournament/PublicGroupsTab'), {
  loading: () => <TabLoadingSkeleton text="Loading Groups..." />,
});
const PublicBracketTab = dynamic(() => import('@/components/public/tournament/PublicBracketTab'), {
  loading: () => <TabLoadingSkeleton text="Loading Bracket..." />,
});
const ShareModal = dynamic(
  () => import('@/components/share/ShareModal').then((mod) => mod.ShareModal),
  { ssr: false }
);
const WinnerCelebrationOverlay = dynamic(
  () => import('@/components/tournament/WinnerCelebrationOverlay').then((mod) => mod.WinnerCelebrationOverlay),
  { ssr: false }
);

function TabLoadingSkeleton({ text }: { text: string }) {
  return (
    <div className="min-h-[300px] flex flex-col items-center justify-center p-6 text-center space-y-3">
      <Loader2 className="h-7 w-7 animate-spin text-[#FFFF00]" />
      <p className="text-xs font-black font-display uppercase tracking-widest text-white/80">{text}</p>
    </div>
  );
}

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

interface PublicTournamentClientViewProps {
  tournamentId: string;
  initialTournament?: TournamentWithStats | null;
  initialParticipants?: PublicParticipant[];
  initialStageInfo?: Record<string, any> | null;
}

export default function PublicTournamentClientView({
  tournamentId,
  initialTournament = null,
  initialParticipants = [],
  initialStageInfo = null,
}: PublicTournamentClientViewProps) {
  const [tournament, setTournament] = useState<TournamentWithStats | null>(initialTournament);
  const [participants, setParticipants] = useState<PublicParticipant[]>(initialParticipants);
  const [groupStage, setGroupStage] = useState<GroupStageOverview | null>(null);
  const [bracket, setBracket] = useState<BracketOverview | null>(null);
  const [rounds, setRounds] = useState<RoundWithMatches[]>([]);
  const [subStage, setSubStage] = useState<string | undefined>(initialStageInfo?.subStage);
  const [stageInfo, setStageInfo] = useState<Record<string, any> | null>(initialStageInfo);

  const [loading, setLoading] = useState(!initialTournament);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  // Lazy tab data loading tracking
  const loadedTabsRef = useRef<Set<string>>(new Set(['overview', 'participants']));
  const [loadingTabData, setLoadingTabData] = useState(false);

  // 1. Initial Overview Fetch (Only fetches overview essentials, not all 5 datasets at once)
  const fetchOverview = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const [t, pRes, sInfo] = await Promise.all([
        tournament ? Promise.resolve(tournament) : getPublicTournament(tournamentId),
        participants.length > 0 ? Promise.resolve(participants) : getPublicParticipants(tournamentId).catch(() => []),
        stageInfo ? Promise.resolve(stageInfo) : getPublicTournamentStageInfo(tournamentId).catch(() => null),
      ]);

      if (!t) {
        setError('not_found');
        setLoading(false);
        return;
      }

      setTournament(t);
      setParticipants(pRes);
      setStageInfo(sInfo);
      if (sInfo) setSubStage(sInfo.subStage);

      if (t.status === 'completed' && t.championUser) {
        setShowCelebration(true);
      }
      setError(null);
    } catch (err: unknown) {
      console.error('Error fetching tournament overview:', err);
      setError('failed_load');
    } finally {
      setLoading(false);
    }
  }, [tournamentId, tournament, participants.length, stageInfo]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await fetchOverview();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchOverview]);

  // 2. On-Demand Lazy Tab Loader: Loads tab dataset ONLY when user navigates to it
  const loadTabDataOnDemand = useCallback(async (tab: TabKey) => {
    if (!tournamentId) return;

    if (tab === 'groups' && !loadedTabsRef.current.has('groups')) {
      setLoadingTabData(true);
      try {
        const gRes = await getPublicGroupStage(tournamentId).catch(() => null);
        setGroupStage(gRes);
        loadedTabsRef.current.add('groups');
      } finally {
        setLoadingTabData(false);
      }
    } else if (tab === 'matches' && !loadedTabsRef.current.has('matches')) {
      setLoadingTabData(true);
      try {
        const mRes = await getPublicMatches(tournamentId).catch(() => []);
        setRounds(mRes);
        loadedTabsRef.current.add('matches');
      } finally {
        setLoadingTabData(false);
      }
    } else if (tab === 'bracket' && !loadedTabsRef.current.has('bracket')) {
      setLoadingTabData(true);
      try {
        const bRes = await getPublicBracket(tournamentId).catch(() => null);
        setBracket(bRes);
        loadedTabsRef.current.add('bracket');
      } finally {
        setLoadingTabData(false);
      }
    }
  }, [tournamentId]);

  const handleTabChange = (newTab: TabKey) => {
    setActiveTab(newTab);
    loadTabDataOnDemand(newTab);
  };

  // Full refresh when requested by user button or realtime
  const refreshAll = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const t = await getPublicTournament(tournamentId);
      if (t) setTournament(t);

      const promises: Promise<any>[] = [
        getPublicParticipants(tournamentId).then(setParticipants).catch(() => {}),
        getPublicTournamentStageInfo(tournamentId).then((s) => {
          setStageInfo(s);
          if (s) setSubStage(s.subStage);
        }).catch(() => {}),
      ];

      if (loadedTabsRef.current.has('groups')) {
        promises.push(getPublicGroupStage(tournamentId).then(setGroupStage).catch(() => {}));
      }
      if (loadedTabsRef.current.has('matches')) {
        promises.push(getPublicMatches(tournamentId).then(setRounds).catch(() => {}));
      }
      if (loadedTabsRef.current.has('bracket')) {
        promises.push(getPublicBracket(tournamentId).then(setBracket).catch(() => {}));
      }

      await Promise.all(promises);
    } catch (err) {
      console.error('Error refreshing tournament:', err);
    }
  }, [tournamentId]);

  useRealtimeMatches(refreshAll, tournamentId);

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
  const showBracket =
    tournament.format === 'knockout' ||
    tournament.format === 'group_knockout' ||
    (tournament.format as string) === 'single_league_knockout' ||
    (bracket?.rounds?.length || 0) > 0;

  const tabItems: TabItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'participants', label: `Players (${participants.length})`, icon: Users },
    ...(showGroups
      ? [
          {
            id: 'groups',
            label: groupStage?.groups.length === 1 ? 'Points Table' : 'Groups & Standings',
            icon: Target,
          } as TabItem,
        ]
      : []),
    { id: 'matches', label: 'Fixtures & Results', icon: Swords },
    ...(showBracket ? [{ id: 'bracket', label: 'Playoff Bracket', icon: GitBranch } as TabItem] : []),
  ];

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
                onClick={refreshAll}
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
              <p className="text-xs sm:text-sm text-[#D9DCFF]/90 max-w-3xl leading-relaxed">
                {tournament.description}
              </p>
            )}

            {/* Quick Stat Pills */}
            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-bold text-[#D9DCFF]">
              <div className="flex items-center gap-2 bg-[#0A0A7A] border border-white/15 px-3 py-1.5 rounded-full">
                <Users className="h-3.5 w-3.5 text-[#FFFF00]" />
                <span>
                  {participants.length} / {tournament.max_participants} Players
                </span>
              </div>

              {tournament.start_date && (
                <div className="flex items-center gap-2 bg-[#0A0A7A] border border-white/15 px-3 py-1.5 rounded-full">
                  <Calendar className="h-3.5 w-3.5 text-[#FFFF00]" />
                  <span>Starts: {formatDate(tournament.start_date)}</span>
                </div>
              )}

              {subStage && (
                <div className="flex items-center gap-2 bg-[#0A0A7A] border border-white/15 px-3 py-1.5 rounded-full text-[#FFFF00]">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="capitalize">{subStage.replace(/_/g, ' ')} Stage</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. CHAMPION BANNER (If Completed) */}
      {isCompleted && champion && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mb-6">
          <PublicChampionBanner
            champion={champion}
            runnerUp={runnerUp}
            completedAt={tournament.completed_at}
          />
        </div>
      )}

      {/* 3. TOURNAMENT NAVIGATION TABS */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="mb-6">
          <SwipeableTabBar
            tabs={tabItems}
            activeTab={activeTab}
            onTabChange={(tabId) => handleTabChange(tabId as TabKey)}
            ariaLabel="Tournament Stage Navigation"
          />
        </div>

        {/* 4. TAB CONTENT PANELS WITH MOBILE SWIPE NAVIGATION */}
        <div className="mt-6">
          {loadingTabData ? (
            <div className="min-h-[350px] flex flex-col items-center justify-center p-6 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00]" />
              <p className="text-xs font-black font-display uppercase tracking-widest text-[#D9DCFF]">
                Loading Tab Data...
              </p>
            </div>
          ) : (
            <SwipeableTabContainer
              tabs={tabItems}
              activeTab={activeTab}
              onTabChange={(tabId) => handleTabChange(tabId as TabKey)}
            >
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
            </SwipeableTabContainer>
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
