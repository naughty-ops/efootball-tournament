'use client';

import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, Flame, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MatchCountdownTimerProps {
  scheduledTime?: string | null;
  checkinDeadline?: string | null;
  completionDeadline?: string | null;
  status: string;
  isLive?: boolean;
  userStarted?: boolean;
  opponentStarted?: boolean;
  className?: string;
}

interface TimeRemaining {
  totalSeconds: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

function getTimeRemaining(targetIso?: string | null): TimeRemaining | null {
  if (!targetIso) return null;
  const targetTime = new Date(targetIso).getTime();
  if (isNaN(targetTime)) return null;

  const now = Date.now();
  const diffMs = targetTime - now;
  const totalSeconds = Math.floor(diffMs / 1000);

  if (totalSeconds <= 0) {
    return { totalSeconds: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { totalSeconds, hours, minutes, seconds, isExpired: false };
}

function pad(num: number): string {
  return num.toString().padStart(2, '0');
}

export default function MatchCountdownTimer({
  scheduledTime,
  checkinDeadline,
  completionDeadline,
  status,
  isLive,
  userStarted,
  opponentStarted,
  className,
}: MatchCountdownTimerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const scheduled = scheduledTime ? new Date(scheduledTime).getTime() : null;
  const isFuture = scheduled && scheduled > now;

  // 1. If match is completed, walkover, or cancelled, no active countdown needed
  if (['completed', 'walkover', 'cancelled', 'forfeited', 'COMPLETED'].includes(status)) {
    return null;
  }

  // 2. If match is disputed or pending admin review
  if (status === 'disputed' || status === 'DISPUTED') {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 text-xs text-rose-300 font-medium', className)}>
        <ShieldAlert className="w-3.5 h-3.5 animate-pulse text-rose-400 shrink-0" />
        <span>Conflicting Scores: Proof Required</span>
      </div>
    );
  }

  if (status === 'result_pending_admin' || status === 'RESULT_PENDING_ADMIN' || status === 'admin_review' || status === 'under_review') {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-xs text-amber-300 font-medium', className)}>
        <AlertTriangle className="w-3.5 h-3.5 animate-pulse text-amber-400 shrink-0" />
        <span>Result Pending Admin Review</span>
      </div>
    );
  }

  // 3. If match is in progress or awaiting results (both players started)
  if (isLive || ['in_progress', 'IN_PROGRESS', 'awaiting_result', 'AWAITING_RESULT', 'result_verification', 'RESULT_VERIFICATION', 'live'].includes(status)) {
    const compRemaining = getTimeRemaining(completionDeadline);
    if (!compRemaining) {
      return (
        <div className={cn('flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-xs text-emerald-400 font-medium', className)}>
          <Flame className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
          <span>Match in progress</span>
        </div>
      );
    }

    if (compRemaining.isExpired) {
      return (
        <div className={cn('flex items-center gap-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 text-xs text-rose-400 font-medium', className)}>
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>30m window expired</span>
        </div>
      );
    }

    return (
      <div className={cn('flex items-center gap-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 px-3 py-1 text-xs text-emerald-300 font-mono font-medium', className)}>
        <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>Time remaining: {compRemaining.hours > 0 ? `${compRemaining.hours}h ` : ''}{pad(compRemaining.minutes)}:{pad(compRemaining.seconds)}</span>
      </div>
    );
  }

  // 4. Waiting for other player to confirm start
  if (status === 'waiting_for_players' || status === 'WAITING_FOR_PLAYERS') {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg bg-yellow-950/40 border border-yellow-500/30 px-3 py-1 text-xs text-yellow-300 font-mono font-medium animate-pulse', className)}>
        <Clock className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
        <span>{userStarted ? 'Waiting for opponent confirmation...' : 'Opponent ready - Confirm start!'}</span>
      </div>
    );
  }

  // 4. If scheduled in future
  if (isFuture) {
    const startRemaining = getTimeRemaining(scheduledTime);
    if (startRemaining && !startRemaining.isExpired) {
      return (
        <div className={cn('flex items-center gap-2 rounded-lg bg-slate-900/80 border border-slate-700/60 px-3 py-1.5 text-xs text-slate-300 font-mono', className)}>
          <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>Starts in: {startRemaining.hours > 0 ? `${startRemaining.hours}h ` : ''}{pad(startRemaining.minutes)}:{pad(startRemaining.seconds)}</span>
        </div>
      );
    }
  }

  // 5. Window is open (scheduled time has arrived) -> Check-in / Grace Period countdown
  const checkinRemaining = getTimeRemaining(checkinDeadline);

  if (!checkinRemaining || checkinRemaining.isExpired) {
    return (
      <div className={cn('flex items-center gap-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 text-xs text-rose-400 font-medium', className)}>
        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
        <span>Grace period elapsed</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2 rounded-lg bg-yellow-950/40 border border-yellow-500/40 px-3 py-1 text-xs text-yellow-300 font-mono font-semibold animate-pulse', className)}>
      <Clock className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
      <span>Check-in closes in: {pad(checkinRemaining.minutes)}:{pad(checkinRemaining.seconds)}</span>
    </div>
  );
}
