'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Swords,
  Copy,
  Check,
  ShieldCheck,
  Clock,
  Play,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trophy,
  User,
  KeyRound,
  Hash,
  Upload,
  Image as ImageIcon,
  Eye,
  Trash2,
  X,
  Share2,
  RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { OneVsOneMatchDetail } from '@/types/oneVsOne';
import {
  submitRoomCredentialsAction,
  confirmPlayerReadyAction,
  confirmMatchResultAction,
  cancelWaitingMatchAction,
} from '@/app/actions/oneVsOneActions';
import { compressImage } from '@/lib/utils/compressImage';
import OneVsOneResultModal from './OneVsOneResultModal';
import OneVsOneDisputeModal from './OneVsOneDisputeModal';
import OneVsOneCreditIssueModal from './OneVsOneCreditIssueModal';
import ShareMatchModal from './ShareMatchModal';
import MatchmakingInProgressBanner from './MatchmakingInProgressBanner';

interface OneVsOneMatchRoomProps {
  match: OneVsOneMatchDetail;
  currentUserId: string;
  onRefreshRequested: () => void;
  onQueueCancelled?: () => void;
  onBrowseLobby?: () => void;
  userDisplayName?: string;
}

export default function OneVsOneMatchRoom({
  match,
  currentUserId,
  onRefreshRequested,
  onQueueCancelled,
  onBrowseLobby,
  userDisplayName = 'Player',
}: OneVsOneMatchRoomProps) {
  const router = useRouter();
  // Matchmaking elapsed timer (when status is 'waiting')
  const [elapsed, setElapsed] = useState(0);
  const [isCancellingQueue, setIsCancellingQueue] = useState(false);
  const [queueCancelError, setQueueCancelError] = useState<string | null>(null);
  const [copiedMatchLink, setCopiedMatchLink] = useState(false);
  const [copiedMatchCode, setCopiedMatchCode] = useState(false);

  // Room form states (for Player 1)
  const [roomIdInput, setRoomIdInput] = useState(match.room_id || '');
  const [roomPasswordInput, setRoomPasswordInput] = useState(match.room_password || '');
  const [isSubmittingRoom, setIsSubmittingRoom] = useState(false);
  const [roomFormError, setRoomFormError] = useState<string | null>(null);

  // Ready state
  const [isReadying, setIsReadying] = useState(false);
  const [readyError, setReadyError] = useState<string | null>(null);

  // Result confirmation state
  const [isConfirmingResult, setIsConfirmingResult] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [opponentScreenshotFile, setOpponentScreenshotFile] = useState<File | null>(null);
  const [opponentScreenshotPreview, setOpponentScreenshotPreview] = useState<string | null>(null);
  const opponentFileInputRef = useRef<HTMLInputElement>(null);

  // Lightbox viewer state
  const [activeLightboxImg, setActiveLightboxImg] = useState<{ url: string; title: string } | null>(null);

  // Modal triggers
  const [showResultModal, setShowResultModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showCreditIssueModal, setShowCreditIssueModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Copy helpers
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const isPlayer1 = match.userPosition === 1 || match.status === 'waiting';
  const myPlayer = match.players.find((p) => p.user_id === currentUserId);
  const opponent = match.opponent;
  const isMyReady = myPlayer?.ready_status === 'ready';
  const isOpponentReady = opponent?.ready_status === 'ready';

  // Live timer for matchmaking in room
  useEffect(() => {
    if (match.status !== 'waiting') return;
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [match.status]);

  const formatElapsed = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleCancelMatchmaking = async () => {
    setIsCancellingQueue(true);
    setQueueCancelError(null);
    const res = await cancelWaitingMatchAction(match.id);
    setIsCancellingQueue(false);
    if (!res.success) {
      setQueueCancelError(res.error || 'Failed to cancel matchmaking.');
      return;
    }
    if (onQueueCancelled) {
      onQueueCancelled();
    } else {
      onRefreshRequested();
    }
  };

  const handleCopyMatchLink = () => {
    const origin =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://www.e-football.in';
    const url = `${origin}/dashboard/matches?joinMatch=${match.match_code}`;
    navigator.clipboard.writeText(url);
    setCopiedMatchLink(true);
    setTimeout(() => setCopiedMatchLink(false), 2000);
  };

  const handleCopyMatchCode = () => {
    navigator.clipboard.writeText(match.match_code);
    setCopiedMatchCode(true);
    setTimeout(() => setCopiedMatchCode(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const origin =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://www.e-football.in';
    const matchUrl = `${origin}/dashboard/matches?joinMatch=${match.match_code}`;
    const text = `⚔️ *eFootball 1v1 Arena Challenge!* ⚔️\n\nI created a match room! Join my room now:\n\n🏆 *Tier:* ${
      match.card?.name || '1v1 Arena'
    }\n💰 *Entry:* ₹${match.card?.entry_amount || 0} | *Prize:* ₹${
      match.card?.advertised_payout || 0
    }\n🔑 *Match Code:* ${match.match_code}\n\n👉 *Join Instantly:* ${matchUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const copyToClipboard = (text: string, type: 'id' | 'pass') => {
    navigator.clipboard.writeText(text);
    if (type === 'id') {
      setCopiedRoomId(true);
      setTimeout(() => setCopiedRoomId(false), 2000);
    } else {
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  };

  const handleRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomIdInput.trim()) {
      setRoomFormError('Room ID is required.');
      return;
    }

    setIsSubmittingRoom(true);
    setRoomFormError(null);

    const res = await submitRoomCredentialsAction({
      matchId: match.id,
      roomId: roomIdInput.trim(),
      roomPassword: roomPasswordInput.trim(),
    });

    setIsSubmittingRoom(false);
    if (!res.success) {
      setRoomFormError(res.error || 'Failed to submit room credentials.');
      return;
    }

    onRefreshRequested();
  };

  const handleConfirmReady = async () => {
    setIsReadying(true);
    setReadyError(null);

    const res = await confirmPlayerReadyAction({ matchId: match.id });
    setIsReadying(false);

    if (!res.success) {
      setReadyError(res.error || 'Failed to confirm readiness.');
      return;
    }

    onRefreshRequested();
  };

  const handleOpponentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setConfirmError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setConfirmError('Image size cannot exceed 10MB.');
      return;
    }

    setOpponentScreenshotFile(file);
    setOpponentScreenshotPreview(URL.createObjectURL(file));
    setConfirmError(null);
  };

  const handleClearOpponentFile = () => {
    setOpponentScreenshotFile(null);
    if (opponentScreenshotPreview) {
      URL.revokeObjectURL(opponentScreenshotPreview);
      setOpponentScreenshotPreview(null);
    }
    if (opponentFileInputRef.current) {
      opponentFileInputRef.current.value = '';
    }
  };

  const handleConfirmResult = async () => {
    setIsConfirmingResult(true);
    setConfirmError(null);

    const formData = new FormData();
    formData.append('matchId', match.id);
    if (opponentScreenshotFile) {
      try {
        const readyFile = await compressImage(opponentScreenshotFile, { maxWidth: 1600, quality: 0.82 });
        formData.append('screenshot', readyFile);
      } catch {
        formData.append('screenshot', opponentScreenshotFile);
      }
    }

    const res = await confirmMatchResultAction(formData);
    setIsConfirmingResult(false);

    if (!res.success) {
      setConfirmError(res.error || 'Failed to confirm score.');
      return;
    }

    onRefreshRequested();
  };

  const getStageIndex = (status: string) => {
    switch (status) {
      case 'waiting':
        return 1;
      case 'matched':
        return 2;
      case 'room_submitted':
      case 'ready':
        return 2;
      case 'in_progress':
        return 3;
      case 'result_submitted':
      case 'completed':
      case 'disputed':
        return 4;
      default:
        return 1;
    }
  };
  const currentStage = getStageIndex(match.status);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Official Authentic eFootball Matchmaking Banner when status is waiting */}
      {match.status === 'waiting' && (
        <MatchmakingInProgressBanner
          match={match}
          onCancelled={onQueueCancelled}
        />
      )}

      {/* 1. Room Header Banner */}
      <Card className="rounded-[28px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-white/15 p-5 sm:p-6 text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#FF168B] bg-[#FF168B]/15 border border-[#FF168B]/35 px-3 py-0.5 rounded-full shadow-sm shadow-pink-500/20">
              {match.card?.name || '1v1 Arena'}
            </span>
            <span className="text-xs text-white/60 font-mono">
              Match Code: <span className="font-black text-[#FFFF00]">{match.match_code}</span>
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black font-display uppercase tracking-wider text-white mt-1">
            1v1 Match Room
          </h2>
        </div>

        {/* Status Badge & Room Header Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {match.status === 'waiting' && (
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#050524] border border-[#1E1EF5]/40 text-white shadow-md">
              <div className="relative shrink-0 flex items-center justify-center w-4 h-4">
                <svg
                  className="w-full h-full animate-spin text-white"
                  viewBox="0 0 38 38"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="19" cy="4" r="2.5" fill="currentColor" fillOpacity="1" />
                  <circle cx="26.5" cy="6" r="2.5" fill="currentColor" fillOpacity="0.9" />
                  <circle cx="32" cy="11.5" r="2.5" fill="currentColor" fillOpacity="0.8" />
                  <circle cx="34" cy="19" r="2.5" fill="currentColor" fillOpacity="0.7" />
                  <circle cx="32" cy="26.5" r="2.5" fill="currentColor" fillOpacity="0.6" />
                  <circle cx="26.5" cy="32" r="2.5" fill="currentColor" fillOpacity="0.5" />
                  <circle cx="19" cy="34" r="2.5" fill="currentColor" fillOpacity="0.4" />
                  <circle cx="11.5" cy="32" r="2.5" fill="currentColor" fillOpacity="0.3" />
                  <circle cx="6" cy="26.5" r="2.5" fill="currentColor" fillOpacity="0.2" />
                  <circle cx="4" cy="19" r="2.5" fill="currentColor" fillOpacity="0.15" />
                  <circle cx="6" cy="11.5" r="2.5" fill="currentColor" fillOpacity="0.1" />
                  <circle cx="11.5" cy="6" r="2.5" fill="currentColor" fillOpacity="0.08" />
                </svg>
              </div>
              <span className="text-xs font-bold text-white tracking-wide">
                Matchmaking in Progress...
              </span>
              <span className="text-[10px] font-mono font-bold text-[#FFFF00] bg-[#FFFF00]/15 px-2 py-0.5 rounded-full">
                {formatElapsed(elapsed)}
              </span>
            </div>
          )}
          {match.status === 'matched' && (
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>Awaiting Room Setup</span>
            </span>
          )}
          {match.status === 'room_submitted' && (
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#00E676]/15 border border-[#00E676]/30 text-[#00E676] flex items-center gap-1.5 shadow-sm shadow-[#00E676]/20">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Room Ready • Confirm Status</span>
            </span>
          )}
          {match.status === 'ready' && (
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>Waiting for Opponent</span>
            </span>
          )}
          {match.status === 'in_progress' && (
            <span className="px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#00E676] text-[#08088F] flex items-center gap-1.5 shadow-md shadow-[#00E676]/30 animate-pulse">
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Match In Progress</span>
            </span>
          )}
          {match.status === 'result_submitted' && (
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#FF168B]/15 border border-[#FF168B]/35 text-[#FF168B] flex items-center gap-1.5 shadow-sm shadow-pink-500/20">
              <Trophy className="h-3.5 w-3.5" />
              <span>Score Verification</span>
            </span>
          )}
          {match.status === 'completed' && (
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#00E676]/20 border border-[#00E676]/40 text-[#00E676] flex items-center gap-1.5 shadow-sm shadow-[#00E676]/20">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Completed</span>
            </span>
          )}
          {match.status === 'disputed' && (
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-red-500/15 border border-red-500/30 text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Under Dispute</span>
            </span>
          )}

          <Button
            onClick={() => setShowShareModal(true)}
            size="sm"
            className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] text-xs font-black uppercase tracking-wider px-3.5 h-8 gap-1.5 shadow-md shadow-yellow-500/20 transition-all cursor-pointer"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Share Link</span>
          </Button>
        </div>
      </Card>

      {/* Animated Match Lifecycle Stepper */}
      <div className="relative p-3 sm:p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm overflow-hidden">
        {/* Background track line */}
        <div className="absolute top-1/2 left-6 right-6 sm:left-12 sm:right-12 -translate-y-1/2 h-1 bg-white/10 rounded-full z-0 hidden min-[400px]:block">
          <div
            className="h-full bg-gradient-to-r from-[#00E676] via-[#FFFF00] to-[#FF168B] rounded-full transition-all duration-700 shadow-[0_0_12px_rgba(255,255,0,0.6)]"
            style={{ width: `${Math.min(100, Math.max(0, ((currentStage - 1) / 3) * 100))}%` }}
          />
        </div>

        <div className="grid grid-cols-4 gap-1.5 sm:gap-3 relative z-10">
          {[
            {
              step: 1,
              shortLabel: match.status === 'waiting' ? 'Queue' : 'Matched',
              fullLabel: match.status === 'waiting' ? 'Matchmaking' : 'Match Found',
            },
            { step: 2, shortLabel: 'Setup', fullLabel: 'Room Setup' },
            { step: 3, shortLabel: 'Match', fullLabel: 'In Progress' },
            { step: 4, shortLabel: 'Result', fullLabel: 'Result & Payout' },
          ].map((s) => {
            const isDone = currentStage > s.step;
            const isCurrent = currentStage === s.step;
            return (
              <div
                key={s.step}
                className={`py-2 px-1 rounded-xl transition-all flex flex-col items-center justify-center text-center ${
                  isCurrent
                    ? 'bg-[#FFFF00] text-[#08088F] font-black shadow-lg shadow-yellow-500/30 scale-105'
                    : isDone
                    ? 'bg-[#00E676]/20 text-[#00E676] font-bold border border-[#00E676]/40'
                    : 'bg-[#07073B]/80 text-white/40 font-medium'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className="text-[10px] sm:text-xs uppercase tracking-wider block font-bold truncate">
                    {isDone ? '✓ ' : `${s.step}. `}
                    <span className="hidden min-[480px]:inline">{s.fullLabel}</span>
                    <span className="min-[480px]:hidden">{s.shortLabel}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Premium Head-to-Head Animated VS Section */}
      <div className="relative">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-stretch">
          {/* You (Player A) */}
          <Card
            className={`rounded-[24px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border p-4 sm:p-5 text-white flex items-center justify-between shadow-xl relative overflow-hidden transition-all duration-300 ${
              isMyReady || match.status === 'waiting' ? 'border-[#00E676]/60 shadow-[#00E676]/15' : 'border-white/15'
            }`}
          >
            <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
              <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-[#00E676]/15 border border-[#00E676]/35 flex items-center justify-center text-[#00E676] font-black text-sm shrink-0 shadow-sm shadow-[#00E676]/20">
                P{match.userPosition || 1}
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">
                  {match.status === 'waiting' ? 'Host (You)' : 'You'}
                </span>
                <span className="text-sm sm:text-base md:text-lg font-black font-display uppercase tracking-wider text-[#FFFF00] block truncate max-w-[130px] sm:max-w-[200px] md:max-w-none">
                  {myPlayer?.profile?.display_name || userDisplayName || 'Player'}
                </span>
                {myPlayer?.profile?.efootball_id ? (
                  <span className="text-xs font-mono text-[#00E676] block truncate max-w-[130px] sm:max-w-[200px] md:max-w-none">
                    {myPlayer.profile.efootball_id}
                  </span>
                ) : (
                  <span className="text-[11px] text-white/60 block">eFootball Ready</span>
                )}
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 border transition-all ${
                match.status === 'waiting'
                  ? 'bg-[#00E676]/20 text-[#00E676] border-[#00E676]/40 shadow-sm'
                  : isMyReady
                  ? 'bg-[#00E676] text-[#08088F] border-[#00E676] shadow-sm shadow-[#00E676]/30'
                  : 'bg-white/10 text-white/70 border-white/20 animate-pulse'
              }`}
            >
              {match.status === 'waiting' ? 'In Room • Host ✓' : isMyReady ? 'Ready ✓' : 'Not Ready'}
            </span>
          </Card>

          {/* Mobile-Only VS Battle Divider between Card 1 and Card 2 */}
          {match.status === 'waiting' ? (
            <div className="flex md:hidden items-center justify-center gap-3 my-2 py-1 relative z-20">
              <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-[#FFFF00]/40 to-[#FFFF00]" />
              <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-[#080838] border-2 border-[#FFFF00] shadow-[0_0_20px_rgba(255,255,0,0.4)]">
                <div className="w-4 h-4 shrink-0">
                  <svg
                    className="w-full h-full animate-spin text-[#FFFF00]"
                    viewBox="0 0 38 38"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle cx="19" cy="4" r="2.5" fill="currentColor" fillOpacity="1" />
                    <circle cx="26.5" cy="6" r="2.5" fill="currentColor" fillOpacity="0.9" />
                    <circle cx="32" cy="11.5" r="2.5" fill="currentColor" fillOpacity="0.8" />
                    <circle cx="34" cy="19" r="2.5" fill="currentColor" fillOpacity="0.7" />
                    <circle cx="32" cy="26.5" r="2.5" fill="currentColor" fillOpacity="0.6" />
                    <circle cx="26.5" cy="32" r="2.5" fill="currentColor" fillOpacity="0.5" />
                    <circle cx="19" cy="34" r="2.5" fill="currentColor" fillOpacity="0.4" />
                    <circle cx="11.5" cy="32" r="2.5" fill="currentColor" fillOpacity="0.3" />
                    <circle cx="6" cy="26.5" r="2.5" fill="currentColor" fillOpacity="0.2" />
                    <circle cx="4" cy="19" r="2.5" fill="currentColor" fillOpacity="0.15" />
                    <circle cx="6" cy="11.5" r="2.5" fill="currentColor" fillOpacity="0.1" />
                    <circle cx="11.5" cy="6" r="2.5" fill="currentColor" fillOpacity="0.08" />
                  </svg>
                </div>
                <span className="text-xs font-black uppercase text-[#FFFF00] tracking-wider">
                  Matchmaking
                </span>
                <span className="text-[10px] font-mono font-bold text-white/80">
                  {formatElapsed(elapsed)}
                </span>
              </div>
              <div className="h-[2px] flex-1 bg-gradient-to-r from-[#FFFF00] via-[#FFFF00]/40 to-transparent" />
            </div>
          ) : (
            <div className="flex md:hidden items-center justify-center gap-3 my-1 py-1 relative z-20">
              <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-[#FF168B]/40 to-[#FF168B]" />
              <div className="relative flex items-center justify-center shrink-0">
                <span className="absolute -inset-2 rounded-full bg-[#FF168B]/20 animate-ping opacity-60" />
                <span className="absolute -inset-1 rounded-full bg-[#FF168B]/30 animate-pulse" />
                <div className="relative h-11 w-11 rounded-2xl bg-[#080838] border-2 border-[#FF168B] flex items-center justify-center shadow-[0_0_20px_rgba(255,22,139,0.7)]">
                  <span className="font-display font-black text-lg italic text-[#FF168B] tracking-wider">VS</span>
                </div>
              </div>
              <div className="h-[2px] flex-1 bg-gradient-to-r from-[#FF168B] via-[#FF168B]/40 to-transparent" />
            </div>
          )}

          {/* Opponent (Player B / Searching Slot) */}
          {match.status === 'waiting' ? (
            <Card className="rounded-[24px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-dashed border-[#FF168B]/40 hover:border-[#FF168B]/70 p-4 sm:p-5 text-white flex items-center justify-between shadow-xl relative overflow-hidden transition-all duration-300">
              <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
                <div className="relative h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-[#FF168B]/15 border border-[#FF168B]/35 flex items-center justify-center text-[#FF168B] font-black text-sm shrink-0 shadow-sm shadow-pink-500/20">
                  <User className="h-5 w-5 text-[#FF168B] animate-pulse" />
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[#FF168B] animate-ping" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">Opponent Slot</span>
                  <span className="text-sm sm:text-base md:text-lg font-black font-display uppercase tracking-wider text-white block truncate">
                    Searching for Rival...
                  </span>
                  <span className="text-xs text-[#FF168B] block truncate font-medium">
                    Waiting to join room
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border bg-[#FF168B]/15 border-[#FF168B]/35 text-[#FF168B] animate-pulse">
                  Searching...
                </span>
                <Button
                  size="sm"
                  onClick={() => setShowShareModal(true)}
                  className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] text-[10px] font-black uppercase tracking-wider px-2.5 h-6 gap-1 cursor-pointer shadow-sm"
                >
                  <Share2 className="h-3 w-3" />
                  <span>Invite</span>
                </Button>
              </div>
            </Card>
          ) : (
            <Card
              className={`rounded-[24px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border p-4 sm:p-5 text-white flex items-center justify-between shadow-xl relative overflow-hidden transition-all duration-300 ${
                isOpponentReady ? 'border-[#00E676]/60 shadow-[#00E676]/15' : 'border-white/15'
              }`}
            >
              <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
                <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-[#FF168B]/15 border border-[#FF168B]/35 flex items-center justify-center text-[#FF168B] font-black text-sm shrink-0 shadow-sm shadow-pink-500/20">
                  P{match.userPosition === 1 ? 2 : 1}
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">Opponent</span>
                  <span className="text-sm sm:text-base md:text-lg font-black font-display uppercase tracking-wider text-[#FFFF00] block truncate max-w-[130px] sm:max-w-[200px] md:max-w-none">
                    {opponent?.profile?.display_name || 'Matched Player'}
                  </span>
                  {opponent?.profile?.efootball_id ? (
                    <span className="text-xs font-mono text-white/80 block truncate max-w-[130px] sm:max-w-[200px] md:max-w-none">
                      {opponent.profile.efootball_id}
                    </span>
                  ) : (
                    <span className="text-[11px] text-white/50 block">Waiting for kickoff</span>
                  )}
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 border transition-all ${
                  isOpponentReady
                    ? 'bg-[#00E676] text-[#08088F] border-[#00E676] shadow-sm shadow-[#00E676]/30'
                    : 'bg-white/10 text-white/70 border-white/20'
                }`}
              >
                {isOpponentReady ? 'Ready ✓' : 'Not Ready'}
              </span>
            </Card>
          )}
        </div>

        {/* Desktop-Only Centered Animated VS Element / Matchmaking Loader */}
        <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 items-center justify-center z-20 pointer-events-none">
          {match.status === 'waiting' ? (
            <div className="relative flex flex-col items-center justify-center">
              <span className="absolute -inset-3 rounded-full bg-[#1E1EF5]/25 animate-ping opacity-60" />
              <span className="absolute -inset-1.5 rounded-full bg-[#FFFF00]/20 animate-pulse" />
              <div className="relative h-14 w-14 rounded-2xl bg-[#080838] border-2 border-[#FFFF00] flex items-center justify-center shadow-[0_0_25px_rgba(255,255,0,0.5)]">
                <div className="w-7 h-7">
                  <svg
                    className="w-full h-full animate-spin text-[#FFFF00]"
                    viewBox="0 0 38 38"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle cx="19" cy="4" r="2.5" fill="currentColor" fillOpacity="1" />
                    <circle cx="26.5" cy="6" r="2.5" fill="currentColor" fillOpacity="0.9" />
                    <circle cx="32" cy="11.5" r="2.5" fill="currentColor" fillOpacity="0.8" />
                    <circle cx="34" cy="19" r="2.5" fill="currentColor" fillOpacity="0.7" />
                    <circle cx="32" cy="26.5" r="2.5" fill="currentColor" fillOpacity="0.6" />
                    <circle cx="26.5" cy="32" r="2.5" fill="currentColor" fillOpacity="0.5" />
                    <circle cx="19" cy="34" r="2.5" fill="currentColor" fillOpacity="0.4" />
                    <circle cx="11.5" cy="32" r="2.5" fill="currentColor" fillOpacity="0.3" />
                    <circle cx="6" cy="26.5" r="2.5" fill="currentColor" fillOpacity="0.2" />
                    <circle cx="4" cy="19" r="2.5" fill="currentColor" fillOpacity="0.15" />
                    <circle cx="6" cy="11.5" r="2.5" fill="currentColor" fillOpacity="0.1" />
                    <circle cx="11.5" cy="6" r="2.5" fill="currentColor" fillOpacity="0.08" />
                  </svg>
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-1 bg-[#080838] px-2.5 py-0.5 rounded-full border border-[#FFFF00]/40 shadow-md">
                <span className="text-[10px] font-black uppercase text-[#FFFF00] tracking-wider">Searching</span>
                <span className="text-[10px] font-mono text-white/80">{formatElapsed(elapsed)}</span>
              </div>
            </div>
          ) : (
            <div className="relative flex items-center justify-center">
              <span className="absolute -inset-2 rounded-full bg-[#FF168B]/20 animate-ping opacity-60" />
              <span className="absolute -inset-1 rounded-full bg-[#FF168B]/30 animate-pulse" />
              <div className="relative h-12 w-12 rounded-2xl bg-[#080838] border-2 border-[#FF168B] flex items-center justify-center shadow-[0_0_25px_rgba(255,22,139,0.7)]">
                <span className="font-display font-black text-xl italic text-[#FF168B] tracking-wider">VS</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2.5 DEDICATED MATCHMAKING IN-ROOM PANEL (When status is waiting) */}
      {match.status === 'waiting' && (
        <Card className="rounded-[28px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border-2 border-[#1E1EF5]/50 p-6 sm:p-8 text-white shadow-2xl space-y-6 relative overflow-hidden">
          {/* Stadium ambient lighting */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#1E1EF5]/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#FF168B]/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Header: Circular 12-dot Rotating Loader Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/15 pb-5 relative z-10">
            <div className="flex items-center gap-3.5">
              <div className="relative shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9">
                <svg
                  className="w-full h-full animate-spin text-white"
                  viewBox="0 0 38 38"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="19" cy="4" r="2.5" fill="currentColor" fillOpacity="1" />
                  <circle cx="26.5" cy="6" r="2.5" fill="currentColor" fillOpacity="0.9" />
                  <circle cx="32" cy="11.5" r="2.5" fill="currentColor" fillOpacity="0.8" />
                  <circle cx="34" cy="19" r="2.5" fill="currentColor" fillOpacity="0.7" />
                  <circle cx="32" cy="26.5" r="2.5" fill="currentColor" fillOpacity="0.6" />
                  <circle cx="26.5" cy="32" r="2.5" fill="currentColor" fillOpacity="0.5" />
                  <circle cx="19" cy="34" r="2.5" fill="currentColor" fillOpacity="0.4" />
                  <circle cx="11.5" cy="32" r="2.5" fill="currentColor" fillOpacity="0.3" />
                  <circle cx="6" cy="26.5" r="2.5" fill="currentColor" fillOpacity="0.2" />
                  <circle cx="4" cy="19" r="2.5" fill="currentColor" fillOpacity="0.15" />
                  <circle cx="6" cy="11.5" r="2.5" fill="currentColor" fillOpacity="0.1" />
                  <circle cx="11.5" cy="6" r="2.5" fill="currentColor" fillOpacity="0.08" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg sm:text-xl font-black font-display uppercase tracking-wider text-white">
                    Matchmaking in Progress...
                  </h3>
                  <span className="text-[11px] font-mono font-bold text-[#FFFF00] bg-[#FFFF00]/15 border border-[#FFFF00]/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatElapsed(elapsed)}</span>
                  </span>
                </div>
                <p className="text-xs text-white/70 mt-0.5">
                  Searching for an active opponent in <span className="text-[#FFFF00] font-black">{match.card?.name || '1v1 Arena'}</span>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-[#00E676] flex items-center gap-1.5 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-[#00E676] animate-pulse" />
                <span>Room Live & Waiting</span>
              </span>
            </div>
          </div>

          {/* Match Code & Direct Sharing Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
            {/* Box 1: Match Code Box */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">
                  Room Match Code
                </span>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-xl sm:text-2xl font-black font-mono text-[#FFFF00] tracking-wider">
                    {match.match_code}
                  </span>
                  <Button
                    onClick={handleCopyMatchCode}
                    size="sm"
                    variant="outline"
                    className="rounded-xl border-white/20 text-white hover:bg-white/10 text-xs font-bold gap-1.5 cursor-pointer h-9 px-3"
                  >
                    {copiedMatchCode ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#00E676]" />
                        <span className="text-[#00E676]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-white/60">
                Share this code with any player so they can enter your room directly.
              </p>
            </div>

            {/* Box 2: Instant Match Invite Sharing */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">
                  Invite Rival to this Room
                </span>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {/* WhatsApp Share Button */}
                  <Button
                    onClick={handleWhatsAppShare}
                    className="flex-1 rounded-xl bg-[#25D366] hover:bg-[#20BD5A] text-[#080838] font-black text-xs uppercase tracking-wider h-10 gap-1.5 shadow-md shadow-emerald-600/30 cursor-pointer"
                  >
                    <Share2 className="h-4 w-4" />
                    <span>Share on WhatsApp</span>
                  </Button>

                  {/* Copy Link Button */}
                  <Button
                    onClick={handleCopyMatchLink}
                    variant="outline"
                    className="rounded-xl border-[#FFFF00]/40 text-[#FFFF00] hover:bg-[#FFFF00]/10 text-xs font-black uppercase tracking-wider h-10 px-3.5 gap-1.5 cursor-pointer"
                  >
                    {copiedMatchLink ? (
                      <>
                        <Check className="h-4 w-4 text-[#00E676]" />
                        <span className="text-[#00E676]">Link Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-white/60">
                Opponents who tap your link will be connected to this room instantly.
              </p>
            </div>
          </div>

          {/* Stakes & Escrow Guarantee */}
          <div className="p-4 rounded-2xl bg-[#080838]/80 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#00E676]/15 border border-[#00E676]/30 flex items-center justify-center text-[#00E676] shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-white">
                    Entry: ₹{match.card?.entry_amount || 0}
                  </span>
                  <span className="text-white/40">•</span>
                  <span className="text-xs font-black uppercase tracking-wider text-[#00E676]">
                    Winner Payout: ₹{match.card?.advertised_payout || 0}
                  </span>
                </div>
                <p className="text-[11px] text-white/60">
                  Funds are secured in platform escrow. Instant 100% refund if cancelled before kickoff.
                </p>
              </div>
            </div>
          </div>

          {/* Cancel Matchmaking Action */}
          {queueCancelError && (
            <p className="text-xs text-red-400 font-bold">{queueCancelError}</p>
          )}

          <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/10 flex-wrap relative z-10">
            <p className="text-xs text-white/50">
              Changed your mind or want to challenge in a different tier?
            </p>

            <Button
              onClick={handleCancelMatchmaking}
              disabled={isCancellingQueue}
              variant="outline"
              className="rounded-full border-red-500/50 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs font-black uppercase tracking-wider h-10 px-5 gap-1.5 cursor-pointer transition-all"
            >
              {isCancellingQueue ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  <span>Cancelling & Refunding...</span>
                </>
              ) : (
                <>
                  <X className="h-3.5 w-3.5" />
                  <span>Cancel Matchmaking (Instant Refund)</span>
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* 3. STEP A: Room Details Section */}
      {match.status === 'matched' && isPlayer1 && (
        <Card className="rounded-[28px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-white/15 p-6 sm:p-8 text-white shadow-xl space-y-5">
          <div>
            <h3 className="text-lg font-black font-display uppercase tracking-wider text-white flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-[#FFFF00]" />
              <span>Host Action: Create eFootball Room</span>
            </h3>
            <p className="text-xs text-white/70 mt-1">
              You are Player 1. Open the eFootball app, create a Friend Match room, and enter the details below.
            </p>
          </div>

          <form onSubmit={handleRoomSubmit} className="space-y-4 max-w-md">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-white/80 block">eFootball Room ID</label>
              <Input
                type="text"
                required
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                placeholder="e.g. 12345678"
                className="bg-white/5 border-white/20 text-white rounded-xl h-11 focus:border-[#FFFF00]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-white/80 block">
                Room Password (Optional)
              </label>
              <Input
                type="text"
                value={roomPasswordInput}
                onChange={(e) => setRoomPasswordInput(e.target.value)}
                placeholder="e.g. 1234"
                className="bg-white/5 border-white/20 text-white rounded-xl h-11 focus:border-[#FFFF00]"
              />
            </div>

            {roomFormError && (
              <p className="text-xs text-red-400 font-bold">{roomFormError}</p>
            )}

            <Button
              type="submit"
              disabled={isSubmittingRoom || !roomIdInput.trim()}
              className="rounded-full text-xs font-black uppercase tracking-wider bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] h-11 px-7 shadow-lg shadow-yellow-500/25 active:scale-95 transition-all cursor-pointer"
            >
              {isSubmittingRoom ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-[#08088F] mr-2" />
                  <span>Sharing Room...</span>
                </>
              ) : (
                <span>Share Room Credentials</span>
              )}
            </Button>
          </form>
        </Card>
      )}

      {match.status === 'matched' && !isPlayer1 && (
        <Card className="rounded-[28px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-white/15 p-6 sm:p-8 text-white shadow-xl text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-[#FF168B]/15 border border-[#FF168B]/35 flex items-center justify-center mx-auto text-[#FF168B] shadow-sm shadow-pink-500/20">
            <Clock className="h-6 w-6 animate-pulse text-[#FF168B]" />
          </div>
          <h3 className="text-lg font-black font-display uppercase tracking-wider text-white">
            Waiting for Host to Create Room
          </h3>
          <p className="text-xs text-white/70 max-w-md mx-auto leading-relaxed">
            Player 1 is currently launching eFootball and creating the game room. Credentials will appear here automatically.
          </p>
        </Card>
      )}

      {/* Shared Room Display (Available after submission) */}
      {match.room_id && (
        <Card className="rounded-[28px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-white/15 p-6 sm:p-7 text-white shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-[#FF168B] bg-[#FF168B]/15 border border-[#FF168B]/35 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm shadow-pink-500/20">
              <ShieldCheck className="h-4 w-4" />
              <span>eFootball Game Room Credentials</span>
            </span>
            <span className="text-[11px] text-white/60">Private to participants</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Room ID Box */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-white/50 uppercase block">Room ID</span>
                <span className="text-xl sm:text-2xl font-black font-mono text-[#FFFF00] tracking-wide">
                  {match.room_id}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyToClipboard(match.room_id!, 'id')}
                className="rounded-full text-xs font-bold text-white/80 hover:text-white hover:bg-white/10 gap-1.5 cursor-pointer"
              >
                {copiedRoomId ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#00E676]" />
                    <span className="text-[#00E676] font-bold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            </div>

            {/* Room Password Box */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-white/50 uppercase block">Room Password</span>
                <span className="text-xl sm:text-2xl font-black font-mono text-[#FFFF00] tracking-wide">
                  {match.room_password || 'None'}
                </span>
              </div>
              {match.room_password && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(match.room_password!, 'pass')}
                  className="rounded-full text-xs font-bold text-white/80 hover:text-white hover:bg-white/10 gap-1.5 cursor-pointer"
                >
                  {copiedPassword ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#00E676]" />
                      <span className="text-[#00E676] font-bold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Kickoff Alert Banner when both players ready */}
          {isMyReady && isOpponentReady && (match.status === 'room_submitted' || match.status === 'ready') && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-[#0A0A7A] to-emerald-950/80 border-2 border-[#00E676] shadow-lg shadow-[#00E676]/25 flex items-center justify-between gap-3 text-white animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-[#00E676] text-[#08088F] flex items-center justify-center font-black shrink-0 shadow-md">
                  <Play className="h-5 w-5 fill-current" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black uppercase text-[#00E676] tracking-wider">
                    Both Players Ready • Kick Off In eFootball Now!
                  </h4>
                  <p className="text-[11px] text-white/80">
                    Switch to the eFootball app and start the match. Return here to submit the final score.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Readiness Actions */}
          {(match.status === 'room_submitted' || match.status === 'ready') && (
            <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/15">
              <p className="text-xs text-white/70">
                Join the room in eFootball. When joined and ready to kickoff, click confirm below.
              </p>
              {!isMyReady ? (
                <Button
                  onClick={handleConfirmReady}
                  disabled={isReadying}
                  className="rounded-full text-xs font-black uppercase tracking-wider bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] h-11 px-8 shadow-lg shadow-yellow-500/30 active:scale-95 transition-all cursor-pointer shrink-0 animate-pulse hover:animate-none"
                >
                  {isReadying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-[#08088F] mr-2" />
                      <span>Confirming...</span>
                    </>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Check className="h-4 w-4" />
                      <span>I Am Ready to Play</span>
                    </span>
                  )}
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-xs font-black text-[#00E676] bg-[#00E676]/15 border border-[#00E676]/30 px-4 py-2 rounded-full shadow-sm shadow-[#00E676]/20">
                  <CheckCircle2 className="h-4 w-4 animate-bounce" />
                  <span>You are ready! Waiting for opponent...</span>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* 4. In Progress Controls */}
      {match.status === 'in_progress' && (
        <Card className="rounded-[28px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-[#00E676]/40 p-6 sm:p-8 text-white shadow-2xl text-center space-y-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-60 h-60 bg-[#00E676]/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-[#00E676]/20 animate-ping opacity-75" />
            <div className="relative h-14 w-14 rounded-full bg-[#00E676]/20 border-2 border-[#00E676] flex items-center justify-center text-[#00E676] shadow-[0_0_20px_rgba(0,230,118,0.5)]">
              <Play className="h-7 w-7 fill-current" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black font-display uppercase tracking-wider text-white">
              Match In Progress
            </h3>
            <p className="text-xs sm:text-sm text-white/70 max-w-md mx-auto mt-1 leading-relaxed">
              Complete your duel in the eFootball app. Once the final whistle blows, click below to submit your score.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-center gap-3">
            <Button
              onClick={() => setShowResultModal(true)}
              className="rounded-full text-xs font-black uppercase tracking-wider bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] h-12 px-9 shadow-lg shadow-yellow-500/30 active:scale-95 transition-all cursor-pointer font-display text-sm hover:scale-105"
            >
              <Trophy className="h-4 w-4 mr-2" />
              <span>Submit Match Score</span>
            </Button>
          </div>
        </Card>
      )}

      {/* 5. Result Submitted Review & Dual Screenshot Verification */}
      {match.status === 'result_submitted' && match.result && (
        <Card className="rounded-[28px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-[#FF168B]/35 p-6 sm:p-8 text-white shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/15 pb-4 gap-3">
            <div>
              <h3 className="text-lg font-black font-display uppercase tracking-wider text-white flex items-center gap-2">
                <Trophy className="h-5 w-5 text-[#FF168B]" />
                <span>Score Submitted for Confirmation</span>
              </h3>
              <p className="text-xs text-white/70 mt-0.5">
                Submitted by {match.result.submitted_by === currentUserId ? 'You' : opponent?.profile?.display_name || 'Opponent'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50 uppercase font-bold tracking-wider">Score:</span>
              <span className="text-2xl font-black font-display text-[#FFFF00] px-4 py-1.5 rounded-2xl bg-white/5 border border-white/15 shadow-inner">
                {match.result.player_one_score} - {match.result.player_two_score}
              </span>
            </div>
          </div>

          {/* Submitter's Screenshot Card */}
          <div className="p-4 rounded-2xl bg-[#07073B] border border-blue-400/25 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-[#FFFF00]" />
                <span>
                  {match.result.submitted_by === currentUserId ? 'Your' : `${opponent?.profile?.display_name || 'Opponent'}'s`} Match Submission
                </span>
              </span>
              <span className="text-[10px] font-bold text-[#00E676] bg-[#00E676]/15 border border-[#00E676]/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Submitted
              </span>
            </div>

            {match.result.screenshot_signed_url ? (
              <div className="flex flex-col sm:flex-row items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/10">
                <div
                  onClick={() => setActiveLightboxImg({ url: match.result!.screenshot_signed_url!, title: 'Submitted Match Screenshot Proof' })}
                  className="relative h-28 w-full sm:w-44 rounded-lg overflow-hidden border border-white/20 group cursor-pointer shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={match.result.screenshot_signed_url}
                    alt="Proof Preview"
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                    <span className="p-1.5 rounded-full bg-black/60 text-white flex items-center gap-1 text-[11px] font-bold px-2.5">
                      <Eye className="h-3.5 w-3.5" /> View Proof
                    </span>
                  </div>
                </div>
                <div className="text-xs text-white/70 space-y-1 text-center sm:text-left">
                  <p className="font-bold text-white">Match End Score Screenshot</p>
                  <p className="text-[11px] text-white/50 leading-relaxed">
                    Click the preview thumbnail to inspect the full resolution score and gamertags.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white/70">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center text-blue-300 shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-[#00E676]" />
                </div>
                <div>
                  <p className="font-bold text-white">Score Submitted Directly</p>
                  <p className="text-[11px] text-white/50">Screenshots are only required if scores mismatch or a dispute is registered.</p>
                </div>
              </div>
            )}
          </div>

          {/* Action Row for Confirmer / Opponent */}
          {match.result.submitted_by !== currentUserId ? (
            <div className="space-y-4 pt-2">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[#00E676]">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#00E676]" />
                  <span>Instant Settlement If Score Matches:</span>
                </div>
                <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                  If the score above is accurate, click <strong className="text-white">Confirm Score & Settle Payout</strong> to receive your prize instantly (no screenshot required). Final match screenshot is <strong className="text-[#FF168B]">only required if there is a score mismatch</strong>.
                </p>
              </div>

              {/* Opponent's Screenshot Upload Dropzone (Optional) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase text-white/90 flex items-center gap-1.5">
                    <Upload className="h-4 w-4 text-[#FFFF00]" />
                    <span>Attach Screenshot Proof</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/40 font-bold">
                      Optional
                    </span>
                  </label>
                  <span className="text-[11px] text-white/50">Only required if scores mismatch</span>
                </div>

                <input
                  type="file"
                  ref={opponentFileInputRef}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleOpponentFileChange}
                  className="hidden"
                />

                {!opponentScreenshotPreview ? (
                  <div
                    onClick={() => opponentFileInputRef.current?.click()}
                    className="border-2 border-dashed border-blue-400/30 hover:border-[#FFFF00]/60 rounded-2xl p-4 text-center cursor-pointer bg-white/5 hover:bg-white/10 transition-all flex flex-col items-center justify-center gap-1.5 group"
                  >
                    <div className="h-9 w-9 rounded-xl bg-blue-500/10 group-hover:bg-[#FFFF00]/10 border border-blue-400/30 group-hover:border-[#FFFF00]/40 flex items-center justify-center text-blue-300 group-hover:text-[#FFFF00] transition-colors">
                      <Upload className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-[#FFFF00] transition-colors">
                        Click to upload match screenshot (Optional)
                      </p>
                      <p className="text-[11px] text-white/50 mt-0.5">
                        Clear image of your final whistle score screen (PNG, JPG, WEBP)
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="relative rounded-2xl overflow-hidden border border-blue-400/30 bg-[#07073B] p-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={opponentScreenshotPreview}
                        alt="Opponent Proof Preview"
                        className="h-14 w-20 object-cover rounded-xl border border-white/20 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{opponentScreenshotFile?.name}</p>
                        <p className="text-[10px] text-[#00E676] font-semibold flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="h-3 w-3" /> Ready for confirmation
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearOpponentFile}
                      disabled={isConfirmingResult}
                      className="p-2 rounded-xl text-white/60 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                      title="Remove screenshot"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {confirmError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-400 font-bold">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{confirmError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <Button
                  onClick={() => setShowDisputeModal(true)}
                  variant="outline"
                  className="w-full sm:w-auto rounded-full text-xs font-black uppercase tracking-wider border-[#FF168B]/40 text-[#FF168B] hover:bg-[#FF168B]/10 h-11 px-5 cursor-pointer transition-all"
                >
                  <AlertTriangle className="h-4 w-4 mr-1.5" />
                  <span>Wrong Score / Dispute (Screenshot Required)</span>
                </Button>

                <Button
                  onClick={handleConfirmResult}
                  disabled={isConfirmingResult}
                  className="w-full sm:w-auto rounded-full text-xs font-black uppercase tracking-wider bg-[#00E676] hover:bg-[#00C853] text-[#08088F] h-11 px-7 shadow-lg shadow-[#00E676]/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isConfirmingResult ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" /> Confirming & Settling...
                    </span>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1.5" />
                      <span>Confirm Score & Settle Payout</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-white/70 text-center space-y-1">
              <p className="font-bold text-white">Waiting for {opponent?.profile?.display_name || 'Opponent'}</p>
              <p>
                Your opponent is reviewing your submitted score. When they confirm, the match completes and payout settles instantly. Final match screenshots are only required if scores mismatch.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* 6. Completed Card with Both Verified Screenshots */}
      {match.status === 'completed' && match.result && (
        <Card className="rounded-[28px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border-2 border-[#00E676]/50 p-6 sm:p-8 text-white shadow-2xl text-center space-y-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-[#00E676]/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-[#00E676]/20 animate-ping opacity-60" />
            <div className="relative h-14 w-14 rounded-full bg-[#00E676]/20 border-2 border-[#00E676] flex items-center justify-center text-[#00E676] shadow-[0_0_25px_rgba(0,230,118,0.5)]">
              <CheckCircle2 className="h-7 w-7" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black font-display uppercase tracking-wider text-white">
              Match Completed
            </h3>
            <p className="text-sm font-mono text-white/80 mt-1">
              Final Score: <span className="font-black text-[#FFFF00] text-base">{match.result.player_one_score} - {match.result.player_two_score}</span>
            </p>
          </div>

          {/* Settlement badge */}
          {match.settlement && (
            <div className="max-w-md mx-auto p-3.5 rounded-2xl bg-white/5 border border-white/15 text-xs space-y-1.5 text-left">
              <div className="flex items-center justify-between">
                <span className="text-white/60 uppercase text-[10px] font-bold">Settlement Ref</span>
                <span className="font-mono text-white/90 text-[11px]">{match.settlement.settlement_ref}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60 uppercase text-[10px] font-bold">Winner Payout</span>
                <span className="font-black text-sm text-[#00E676]">₹{match.settlement.amount_inr} ({match.settlement.mode === 'dry_run' ? 'Dry-Run Simulated' : 'Live'})</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60 uppercase text-[10px] font-bold">Settlement Status</span>
                <span className="font-black uppercase text-[#00E676]">{match.settlement.status}</span>
              </div>
            </div>
          )}

          {/* Match Verification & Proof Records */}
          <div className="max-w-lg mx-auto p-4 rounded-2xl bg-[#07073B] border border-blue-400/25 space-y-3 text-left">
            <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-[#00E676]" />
              <span>Match Verification & Proof Records</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Submitter Proof */}
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                <span className="text-[10px] font-bold uppercase text-white/70 block">
                  Submitter Record
                </span>
                {match.result.screenshot_signed_url ? (
                  <div
                    onClick={() => setActiveLightboxImg({ url: match.result!.screenshot_signed_url!, title: 'Submitter Match Proof' })}
                    className="relative h-24 rounded-lg overflow-hidden border border-white/20 group cursor-pointer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={match.result.screenshot_signed_url}
                      alt="Submitter Proof"
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                      <span className="p-1 rounded-full bg-black/60 text-white flex items-center gap-1 text-[10px] font-bold px-2">
                        <Eye className="h-3 w-3" /> View
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="h-24 rounded-lg bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center p-2">
                    <CheckCircle2 className="h-4 w-4 text-[#00E676] mb-1" />
                    <span className="text-[11px] text-white/80 font-bold">Score Confirmed</span>
                    <span className="text-[9px] text-white/40">Proof optional on score agreement</span>
                  </div>
                )}
              </div>

              {/* Opponent Proof */}
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                <span className="text-[10px] font-bold uppercase text-white/70 block">
                  Confirmer Record
                </span>
                {match.result.opponent_screenshot_signed_url ? (
                  <div
                    onClick={() => setActiveLightboxImg({ url: match.result!.opponent_screenshot_signed_url!, title: 'Confirmer Match Proof' })}
                    className="relative h-24 rounded-lg overflow-hidden border border-white/20 group cursor-pointer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={match.result.opponent_screenshot_signed_url}
                      alt="Confirmer Proof"
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                      <span className="p-1 rounded-full bg-black/60 text-white flex items-center gap-1 text-[10px] font-bold px-2">
                        <Eye className="h-3 w-3" /> View
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="h-24 rounded-lg bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center p-2">
                    <CheckCircle2 className="h-4 w-4 text-[#00E676] mb-1" />
                    <span className="text-[11px] text-white/80 font-bold">Score Confirmed</span>
                    <span className="text-[9px] text-white/40">Proof optional on score agreement</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-white/60 max-w-sm mx-auto">
            This match is archived in your 1v1 history. The arena queue is now open for new challenges.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
            <Button
              onClick={onRefreshRequested}
              className="rounded-full text-xs font-black uppercase tracking-wider bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] h-10 px-6 shadow-md shadow-yellow-500/20 active:scale-95 transition-all cursor-pointer"
            >
              Return to Challenge Hub
            </Button>
            <Button
              onClick={() => setShowCreditIssueModal(true)}
              variant="outline"
              className="rounded-full text-xs font-bold border-amber-500/40 text-amber-300 hover:bg-amber-500/15 h-10 px-5 cursor-pointer transition-all"
            >
              Report Credit Issue
            </Button>
          </div>
        </Card>
      )}

      {/* 7. Disputed Banner & Administrative Review Panel */}
      {match.status === 'disputed' && (
        <Card className="rounded-[28px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-red-500/40 p-6 sm:p-8 text-white shadow-2xl space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="flex items-center gap-3.5">
              <div className="h-12 w-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0 shadow-lg shadow-red-500/20">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40">
                    Dispute Active
                  </span>
                  <span className="text-xs font-mono text-white/50">
                    Case: #{match.dispute?.id ? match.dispute.id.slice(0, 8).toUpperCase() : match.match_code}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-black font-display uppercase tracking-wider text-white mt-1">
                  Dispute Registered Under Administrative Review
                </h3>
              </div>
            </div>

            {/* Pulsing Status Pill */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-bold w-fit">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400" />
              </span>
              <span>Under Review</span>
            </div>
          </div>

          {/* Explanation Notice */}
          <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
            A formal dispute has been registered for this fixture. Platform administrators are actively reviewing match game logs, room credentials, and submitted screenshot proof. Match prize funds remain secure in escrow until an authoritative decision is issued.
          </p>

          {/* Dispute Case Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-[#05053B] border border-white/10 space-y-2.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-white/50 block">Dispute Information</span>
              <div className="text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Reason:</span>
                  <span className="font-bold text-white text-right">{match.dispute?.reason || 'Wrong Score Marked by Opponent'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Submitted By:</span>
                  <span className="font-bold text-[#FFFF00]">
                    {match.dispute?.submitted_by === currentUserId ? 'You (Disputant)' : (match.opponent?.profile?.display_name || 'Opponent')}
                  </span>
                </div>
                {match.dispute?.created_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Filed At:</span>
                    <span className="font-mono text-white/70">
                      {new Date(match.dispute.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>

              {match.dispute?.description && (
                <div className="pt-2 border-t border-white/10">
                  <span className="text-[10px] font-semibold text-white/50 block">Statement:</span>
                  <p className="text-xs text-white/90 italic mt-0.5">&ldquo;{match.dispute.description}&rdquo;</p>
                </div>
              )}
            </div>

            {/* Evidence Preview & Notice */}
            <div className="p-4 rounded-2xl bg-[#05053B] border border-white/10 flex flex-col justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-white/50 block mb-2">Evidence & Proof</span>
                {(match.dispute?.evidence_signed_url || match.dispute?.evidence_url) ? (
                  <div className="flex items-center gap-3">
                    <div
                      onClick={() => setActiveLightboxImg({
                        url: match.dispute?.evidence_signed_url || match.dispute?.evidence_url || '',
                        title: 'Dispute Screenshot Proof'
                      })}
                      className="relative h-20 w-28 rounded-xl overflow-hidden border border-white/20 bg-black/40 cursor-pointer group shrink-0"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={match.dispute?.evidence_signed_url || match.dispute?.evidence_url || ''}
                        alt="Dispute Evidence"
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Eye className="h-5 w-5 text-white" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-white block">Screenshot Attached</span>
                      <p className="text-[11px] text-white/60">Tap thumbnail to inspect full resolution screenshot.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white/60">
                    <ImageIcon className="h-4 w-4 text-white/40 shrink-0" />
                    <span>No screenshot attached with dispute submission.</span>
                  </div>
                )}
              </div>

              {/* Status Note */}
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200/90 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                <span>Typical review time: 15–30 mins. Verified winner receives prize payout directly.</span>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-white/10">
            <Button
              onClick={() => {
                if (onBrowseLobby) {
                  onBrowseLobby();
                } else {
                  router.push('/dashboard/matches?mode=1v1');
                }
              }}
              className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] text-xs font-black uppercase tracking-wider h-10 px-6 cursor-pointer shadow-lg shadow-yellow-500/20 transition-all"
            >
              Return to Challenge Hub
            </Button>

            <Button
              onClick={() => {
                onRefreshRequested();
                router.refresh();
              }}
              variant="outline"
              className="rounded-full text-xs font-bold border-white/20 text-white hover:bg-white/10 h-10 px-5 gap-2 cursor-pointer transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh Status</span>
            </Button>

            <Button
              onClick={() => setShowCreditIssueModal(true)}
              variant="outline"
              className="rounded-full text-xs font-bold border-amber-500/40 text-amber-300 hover:bg-amber-500/15 h-10 px-5 cursor-pointer transition-all"
            >
              Contact Support
            </Button>
          </div>
        </Card>
      )}

      {/* Lightbox Modal for Proof Inspection */}
      {activeLightboxImg && (
        <div
          className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setActiveLightboxImg(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-[#0A0A70] border border-blue-400/40 rounded-3xl overflow-hidden shadow-2xl p-2 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-[#FFFF00]" />
                <span>{activeLightboxImg.title}</span>
              </span>
              <button
                onClick={() => setActiveLightboxImg(null)}
                className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-2 overflow-auto flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeLightboxImg.url}
                alt="Proof Full Resolution"
                className="max-h-[75vh] max-w-full rounded-xl object-contain shadow-md"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <OneVsOneResultModal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
        match={match}
        currentUserId={currentUserId}
        onSubmitted={() => {
          setShowResultModal(false);
          onRefreshRequested();
        }}
      />

      <OneVsOneDisputeModal
        isOpen={showDisputeModal}
        onClose={() => setShowDisputeModal(false)}
        matchId={match.id}
        onDisputed={() => {
          setShowDisputeModal(false);
          onRefreshRequested();
        }}
      />

      <OneVsOneCreditIssueModal
        isOpen={showCreditIssueModal}
        onClose={() => setShowCreditIssueModal(false)}
        match={match}
        currentUserId={currentUserId}
        onSubmitted={() => {
          setShowCreditIssueModal(false);
          onRefreshRequested();
        }}
      />

      {showShareModal && (
        <ShareMatchModal
          match={match}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
}
