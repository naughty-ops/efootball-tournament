'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  Users,
  Share2,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Match, Round, Tournament, Participant } from '@/types/database';
import { Button } from '@/components/ui/button';
import { LiveMatchPredictionsWidget } from '@/components/public/live/LiveMatchPredictionsWidget';
import { ViewerSessionTracker } from '@/components/public/live/ViewerSessionTracker';
import LivePlayerSkeleton from '@/components/public/live/LivePlayerSkeleton';

// Dynamically import LiveKit Stream Player with SSR disabled to isolate 573 KB livekit-client WebRTC bundle
const LiveKitStreamPlayer = dynamic(
  () => import('@/components/public/live/LiveKitStreamPlayer'),
  {
    ssr: false,
    loading: () => <LivePlayerSkeleton />,
  }
);

interface FullLiveMatchData {
  match: Match;
  round?: Round | null;
  tournament?: Tournament | null;
  participantA?: Participant | null;
  participantB?: Participant | null;
}

export default function DedicatedLiveMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(params);

  const [matchData, setMatchData] = useState<FullLiveMatchData | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState<number>(1);
  const [copied, setCopied] = useState(false);

  // 1. Fetch Match Data
  const fetchMatchInfo = async () => {
    try {
      const supabase = createClient();

      const { data: mData, error: mErr } = await (supabase.from('matches') as any)
        .select('*')
        .eq('id', matchId)
        .single();

      if (mErr || !mData) {
        setMatchError('Match not found.');
        setLoadingMatch(false);
        return;
      }

      const match = mData as Match;

      const [rRes, paRes, pbRes] = await Promise.all([
        match.round_id
          ? (supabase.from('rounds') as any).select('*').eq('id', match.round_id).single()
          : Promise.resolve({ data: null }),
        match.participant_a
          ? (supabase.from('tournament_participants_public') as any)
              .select('id, username')
              .eq('id', match.participant_a)
              .single()
              .then((res: any) =>
                res.error
                  ? (supabase.from('participants') as any)
                      .select('id, username')
                      .eq('id', match.participant_a)
                      .single()
                  : res
              )
          : Promise.resolve({ data: null }),
        match.participant_b
          ? (supabase.from('tournament_participants_public') as any)
              .select('id, username')
              .eq('id', match.participant_b)
              .single()
              .then((res: any) =>
                res.error
                  ? (supabase.from('participants') as any)
                      .select('id, username')
                      .eq('id', match.participant_b)
                      .single()
                  : res
              )
          : Promise.resolve({ data: null }),
      ]);

      let tData: Tournament | null = null;
      if (rRes.data && rRes.data.tournament_id) {
        const { data: tourney } = await (supabase.from('tournaments') as any)
          .select('*')
          .eq('id', rRes.data.tournament_id)
          .single();
        tData = tourney as Tournament;
      }

      setMatchData({
        match,
        round: rRes.data as Round | null,
        tournament: tData,
        participantA: paRes.data as Participant | null,
        participantB: pbRes.data as Participant | null,
      });
      setLoadingMatch(false);
    } catch (err: any) {
      console.error('Error fetching live match details:', err);
      setMatchError('Unable to load match details.');
      setLoadingMatch(false);
    }
  };

  useEffect(() => {
    fetchMatchInfo();
  }, [matchId]);

  // Realtime subscription for score updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live_match_sync_${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchId}`,
        },
        (payload: any) => {
          if (payload.new) {
            setMatchData((prev) => (prev ? { ...prev, match: payload.new as Match } : null));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  const handleCopyLink = async () => {
    try {
      if (typeof window !== 'undefined') {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  if (loadingMatch) {
    return (
      <div className="min-h-screen bg-[#08088F] text-white flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00]" />
          <span className="text-sm font-black font-display uppercase tracking-widest text-white">Loading Stream...</span>
        </div>
      </div>
    );
  }

  if (matchError || !matchData) {
    return (
      <div className="min-h-screen bg-[#08088F] text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="p-6 rounded-[28px] bg-[#1818D4] text-white border border-white/20 max-w-sm">
          <AlertCircle className="h-8 w-8 mx-auto mb-3 text-[#FF168B]" />
          <h2 className="text-base font-black font-display uppercase">{matchError || 'Match Not Found'}</h2>
        </div>
        <Button asChild className="bg-[#FFFF00] text-[#08088F] hover:bg-[#FFFF00]/90 font-black rounded-full text-xs shadow-md">
          <Link href="/live">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Back to Live Matches
          </Link>
        </Button>
      </div>
    );
  }

  const { match, tournament, participantA, participantB } = matchData;

  return (
    <div className="min-h-screen bg-transparent text-white pb-12 font-sans">
      {/* Top Navbar */}
      <div className="border-b border-white/15 bg-[#1010C5] shadow-lg sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="h-8 px-3 text-xs text-[#D9DCFF] hover:text-white hover:bg-white/10 rounded-full font-black">
            <Link href="/live">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              <span>Back</span>
            </Link>
          </Button>

          <Button
            size="sm"
            onClick={handleCopyLink}
            className="h-8 px-3.5 text-xs font-black bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] gap-1.5 rounded-full shadow-md"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-[#08088F]" /> : <Share2 className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Share Stream'}</span>
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-2 sm:px-4 pt-4 space-y-4">
        {/* ESSENTIAL INFO ONLY (ABOVE THE VIDEO) — Electric Blue Scoreboard Banner */}
        <div className="bg-[#1010C5] text-white p-4 sm:p-5 rounded-[28px] shadow-xl border border-white/20 space-y-3">
          {/* Top Line: 🔴 LIVE & Viewer Count */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="bg-[#FF168B] text-white font-black text-[9px] uppercase px-2.5 py-0.5 rounded-full tracking-wider gap-1 shadow-sm flex items-center">
                <span className="relative flex h-1.5 w-1.5 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                </span>
                LIVE
              </span>
              <span className="text-xs font-bold text-[#D9DCFF] truncate">
                {tournament?.name ? `${tournament.name} • ` : ''}Match #{match.match_position}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-black text-[#FFFF00] bg-[#0A0A7A] border border-white/20 px-3 py-1 rounded-full">
              <Users className="h-3 w-3" />
              <span>👁 {viewerCount}</span>
            </div>
          </div>

          {/* Minimal Scoreboard Display */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/15">
            <p className="text-sm sm:text-base font-black text-white truncate flex-1 text-left">
              {participantA?.username || 'Player 1'}
            </p>

            <div className="flex items-center gap-2 px-4 py-1 bg-[#0A0A7A] rounded-2xl border border-white/20 shrink-0 font-mono">
              <span className="text-xl sm:text-2xl font-black font-display text-[#FFFF00] tabular-nums">
                {match.score_a}
              </span>
              {match.decided_by === 'penalties' &&
                match.penalty_score_a !== null &&
                match.penalty_score_a !== undefined &&
                match.penalty_score_b !== null &&
                match.penalty_score_b !== undefined && (
                  <>
                    <span className="text-xs font-black text-[#08088F] bg-[#FFFF00] px-1.5 py-0.5 rounded-full">
                      ({match.penalty_score_a})
                    </span>
                    <span className="text-xs font-bold text-white/40 font-sans">–</span>
                    <span className="text-xs font-black text-[#08088F] bg-[#FFFF00] px-1.5 py-0.5 rounded-full">
                      ({match.penalty_score_b})
                    </span>
                  </>
                )}
              {match.decided_by !== 'penalties' && <span className="text-xs font-bold text-white/40">—</span>}
              <span className="text-xl sm:text-2xl font-black font-display text-[#FFFF00] tabular-nums">
                {match.score_b}
              </span>
            </div>

            <p className="text-sm sm:text-base font-black text-white truncate flex-1 text-right">
              {participantB?.username || 'Player 2'}
            </p>
          </div>
        </div>

        {/* MAIN SECTION — Live Streaming Video Player Wrapper Card */}
        <div className="bg-[#1818D4] border border-white/20 shadow-2xl rounded-[32px] p-2 sm:p-3 space-y-2">
          <LiveKitStreamPlayer
            match={match}
            tournament={tournament}
            participantA={participantA}
            participantB={participantB}
            onViewerCountChange={setViewerCount}
          />
        </div>
      </div>

      {/* Viewer Session Tracking (Background) */}
      <ViewerSessionTracker matchId={matchId} />

      {/* Live Match Prediction Widget */}
      {matchData && (
        <LiveMatchPredictionsWidget
          matchId={matchId}
          participantA={matchData.participantA}
          participantB={matchData.participantB}
          isMatchCompleted={matchData.match.status === 'completed' || matchData.match.status === 'walkover'}
          isMatchLive={matchData.match.status === 'live'}
          matchWinnerId={matchData.match.winner_id}
        />
      )}
    </div>
  );
}
