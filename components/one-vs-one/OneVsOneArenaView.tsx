'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Swords,
  Trophy,
  Wallet,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  ArrowRight,
  User,
  Plus,
  Gamepad2,
  Image as ImageIcon,
  X,
  Eye,
  Bell,
  Share2,
  ExternalLink,
  Users,
  KeyRound,
  Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type {
  OneVsOneCard,
  OneVsOneMatchDetail,
  OneVsOneArenaStats,
  AvailableWaitingMatch,
  ArenaLeaderboardEntry,
} from '@/types/oneVsOne';
import OneVsOneCardGrid from './OneVsOneCardGrid';
import OneVsOneWaitingQueue from './OneVsOneWaitingQueue';
import OneVsOneMatchRoom from './OneVsOneMatchRoom';
import ArenaLeaderboard from './ArenaLeaderboard';
import JoinMatchModal from './JoinMatchModal';
import ShareMatchModal from './ShareMatchModal';
import AliveMembersDirectory from '@/components/competition/AliveMembersDirectory';
import { useMemberPresence } from '@/hooks/useMemberPresence';
import { useAliveMembersDirectory } from '@/hooks/useAliveMembersDirectory';
import { useRealtimeOneVsOneMatch } from '@/hooks/useRealtimeOneVsOneMatch';
import { joinWaitingMatchByCodeAction } from '@/app/actions/oneVsOneActions';

interface OneVsOneArenaViewProps {
  cards: OneVsOneCard[];
  initialActiveMatch: OneVsOneMatchDetail | null;
  historyMatches: OneVsOneMatchDetail[];
  stats: OneVsOneArenaStats;
  isEligible: boolean;
  currentUserId: string;
  userAvailableBalanceInr: number;
  userDisplayName?: string;
  initialAvailableMatches?: AvailableWaitingMatch[];
  initialLeaderboard?: ArenaLeaderboardEntry[];
}

export default function OneVsOneArenaView({
  cards,
  initialActiveMatch,
  historyMatches,
  stats,
  isEligible,
  currentUserId,
  userAvailableBalanceInr,
  userDisplayName = 'Player',
  initialAvailableMatches = [],
  initialLeaderboard = [],
}: OneVsOneArenaViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeMatch, setActiveMatch] = useState<OneVsOneMatchDetail | null>(initialActiveMatch);
  const [arenaModeTab, setArenaModeTab] = useState<'1v1' | 'super4' | 'super8'>('1v1');
  const [availableMatches, setAvailableMatches] = useState<AvailableWaitingMatch[]>(initialAvailableMatches);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'wins' | 'losses'>('all');

  // UI state
  const [dismissNotificationBanner, setDismissNotificationBanner] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinModalCode, setJoinModalCode] = useState('');
  const [shareMatchTarget, setShareMatchTarget] = useState<OneVsOneMatchDetail | null>(null);
  const [joiningMatchId, setJoiningMatchId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Real-time alive members presence tracking
  const { counts: aliveCounts } = useAliveMembersDirectory();
  useMemberPresence({
    userId: currentUserId,
    activity: activeMatch
      ? activeMatch.status === 'waiting'
        ? `1v1 Matchmaking (${activeMatch.match_code})`
        : `In 1v1 Room (${activeMatch.match_code})`
      : 'In Arena Lobby',
  });

  useEffect(() => {
    setActiveMatch(initialActiveMatch);
  }, [initialActiveMatch]);

  useEffect(() => {
    setAvailableMatches(initialAvailableMatches);
  }, [initialAvailableMatches]);

  // Handle URL deep linking (e.g. ?joinMatch=1V1-XXXX-YYYY or ?matchCode=...)
  useEffect(() => {
    const code = searchParams.get('joinMatch') || searchParams.get('matchCode');
    if (code && !activeMatch) {
      setJoinModalCode(code);
      setShowJoinModal(true);
    }
  }, [searchParams, activeMatch]);

  // Check persisted notification banner state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const dismissed = localStorage.getItem('efootball_dismissed_match_bell');
      if (dismissed === 'true') {
        setDismissNotificationBanner(true);
      }
    }
  }, []);

  const handleDismissBanner = () => {
    setDismissNotificationBanner(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('efootball_dismissed_match_bell', 'true');
    }
  };

  // Subscribe to Realtime updates on active match
  useRealtimeOneVsOneMatch({
    matchId: activeMatch?.id,
    userId: currentUserId,
    onUpdate: () => {
      router.refresh();
    },
  });

  const handleMatchInitiated = (data: {
    matchId: string;
    matchCode?: string;
    status?: string;
    cardId: string;
  }) => {
    const card = cards.find((c) => c.id === data.cardId);
    if (data.status === 'waiting') {
      setActiveMatch({
        id: data.matchId,
        match_code: data.matchCode || '1V1-MATCH',
        card_id: data.cardId,
        status: 'waiting',
        match_mode: 'real',
        created_by: currentUserId,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        room_id: null,
        room_password: null,
        room_submitted_by: null,
        room_submitted_at: null,
        matched_at: null,
        started_at: null,
        completed_at: null,
        cancelled_at: null,
        card: card || null,
        players: [
          {
            id: `temp-${currentUserId}`,
            match_id: data.matchId,
            user_id: currentUserId,
            player_position: 1,
            ready_status: 'ready',
            is_active: true,
            joined_at: new Date().toISOString(),
            ready_at: new Date().toISOString(),
            room_viewed_at: null,
            profile: {
              display_name: userDisplayName,
              avatar_url: null,
              efootball_id: null,
            },
          },
        ],
        opponent: null,
        userPosition: 1,
        result: null,
      });
    }
    router.refresh();
  };

  const handleQueueCancelled = () => {
    setActiveMatch(null);
    router.refresh();
  };

  const handleDirectJoin = async (matchCode: string, matchId: string) => {
    setJoiningMatchId(matchId);
    setActionError(null);

    const res = await joinWaitingMatchByCodeAction(matchCode);
    setJoiningMatchId(null);

    if (!res.success) {
      setActionError(res.error || 'Failed to join match.');
      return;
    }

    router.refresh();
  };

  const scrollToLeaderboard = () => {
    const el = document.getElementById('leaderboard');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToCreateMatch = () => {
    const el = document.getElementById('challenge-tiers');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 min-w-0 max-w-full">
      {/* 1. Header Bar: User Greeting, Online Count, Wallet & Leaderboard Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#07074A] to-[#0A0A70] border border-white/15 shadow-xl text-white">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-[#1E1EF5] border-2 border-[#FFFF00] flex items-center justify-center font-black text-sm text-[#FFFF00] shadow-md shadow-blue-600/30 shrink-0">
            {userDisplayName[0]?.toUpperCase() || 'P'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-black font-display tracking-wide uppercase text-white">
                {userDisplayName}
              </span>
              <a
                href="#alive-members-directory"
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-[#00E676] hover:bg-emerald-500/25 transition-colors cursor-pointer"
                title="Click to view Alive Members directory"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E676] opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#00E676]" />
                </span>
                <span>{Math.max(1, aliveCounts.total_alive)} Online</span>
              </a>
            </div>
            <p className="text-xs text-white/60">eFootball Head-to-Head Arena</p>
          </div>
        </div>

        {/* Right Area: Wallet & Leaderboard Action */}
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          {/* Wallet Balance Display */}
          <Link
            href="/dashboard/wallet"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#08088F] hover:bg-[#1010C5] border border-[#00E676]/40 text-white transition-all group shadow-inner"
          >
            <div className="h-6 w-6 rounded-full bg-[#00E676]/15 flex items-center justify-center text-[#00E676] shrink-0">
              <Wallet className="h-3.5 w-3.5" />
            </div>
            <div className="text-left">
              <span className="text-[9px] uppercase font-bold text-white/50 block leading-tight">Wallet</span>
              <span className="text-xs sm:text-sm font-black font-display text-[#00E676] leading-none">
                ₹{userAvailableBalanceInr.toFixed(2)}
              </span>
            </div>
            <span className="ml-1 text-[10px] font-black text-[#FFFF00] bg-[#FFFF00]/10 px-1.5 py-0.5 rounded uppercase">
              + Add
            </span>
          </Link>

          {/* Leaderboard Jump Button */}
          <Button
            onClick={scrollToLeaderboard}
            variant="outline"
            className="rounded-xl border-white/20 text-white hover:bg-white/10 text-xs font-black uppercase tracking-wider h-10 px-3.5 gap-1.5 cursor-pointer"
          >
            <Trophy className="h-3.5 w-3.5 text-[#FFFF00]" />
            <span>Leaderboard</span>
          </Button>

          {/* Join with Code Button */}
          <Button
            onClick={() => {
              setJoinModalCode('');
              setShowJoinModal(true);
            }}
            variant="outline"
            className="rounded-xl border-[#FFFF00]/40 text-[#FFFF00] hover:bg-[#FFFF00]/10 text-xs font-black uppercase tracking-wider h-10 px-3.5 gap-1.5 cursor-pointer"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>Enter Code</span>
          </Button>
        </div>
      </div>

      {/* 2. Notification Bell Banner (Dismissible) */}
      {!dismissNotificationBanner && (
        <div className="flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-[#1010C5] border border-[#FFFF00]/30 text-white shadow-lg animate-in fade-in duration-300">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-[#FFFF00] text-[#08088F] flex items-center justify-center shrink-0 shadow-md">
              <Bell className="h-4 w-4 fill-current" />
            </div>
            <span className="text-xs sm:text-sm font-bold text-white truncate">
              Tap the bell to get notified the instant a new match opens
            </span>
          </div>
          <Button
            onClick={handleDismissBanner}
            size="sm"
            className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] text-xs font-black uppercase tracking-wider px-4 h-8 shrink-0 cursor-pointer shadow-md"
          >
            Got it
          </Button>
        </div>
      )}

      {/* 4. Game Modes Segmented Navigation Bar (1V1, Super 4, Super 8) */}
      <div className="flex items-center gap-2 p-1.5 bg-[#05053B] border border-white/15 rounded-2xl w-fit max-w-full overflow-x-auto no-scrollbar shadow-inner">
        {/* TAB 1: 1V1 */}
        <button
          onClick={() => setArenaModeTab('1v1')}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shrink-0 ${
            arenaModeTab === '1v1'
              ? 'bg-[#FFFF00] text-[#08088F] shadow-md shadow-yellow-500/25 scale-[1.02]'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <Swords className="h-4 w-4" />
          <span>1V1</span>
          <span
            className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
              arenaModeTab === '1v1'
                ? 'bg-[#08088F] text-[#FFFF00]'
                : 'bg-[#FF168B] text-white shadow-sm'
            }`}
            title={`${availableMatches.length} Available Matches`}
          >
            {availableMatches.length}
          </span>
        </button>

        {/* TAB 2: SUPER 4 */}
        <button
          onClick={() => setArenaModeTab('super4')}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shrink-0 ${
            arenaModeTab === 'super4'
              ? 'bg-[#FFFF00] text-[#08088F] shadow-md shadow-yellow-500/25 scale-[1.02]'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Super 4</span>
        </button>

        {/* TAB 3: SUPER 8 */}
        <button
          onClick={() => setArenaModeTab('super8')}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shrink-0 ${
            arenaModeTab === 'super8'
              ? 'bg-[#FFFF00] text-[#08088F] shadow-md shadow-yellow-500/25 scale-[1.02]'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <Trophy className="h-4 w-4" />
          <span>Super 8</span>
        </button>
      </div>

      {/* Action Error Message */}
      {actionError && (
        <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-xs text-red-300 font-bold flex items-center justify-between gap-3">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-white/60 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 5. TAB 1: 1V1 ARENA CONTENT */}
      {arenaModeTab === '1v1' && (
        <div className="space-y-8">
          {activeMatch ? (
            <OneVsOneMatchRoom
              match={activeMatch}
              currentUserId={currentUserId}
              userDisplayName={userDisplayName}
              onRefreshRequested={() => router.refresh()}
              onQueueCancelled={handleQueueCancelled}
            />
          ) : (
            <>
              {/* Available Matches Section */}
              <div className="space-y-4">
                {availableMatches.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-3">
                      <div>
                        <h3 className="text-lg sm:text-xl font-black font-display uppercase tracking-wider text-white flex items-center gap-2">
                          <Swords className="h-5 w-5 text-[#FF168B]" />
                          <span>Available Matches ({availableMatches.length})</span>
                        </h3>
                        <p className="text-xs text-white/60">
                          Open challenges waiting for opponents. Join instantly with one tap.
                        </p>
                      </div>

                      <Button
                        onClick={scrollToCreateMatch}
                        className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase tracking-wider h-10 px-5 gap-1.5 cursor-pointer shadow-lg shadow-yellow-500/20"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Create Match</span>
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {availableMatches.map((am) => (
                        <Card
                          key={am.id}
                          className="rounded-2xl bg-gradient-to-b from-[#1010C5] to-[#080860] border border-white/20 hover:border-[#FFFF00]/50 p-4 sm:p-5 text-white shadow-xl flex flex-col justify-between gap-4 transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase text-[#FF168B] bg-[#FF168B]/15 border border-[#FF168B]/35 px-2.5 py-0.5 rounded-full">
                              {am.card?.name || '1v1'}
                            </span>
                            <span className="text-xs font-mono text-white/50">{am.match_code}</span>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-[#08088F] border border-white/20 flex items-center justify-center font-bold text-xs text-[#FFFF00]">
                                {am.creator_profile?.display_name?.[0]?.toUpperCase() || 'P'}
                              </div>
                              <span className="text-sm font-bold text-white truncate">
                                {am.creator_profile?.display_name || 'Verified Rival'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs pt-1">
                              <span className="text-white/60">
                                Entry: <strong className="text-white">₹{am.card?.entry_amount || 0}</strong>
                              </span>
                              <span className="text-white/60">
                                Payout:{' '}
                                <strong className="text-[#00E676] font-display font-black">
                                  ₹{am.card?.advertised_payout || 0}
                                </strong>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                            <Button
                              onClick={() => handleDirectJoin(am.match_code, am.id)}
                              disabled={joiningMatchId === am.id}
                              className="flex-1 rounded-xl bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase tracking-wider h-9 cursor-pointer transition-all shadow-md"
                            >
                              <span>{joiningMatchId === am.id ? 'Joining...' : 'Join Match'}</span>
                            </Button>
                            <Button
                              onClick={() => {
                                // Share this match info
                                const dummyMatch: any = {
                                  id: am.id,
                                  match_code: am.match_code,
                                  card: am.card,
                                };
                                setShareMatchTarget(dummyMatch);
                              }}
                              variant="outline"
                              size="sm"
                              className="rounded-xl border-white/20 text-white hover:bg-white/10 h-9 px-2.5"
                              title="Share match link"
                            >
                              <Share2 className="h-3.5 w-3.5 text-[#FFFF00]" />
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </>
                ) : (
                  /* Unified interactive button on 1VS 1 containing Available Matches (0) */
                  <button
                    type="button"
                    onClick={scrollToCreateMatch}
                    className="w-full text-left rounded-3xl border-2 border-dashed border-[#FFFF00]/40 hover:border-[#FFFF00] bg-gradient-to-b from-[#1010C5]/40 to-[#08084A]/60 hover:from-[#1010C5]/70 hover:to-[#080860] p-5 sm:p-7 space-y-4 transition-all duration-200 group cursor-pointer shadow-xl hover:shadow-[#FFFF00]/10 hover:scale-[1.005] active:scale-[0.995] select-none block"
                  >
                    {/* Top inside button: Available Matches (0) Header & Description */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/15 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Swords className="h-5 w-5 text-[#FF168B]" />
                          <span className="text-lg sm:text-xl font-black font-display uppercase tracking-wider text-white group-hover:text-[#FFFF00] transition-colors">
                            Available Matches (0)
                          </span>
                        </div>
                        <p className="text-xs text-white/70 mt-0.5">
                          Open challenges waiting for opponents. Join instantly with one tap.
                        </p>
                      </div>

                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFFF00] group-hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase tracking-wider px-4 py-2 shrink-0 shadow-md shadow-yellow-500/20 transition-all self-start sm:self-auto">
                        <Plus className="h-3.5 w-3.5" />
                        <span>Create Match</span>
                      </span>
                    </div>

                    {/* Center body inside button: Prompt and primary action */}
                    <div className="py-2 text-center space-y-3.5">
                      <div className="h-12 w-12 rounded-2xl bg-[#FFFF00]/15 border border-[#FFFF00]/30 flex items-center justify-center mx-auto text-[#FFFF00] group-hover:scale-110 group-hover:bg-[#FFFF00] group-hover:text-[#08088F] transition-all shadow-md">
                        <Swords className="h-6 w-6" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-base sm:text-lg font-black uppercase text-white font-display group-hover:text-[#FFFF00] transition-colors">
                          No 1V1 matches waiting right now.
                        </h4>
                        <p className="text-xs text-white/70 max-w-md mx-auto leading-relaxed">
                          Create one below and share your link to challenge verified players immediately!
                        </p>
                      </div>
                      <div className="pt-1">
                        <span className="inline-flex items-center gap-2 rounded-full bg-[#FFFF00] group-hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase tracking-wider h-11 px-7 shadow-lg shadow-yellow-500/25 transition-all">
                          <Plus className="h-4 w-4" />
                          <span>Create Match</span>
                        </span>
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {/* Challenge Tiers Card Grid */}
              <div id="challenge-tiers" className="pt-4">
                <OneVsOneCardGrid
                  cards={cards}
                  isEligible={isEligible}
                  onMatchInitiated={handleMatchInitiated}
                />
              </div>

          {/* Recent Match History */}
          <div className="space-y-4 pt-6 border-t border-white/15">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-lg font-black font-display uppercase tracking-wider text-white flex items-center gap-2">
                <History className="h-4 w-4 text-[#FFFF00]" />
                <span>Recent 1v1 Arena Matches</span>
              </h3>

              {historyMatches.length > 0 && (
                <div className="flex items-center gap-1.5 p-1 bg-white/5 border border-white/10 rounded-full w-fit max-w-full overflow-x-auto no-scrollbar shrink-0">
                  <button
                    onClick={() => setHistoryFilter('all')}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      historyFilter === 'all'
                        ? 'bg-[#FFFF00] text-[#08088F]'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    All ({historyMatches.length})
                  </button>
                  <button
                    onClick={() => setHistoryFilter('wins')}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      historyFilter === 'wins'
                        ? 'bg-[#00E676] text-[#08088F]'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Wins ({historyMatches.filter((m) => m.result?.claimed_winner_id === currentUserId).length})
                  </button>
                  <button
                    onClick={() => setHistoryFilter('losses')}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      historyFilter === 'losses'
                        ? 'bg-[#FF168B] text-white'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Defeats ({historyMatches.filter((m) => m.result?.claimed_winner_id && m.result.claimed_winner_id !== currentUserId).length})
                  </button>
                </div>
              )}
            </div>

            {historyMatches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-center text-xs text-white/50">
                No past matches recorded yet. Enter a challenge tier above to build your match history!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {historyMatches
                  .filter((m) => {
                    if (historyFilter === 'wins') return m.result?.claimed_winner_id === currentUserId;
                    if (historyFilter === 'losses') return m.result?.claimed_winner_id && m.result.claimed_winner_id !== currentUserId;
                    return true;
                  })
                  .map((m) => {
                    const isWin = m.result?.claimed_winner_id === currentUserId;
                    return (
                      <Card
                        key={m.id}
                        className="rounded-2xl bg-gradient-to-b from-[#1010C5] to-[#080860] border border-white/15 p-4 text-white flex items-center justify-between shadow-lg"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase text-[#FF168B] bg-[#FF168B]/15 border border-[#FF168B]/35 px-2 py-0.5 rounded-full">
                              {m.card?.name || '1v1'}
                            </span>
                            <span className="text-xs font-mono text-white/50">{m.match_code}</span>
                          </div>
                          <div className="text-sm font-bold text-white truncate">
                            vs <span className="text-[#FFFF00]">{m.opponent?.profile?.display_name || 'Rival'}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`text-xs font-black uppercase px-2.5 py-1 rounded-full ${
                              isWin
                                ? 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/40'
                                : 'bg-[#FF168B]/20 text-[#FF168B] border border-[#FF168B]/40'
                            }`}
                          >
                            {isWin ? 'Victory' : 'Defeat'}
                          </span>
                          <div className="text-xs font-mono text-white/60 mt-1">
                            {m.result ? `${m.result.player_one_score} - ${m.result.player_two_score}` : 'Concluded'}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
              </div>
            )}
          </div>
          </>
        )}
        </div>
      )}

      {/* 6. TAB 2: SUPER 4 CONTENT */}
      {arenaModeTab === 'super4' && (
        <div className="space-y-6">
          <div className="border-b border-white/15 pb-3">
            <h3 className="text-lg sm:text-xl font-black font-display uppercase tracking-wider text-white">
              Available rooms
            </h3>
            <p className="text-xs text-white/60">
              No Super 4 rooms open right now. New rooms are published by admin, check back soon.
            </p>
          </div>

          <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 p-8 text-center space-y-4 max-w-xl mx-auto">
            <div className="h-14 w-14 rounded-2xl bg-[#1E1EF5]/20 border border-[#1E1EF5]/40 text-[#1E1EF5] flex items-center justify-center mx-auto">
              <Users className="h-7 w-7 text-[#FFFF00]" />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-black uppercase text-white font-display">
                Super 4 Mini-Knockouts
              </h4>
              <p className="text-xs text-white/70 max-w-md mx-auto leading-relaxed">
                4-Player mini-bracket tournament. 2 Semi-Finals, 1 Grand Final. Winner takes the full pot.
                New rooms are scheduled continuously by admin.
              </p>
            </div>
            <Button
              onClick={() => alert('Notification enabled for upcoming Super 4 rooms!')}
              className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase tracking-wider h-10 px-6 gap-2 cursor-pointer shadow-lg shadow-yellow-500/20"
            >
              <Bell className="h-4 w-4" />
              <span>Notify Me When Rooms Open</span>
            </Button>
          </div>
        </div>
      )}

      {/* 7. TAB 3: SUPER 8 CONTENT */}
      {arenaModeTab === 'super8' && (
        <div className="space-y-6">
          <div className="border-b border-white/15 pb-3">
            <h3 className="text-lg sm:text-xl font-black font-display uppercase tracking-wider text-white">
              Available rooms
            </h3>
            <p className="text-xs text-white/60">
              No Super 8 rooms open right now. New rooms are published by admin, check back soon.
            </p>
          </div>

          <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 p-8 text-center space-y-4 max-w-xl mx-auto">
            <div className="h-14 w-14 rounded-2xl bg-[#FF168B]/20 border border-[#FF168B]/40 text-[#FF168B] flex items-center justify-center mx-auto">
              <Trophy className="h-7 w-7 text-[#FF168B]" />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-black uppercase text-white font-display">
                Super 8 Championship Rooms
              </h4>
              <p className="text-xs text-white/70 max-w-md mx-auto leading-relaxed">
                8-Player championship bracket. Quarter-Finals, Semi-Finals, and Grand Final. Payouts distributed to Top 2 finishers.
              </p>
            </div>
            <Button
              onClick={() => alert('Notification enabled for upcoming Super 8 rooms!')}
              className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase tracking-wider h-10 px-6 gap-2 cursor-pointer shadow-lg shadow-yellow-500/20"
            >
              <Bell className="h-4 w-4" />
              <span>Notify Me When Rooms Open</span>
            </Button>
          </div>
        </div>
      )}

      {/* 8. COMPETITIVE ARENA LEADERBOARD */}
      <div className="pt-6 border-t border-white/15">
        <ArenaLeaderboard initialEntries={initialLeaderboard} />
      </div>

      {/* Join Match Modal */}
      {showJoinModal && (
        <JoinMatchModal
          initialCode={joinModalCode}
          onClose={() => setShowJoinModal(false)}
          onJoined={(matchId) => {
            setShowJoinModal(false);
            router.refresh();
          }}
        />
      )}

      {/* Share Match Modal (from Available Matches or Active Match) */}
      {shareMatchTarget && (
        <ShareMatchModal
          match={shareMatchTarget}
          onClose={() => setShareMatchTarget(null)}
        />
      )}
    </div>
  );
}
