'use client';

import React from 'react';
import { Users } from 'lucide-react';
import type { PublicParticipant } from '@/services/publicTournamentService';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PublicParticipantsTabProps {
  participants: PublicParticipant[];
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="text-[10px] py-0 bg-emerald-100 text-emerald-700 border-emerald-200 font-bold">Active</Badge>;
    case 'eliminated':
      return <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">Eliminated</Badge>;
    case 'disqualified':
      return <Badge className="text-[10px] py-0 bg-red-100 text-red-700 border-red-200 font-bold">DQ</Badge>;
    default:
      return null;
  }
}

export default function PublicParticipantsTab({ participants }: PublicParticipantsTabProps) {
  if (participants.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary mb-3">
          <Users className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-bold text-[#0B3323]">No participants yet</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Participants will appear here once they join the tournament.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
          {participants.length} Participant{participants.length !== 1 ? 's' : ''}
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {participants.map((p, idx) => (
          <div
            key={p.id}
            className={cn(
              'flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 transition-colors',
              p.status === 'eliminated' && 'opacity-60',
              p.status === 'disqualified' && 'opacity-50 bg-red-50/50 border-red-100'
            )}
          >
            {/* Seed / rank number */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary font-black text-sm tabular-nums">
              {p.seed_number ?? (idx + 1)}
            </div>

            {/* Username */}
            <div className="flex-1 min-w-0">
              <p className={cn(
                'text-sm font-bold truncate',
                p.status === 'eliminated' ? 'text-muted-foreground line-through' : 'text-[#0B3323]',
                p.status === 'disqualified' && 'text-red-600/70 line-through',
              )}>
                {p.username}
              </p>
            </div>

            {/* Status badge */}
            {getStatusBadge(p.status)}
          </div>
        ))}
      </div>
    </div>
  );
}
