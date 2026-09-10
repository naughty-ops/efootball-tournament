'use client';

import React, { useState, useEffect, useRef, use, useCallback } from 'react';
import Link from 'next/link';
import {
  Room,
  RoomEvent,
  RemoteTrackPublication,
  RemoteParticipant,
  Track,
  RemoteTrack,
} from 'livekit-client';
import {
  ArrowLeft,
  Tv,
  Users,
  Radio,
  Share2,
  Check,
  Maximize,
  Volume2,
  VolumeX,
  Play,
  Pause,
  AlertCircle,
  Loader2,
  Trophy,
  RefreshCw,
  Sun,
  PictureInPicture2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Match, Round, Tournament, Participant } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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

  // LiveKit WebRTC State
  const [connectionState, setConnectionState] = useState<
    'CONNECTING' | 'LIVE' | 'OFFLINE' | 'ENDED' | 'ERROR'
  >('CONNECTING');
  const [viewerCount, setViewerCount] = useState<number>(1);
  const [copied, setCopied] = useState(false);

  // Video Controls State
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [pipSupported, setPipSupported] = useState(false);

  // Mobile VLC / MX Gesture States (Brightness & Volume Swipe)
  const [brightness, setBrightness] = useState(100);
  const [gestureHUD, setGestureHUD] = useState<{
    type: 'brightness' | 'volume' | null;
    value: number;
  }>({ type: null, value: 100 });

  const roomRef = useRef<Room | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Touch gesture refs
  const touchStartRef = useRef<{
    x: number;
    y: number;
    initialVal: number;
    side: 'left' | 'right';
  } | null>(null);

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
          ? (supabase.from('participants') as any).select('*').eq('id', match.participant_a).single()
          : Promise.resolve({ data: null }),
        match.participant_b
          ? (supabase.from('participants') as any).select('*').eq('id', match.participant_b).single()
          : Promise.resolve({ data: null }),
      ]);

      let tournament: Tournament | null = null;
      if (rRes.data && rRes.data.tournament_id) {
        const { data: tData } = await (supabase.from('tournaments') as any)
          .select('*')
          .eq('id', rRes.data.tournament_id)
          .single();
        tournament = tData as Tournament;
      }

      setMatchData({
        match,
        round: rRes.data as Round | null,
        tournament,
        participantA: paRes.data as Participant | null,
        participantB: pbRes.data as Participant | null,
      });

      if (match.status === 'completed' || match.status === 'walkover') {
        setConnectionState('ENDED');
      }
    } catch (err: any) {
      console.error('Error fetching live match data:', err);
      setMatchError(err.message || 'Failed to load match.');
    } finally {
      setLoadingMatch(false);
    }
  };

  useEffect(() => {
    fetchMatchInfo();
    if (typeof document !== 'undefined') {
      setPipSupported(Boolean(document.pictureInPictureEnabled));
    }
  }, [matchId]);

  // Realtime Supabase Subscription for Instant Score Updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-match-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        (payload) => {
          if (payload.new) {
            setMatchData((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                match: {
                  ...prev.match,
                  score_a: payload.new.score_a ?? prev.match.score_a,
                  score_b: payload.new.score_b ?? prev.match.score_b,
                  status: payload.new.status ?? prev.match.status,
                  live_room_name: payload.new.live_room_name ?? prev.match.live_room_name,
                },
              };
            });

            if (payload.new.status === 'completed' || payload.new.status === 'walkover') {
              setConnectionState('ENDED');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  // 2. Connect to LiveKit Room as Viewer
  const connectToStream = async () => {
    if (!matchData) return;
    const { match } = matchData;

    const roomName = match.live_room_name || `efootball-match-${match.id}`;
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    setConnectionState('CONNECTING');

    const viewerIdentity = `viewer-${Math.random().toString(36).substring(2, 9)}`;

    try {
      let tokenRes = await fetch('/api/live/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: roomName,
          identity: viewerIdentity,
          role: 'viewer',
        }),
      }).catch(() => null);

      if (!tokenRes || !tokenRes.ok) {
        tokenRes = await fetch('/api/livekit/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room: roomName,
            identity: viewerIdentity,
            role: 'viewer',
          }),
        }).catch(() => null);
      }

      if (!tokenRes || !tokenRes.ok) {
        throw new Error('Failed to acquire viewer token from server.');
      }

      const tokenData = await tokenRes.json();
      if (!tokenData.token) {
        throw new Error(tokenData.error || 'Failed to acquire viewer token.');
      }

      const livekitUrl = tokenData.url || process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://efootball-tournament-pic0fkvb.livekit.cloud';

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      const attachTrack = (track: Track | RemoteTrack) => {
        if (track.kind === Track.Kind.Video && videoRef.current) {
          track.attach(videoRef.current);
          if (videoRef.current) {
            videoRef.current.muted = isMuted;
            videoRef.current.play().catch(() => {
              if (videoRef.current) {
                videoRef.current.muted = true;
                setIsMuted(true);
                videoRef.current.play().catch(() => {});
              }
            });
          }
          setConnectionState('LIVE');
        } else if (track.kind === Track.Kind.Audio && audioRef.current) {
          track.attach(audioRef.current);
          if (audioRef.current) {
            audioRef.current.muted = isMuted;
            audioRef.current.volume = volume;
            audioRef.current.play().catch(() => {
              if (audioRef.current) {
                audioRef.current.muted = true;
                setIsMuted(true);
                audioRef.current.play().catch(() => {});
              }
            });
          }
        }
      };

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack) => {
          attachTrack(track);
        }
      );

      room.on(
        RoomEvent.TrackUnsubscribed,
        (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          track.detach();
          const videoTracks = Array.from(participant.videoTrackPublications.values()).filter(
            (p) => p.isSubscribed
          );
          if (videoTracks.length === 0) {
            setConnectionState('OFFLINE');
          }
        }
      );

      const updateParticipants = () => {
        setViewerCount((room.remoteParticipants.size || 0) + 1);
      };

      room.on(RoomEvent.ParticipantConnected, updateParticipants);
      room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
      room.on(RoomEvent.Disconnected, () => {
        setConnectionState('OFFLINE');
      });

      await room.connect(livekitUrl, tokenData.token);
      updateParticipants();

      let foundVideo = false;
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) {
          if (!pub.isSubscribed) {
            pub.setSubscribed(true);
          }
          if (pub.track) {
            attachTrack(pub.track);
            if (pub.kind === Track.Kind.Video) {
              foundVideo = true;
            }
          }
        }
      }

      if (foundVideo) {
        setConnectionState('LIVE');
      } else {
        setTimeout(() => {
          setConnectionState((curr) => (curr === 'CONNECTING' ? 'OFFLINE' : curr));
        }, 8000);
      }
    } catch (err: any) {
      console.error('Error connecting to stream:', err);
      setConnectionState('OFFLINE');
    }
  };

  useEffect(() => {
    if (matchData && matchData.match.status !== 'completed') {
      connectToStream();
    }
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, [matchData?.match.id]);

  // Auto-hiding controls timeout
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  const handlePlayerTap = () => {
    if (showControls) {
      setShowControls(false);
    } else {
      resetControlsTimeout();
    }
  };

  // Player Controls
  const toggleMute = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
      if (!nextMuted) videoRef.current.volume = volume > 0 ? volume : 1;
    }
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
      if (!nextMuted) audioRef.current.volume = volume > 0 ? volume : 1;
    }
    if (!nextMuted && volume === 0) {
      setVolume(1);
    }
  };

  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleFullscreen = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        containerRef.current.requestFullscreen().then(() => {
          try {
            if (screen.orientation && 'lock' in screen.orientation) {
              (screen.orientation as any).lock('landscape').catch(() => {});
            }
          } catch {}
        }).catch(() => {});
      }
    }
  };

  const togglePiP = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      if (videoRef.current) {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await videoRef.current.requestPictureInPicture();
        }
      }
    } catch (err) {
      console.error('PiP Error:', err);
    }
  };

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

  // Mobile VLC / MX Player Touch Swipe Gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !containerRef.current) return;
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    const side = touchX < rect.width / 2 ? 'left' : 'right';

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      initialVal: side === 'left' ? brightness : isMuted ? 0 : volume,
      side,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.touches.length !== 1 || !containerRef.current) return;
    const touch = e.touches[0];
    const deltaY = touchStartRef.current.y - touch.clientY;
    const rect = containerRef.current.getBoundingClientRect();
    const sensitivity = 1.2;
    const percentChange = (deltaY / rect.height) * 100 * sensitivity;

    if (touchStartRef.current.side === 'left') {
      const nextBrightness = Math.min(100, Math.max(20, Math.round(touchStartRef.current.initialVal + percentChange)));
      setBrightness(nextBrightness);
      setGestureHUD({ type: 'brightness', value: nextBrightness });
    } else {
      const nextVolPercent = Math.min(100, Math.max(0, Math.round(touchStartRef.current.initialVal * 100 + percentChange)));
      const volFraction = nextVolPercent / 100;
      setVolume(volFraction);
      if (videoRef.current) {
        videoRef.current.volume = volFraction;
        videoRef.current.muted = volFraction === 0;
      }
      if (audioRef.current) {
        audioRef.current.volume = volFraction;
        audioRef.current.muted = volFraction === 0;
      }
      setIsMuted(volFraction === 0);
      setGestureHUD({ type: 'volume', value: nextVolPercent });
    }

    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    hudTimeoutRef.current = setTimeout(() => {
      setGestureHUD({ type: null, value: 0 });
    }, 1200);
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
  };

  if (loadingMatch) {
    return (
      <div className="min-h-screen bg-[#F4F8F5] text-[#0B3323] flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-2.5">
          <Loader2 className="h-6 w-6 animate-spin text-[#0B3323]" />
          <span className="text-xs font-bold text-[#0B3323]">Loading Stream...</span>
        </div>
      </div>
    );
  }

  if (matchError || !matchData) {
    return (
      <div className="min-h-screen bg-[#F4F8F5] text-[#0B3323] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20">
          <AlertCircle className="h-7 w-7 mx-auto mb-2" />
          <h2 className="text-sm font-bold">{matchError || 'Match Not Found'}</h2>
        </div>
        <Button asChild variant="outline" className="border-[#0B3323]/20 text-[#0B3323] hover:bg-white text-xs font-bold">
          <Link href="/live">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Back to Live Matches
          </Link>
        </Button>
      </div>
    );
  }

  const { match, round, tournament, participantA, participantB } = matchData;

  return (
    <div className="min-h-screen bg-[#F4F8F5] text-[#0B3323] pb-12 font-sans">
      {/* Top Navbar */}
      <div className="border-b border-[#0B3323]/10 bg-white shadow-xs sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-3 py-2 flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-[#0B3323] hover:bg-[#F4F8F5] font-bold">
            <Link href="/live">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              <span>Back</span>
            </Link>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            className="h-7 px-2.5 text-xs font-bold bg-[#F4F8F5] border-[#0B3323]/20 hover:bg-white text-[#0B3323] gap-1 rounded-lg"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Share2 className="h-3 w-3" />}
            <span>{copied ? 'Copied' : 'Share'}</span>
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-2 sm:px-4 pt-3 space-y-3">
        {/* ESSENTIAL INFO ONLY (ABOVE THE VIDEO) — Premium Emerald Green Scoreboard Banner */}
        <div className="bg-gradient-to-r from-[#0B3323] via-[#0E422E] to-[#0B3323] text-white p-3.5 sm:p-4 rounded-2xl shadow-md border border-[#0B3323] space-y-3">
          {/* Top Line: 🔴 LIVE & Viewer Count */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-red-600 text-white font-black text-[9px] uppercase px-2 py-0.5 tracking-wider gap-1 shadow-2xs">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                </span>
                LIVE
              </Badge>
              <span className="text-xs font-bold text-slate-200 truncate">
                {tournament?.name ? `${tournament.name} • ` : ''}Match #{match.match_position}
              </span>
            </div>

            <div className="flex items-center gap-1 text-xs font-bold text-emerald-300 bg-black/30 border border-white/20 px-2.5 py-0.5 rounded-lg">
              <Users className="h-3 w-3" />
              <span>👁 {viewerCount}</span>
            </div>
          </div>

          {/* Minimal Scoreboard Display */}
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/10">
            <p className="text-sm sm:text-base font-black text-white truncate flex-1 text-left">
              {participantA?.username || 'Player 1'}
            </p>

            <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded-xl border border-amber-400/30 shrink-0 font-mono">
              <span className="text-xl sm:text-2xl font-black text-amber-300 tabular-nums">
                {match.score_a}
              </span>
              <span className="text-xs font-bold text-slate-400">—</span>
              <span className="text-xl sm:text-2xl font-black text-amber-300 tabular-nums">
                {match.score_b}
              </span>
            </div>

            <p className="text-sm sm:text-base font-black text-white truncate flex-1 text-right">
              {participantB?.username || 'Player 2'}
            </p>
          </div>
        </div>

        {/* MAIN SECTION — Live Streaming Video Player Wrapper Card */}
        <div className="bg-white border border-[#0B3323]/15 shadow-xl rounded-2xl p-2 sm:p-2.5 space-y-2">
          <div
            ref={containerRef}
            onClick={handlePlayerTap}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-[#0B3323]/20 shadow-inner flex items-center justify-center select-none group touch-none"
            style={{ filter: `brightness(${brightness}%)` }}
          >
            {/* HTML5 Video & Audio Elements (ALWAYS MOUNTED IN DOM FOR WEBRTC) */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isMuted}
              className="w-full h-full object-contain bg-black"
            />
            <audio
              ref={audioRef}
              autoPlay
              playsInline
              muted={isMuted}
              className="hidden"
            />

            {/* VLC/MX Gesture HUD Floating Overlay (Brightness / Volume vertical indicator) */}
            {gestureHUD.type && (
              <div className="absolute top-1/2 -translate-y-1/2 z-30 p-3 rounded-2xl bg-black/85 backdrop-blur-md border border-white/20 text-white flex flex-col items-center gap-1.5 shadow-2xl animate-fade-in pointer-events-none">
                {gestureHUD.type === 'brightness' ? (
                  <Sun className="h-6 w-6 text-amber-400" />
                ) : (
                  <Volume2 className="h-6 w-6 text-emerald-400" />
                )}
                <span className="text-xs font-black font-mono">{gestureHUD.value}%</span>
                <div className="w-1.5 h-12 bg-white/20 rounded-full overflow-hidden flex flex-col justify-end">
                  <div
                    className={`w-full ${gestureHUD.type === 'brightness' ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ height: `${gestureHUD.value}%` }}
                  />
                </div>
              </div>
            )}

            {/* 1-Tap "Tap for Audio 🔊" Prompt Overlay when muted */}
            {connectionState === 'LIVE' && isMuted && (
              <button
                type="button"
                onClick={toggleMute}
                className="absolute top-3 right-3 z-30 bg-black/85 hover:bg-black text-amber-400 border border-amber-400/40 px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg flex items-center gap-1.5 animate-bounce"
              >
                <VolumeX className="h-3.5 w-3.5" />
                <span>Tap for Audio 🔊</span>
              </button>
            )}

            {/* CONNECTING Overlay */}
            {connectionState === 'CONNECTING' && (
              <div className="absolute inset-0 bg-black/90 z-20 flex flex-col items-center justify-center gap-2.5 p-6 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                <h3 className="text-xs font-bold text-white">Connecting to live match...</h3>
              </div>
            )}

            {/* OFFLINE Overlay */}
            {connectionState === 'OFFLINE' && (
              <div className="absolute inset-0 bg-black/95 z-20 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="h-11 w-11 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                  <Radio className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-white">📡 STREAM OFFLINE</h3>
                  <p className="text-xs text-zinc-400 max-w-xs">
                    The broadcaster is currently offline for this match.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={connectToStream}
                  className="gap-1.5 text-xs font-bold border-zinc-800 text-white hover:bg-zinc-900 rounded-xl h-8"
                >
                  <RefreshCw className="h-3 w-3 text-emerald-400" />
                  Retry Stream
                </Button>
              </div>
            )}

            {/* ENDED Overlay */}
            {connectionState === 'ENDED' && (
              <div className="absolute inset-0 bg-black/95 z-20 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="h-11 w-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Trophy className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-white">🏁 LIVE STREAM ENDED</h3>
                  <p className="text-xs text-zinc-400 max-w-xs">
                    This live match has concluded.
                  </p>
                </div>
                <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs px-4 h-8">
                  <Link href={tournament ? `/t/${tournament.id}` : '/live'}>
                    View Match Result
                  </Link>
                </Button>
              </div>
            )}

            {/* VLC / MX Player Auto-Hiding Controls Bar */}
            {connectionState === 'LIVE' && showControls && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/95 via-black/60 to-transparent z-20 flex items-center justify-between text-white transition-opacity duration-300"
              >
                {/* Left Controls: Play/Pause & Audio Mute/Volume */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={togglePlay}
                    className="h-8 w-8 text-white hover:bg-white/20 rounded-xl"
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleMute}
                    className="h-8 w-8 text-white hover:bg-white/20 rounded-xl"
                  >
                    {isMuted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Right Controls: PiP & Fullscreen */}
                <div className="flex items-center gap-2">
                  {pipSupported && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={togglePiP}
                      className="h-8 w-8 text-white hover:bg-white/20 rounded-xl"
                      title="Picture in Picture"
                    >
                      <PictureInPicture2 className="h-4 w-4" />
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleFullscreen}
                    className="h-8 w-8 text-white hover:bg-white/20 rounded-xl"
                    title="Fullscreen"
                  >
                    <Maximize className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
