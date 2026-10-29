'use client';

import React from 'react';
import { Users, Shield } from 'lucide-react';
import type { PublicParticipant } from '@/services/publicTournamentService';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PublicParticipantsTabProps {
  participants: PublicParticipant[];
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="text-[10px] py-0.5 px-2 bg-emerald-500 text-white border-0 font-bold rounded-full">Active</Badge>;
    case 'eliminated':
      return <Badge variant="outline" className="text-[10px] py-0.5 px-2 border-white/20 text-[#D9DCFF]/70 rounded-full">Eliminated</Badge>;
    case 'disqualified':
      return <Badge className="text-[10px] py-0.5 px-2 bg-[#FF168B] text-white border-0 font-bold rounded-full">DQ</Badge>;
    default:
      return null;
  }
}

export default function PublicParticipantsTab({ participants }: PublicParticipantsTabProps) {
  if (participants.length === 0) {
    return (
      <div className="rounded-[28px] border border-white/20 bg-[#1818D4] p-12 text-center text-white shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3434FF] text-[#FFFF00] mb-3 shadow-md">
          <Users className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-black font-display uppercase tracking-wide text-white">No participants yet</h3>
        <p className="text-xs text-[#D9DCFF]/80 mt-1 max-w-sm mx-auto font-medium">
          Registered participants will appear here once approved by the organizer.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-wider text-[#D9DCFF]">
          {participants.length} Registered Participant{participants.length !== 1 ? 's' : ''}
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {participants.map((p, idx) => {
          const hasRealName = Boolean(p.real_name && p.real_name.trim().length > 0);
          const playerName = hasRealName ? p.real_name!.trim() : p.username;
          const showSeparateId = hasRealName && p.real_name!.trim().toLowerCase() !== p.username.trim().toLowerCase();

          return (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border border-white/20 bg-[#1818D4] px-4 py-3.5 transition-all text-white shadow-sm',
                p.status === 'eliminated' && 'opacity-60 bg-[#1010C5]',
                p.status === 'disqualified' && 'opacity-50 bg-[#FF168B]/10 border-[#FF168B]/30'
              )}
            >
              {/* Seed / rank number */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFFF00] text-[#08088F] font-black text-sm tabular-nums shadow-sm">
                {p.seed_number ?? (idx + 1)}
              </div>

              {/* Player Name and eFootball ID */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-black truncate text-white tracking-wide',
                  p.status === 'eliminated' && 'text-[#D9DCFF]/60 line-through',
                  p.status === 'disqualified' && 'text-[#FF168B] line-through',
                )}>
                  {playerName}
                </p>

                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[10px] font-mono font-bold text-[#FFFF00] bg-[#0A0A7A] px-2 py-0.5 rounded-md border border-white/15 tracking-wider inline-flex items-center gap-1">
                    <span className="text-white/60 font-sans text-[9px] uppercase">ID:</span>
                    <span>{p.username}</span>
                  </span>
                </div>
              </div>

              {/* Status badge */}
              {getStatusBadge(p.status)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
