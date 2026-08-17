'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Trophy, Medal, Users, Calendar, ChevronRight, Award, Sparkles, Edit, Trash2, Share2, Check, Copy } from 'lucide-react';
import type { TournamentWithStats } from '@/services/tournamentService';
import { formatDate } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShareModal } from '@/components/share/ShareModal';

interface TournamentCardProps {
  tournament: TournamentWithStats;
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
}

export function formatTournamentFormat(format: string): string {
  switch (format) {
    case 'knockout':
      return 'Knockout';
    case 'league':
      return 'League';
    case 'group_knockout':
    case 'single_league_knockout':
      return 'League + Knockout';
    default:
      return format;
  }
}

export function TournamentCard({ tournament: t, isAdmin = false, onDelete }: TournamentCardProps) {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const isCompleted = t.status === 'completed';
  const champion = t.championUser;
  const runnerUp = t.runnerUpUser;

  const detailUrl = isAdmin ? `/admin/tournaments/${t.id}` : `/tournaments/${t.id}`;
  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/t/${t.id}` : `/t/${t.id}`;

  const handleOneTapCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (typeof window !== 'undefined') {
        const fullUrl = `${window.location.origin}/t/${t.id}`;
        await navigator.clipboard.writeText(fullUrl);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy link', err);
    }
  };

  return (
    <>
      <Card
        className={`hover:border-primary/50 hover:shadow-lg transition-all duration-200 flex flex-col justify-between overflow-hidden group ${
          isCompleted
            ? 'bg-gradient-to-b from-white via-[#F4F8F5]/60 to-emerald-50/30 border-emerald-200'
            : 'bg-white border-border'
        }`}
      >
        <CardHeader className="space-y-2.5 p-4 sm:p-5">
          {/* Status & Format Badge Header */}
          <div className="flex items-center justify-between gap-2">
            {isCompleted ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-extrabold text-[10px] uppercase px-2.5 py-0.5 tracking-wider gap-1 border-0 shadow-xs">
                <CheckCircleBadge />
                <span>COMPLETED</span>
              </Badge>
            ) : (
              <Badge
                variant={t.status === 'ongoing' ? 'default' : t.status === 'registration' ? 'secondary' : 'outline'}
                className="capitalize font-bold text-[10px]"
              >
                {t.status}
              </Badge>
            )}

            <div className="flex items-center gap-1">
              <span className="text-[10px] font-extrabold text-primary bg-secondary px-2.5 py-1 rounded-lg border border-primary/10 uppercase tracking-wide shrink-0">
                {formatTournamentFormat(t.format)}
              </span>

              {/* 1-Tap Copy / Share Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsShareModalOpen(true)}
                className="h-7 w-7 p-0 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                title="Share Public Link & QR Code"
              >
                <Share2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Tournament Name */}
          <CardTitle className="text-base sm:text-lg font-bold text-[#0B3323] group-hover:text-primary transition-colors line-clamp-2">
            {t.name}
          </CardTitle>

          {t.description && !isCompleted && (
            <CardDescription className="text-xs line-clamp-2">{t.description}</CardDescription>
          )}
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-0 space-y-3 text-xs">
          {/* Championship Box if Completed */}
          {isCompleted ? (
            <div className="rounded-2xl bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-amber-500/10 border border-amber-300/60 p-3 space-y-2 shadow-xs">
              {/* Champion Row */}
              <div className="flex items-center justify-between gap-2 bg-white/90 p-2 rounded-xl border border-amber-300/80 shadow-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0">
                    <Trophy className="h-4 w-4 text-amber-600 drop-shadow-xs" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-[9px] font-extrabold text-amber-700 uppercase tracking-wider">
                      <span>🏆 WINNER</span>
                    </div>
                    <p className="font-extrabold text-xs text-[#0B3323] truncate">
                      {champion?.username || 'Champion TBD'}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[9px] font-bold border-amber-400 bg-amber-50 text-amber-800 shrink-0">
                  1st
                </Badge>
              </div>

              {/* Runner-Up Row */}
              {runnerUp && (
                <div className="flex items-center justify-between gap-2 bg-slate-50/90 p-2 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-slate-200/70 border border-slate-300 flex items-center justify-center shrink-0">
                      <Medal className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                        <span>🥈 RUNNER-UP</span>
                      </div>
                      <p className="font-bold text-xs text-[#0B3323] truncate">
                        {runnerUp.username}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[9px] font-semibold border-slate-300 bg-slate-100 text-slate-700 shrink-0">
                    2nd
                  </Badge>
                </div>
              )}
            </div>
          ) : null}

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 rounded-xl bg-[#F4F8F5] border border-border/40">
            <div className="flex items-center gap-1.5 text-muted-foreground truncate">
              <Users className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">
                {t.participant_count}/{t.max_participants} Players
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground justify-end truncate">
              <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">{formatDate(t.start_date)}</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-2 flex-wrap">
            {isAdmin ? (
              <>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOneTapCopy}
                    className="h-8 px-2.5 text-xs font-semibold text-[#0B3323] border-slate-200 hover:bg-emerald-50 hover:border-emerald-300"
                    title="1-Tap Copy Public URL"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                        <span className="text-emerald-700 font-bold">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                        <span>Share</span>
                      </>
                    )}
                  </Button>

                  <Button asChild variant="outline" size="sm" className="h-8 px-2.5 text-xs font-semibold text-[#0B3323]">
                    <Link href={`/admin/tournaments/${t.id}/edit`}>
                      <Edit className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                      Edit
                    </Link>
                  </Button>

                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(t.id)}
                      className="h-8 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      title="Delete Tournament"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Delete
                    </Button>
                  )}
                </div>

                <Button asChild size="sm" className="h-8 px-3 text-xs font-bold gap-1 rounded-xl">
                  <Link href={detailUrl}>
                    <span>Manage</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOneTapCopy}
                  className="h-8 px-2.5 text-xs font-semibold text-[#0B3323] border-slate-200 hover:bg-emerald-50"
                >
                  {copiedLink ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="h-3.5 w-3.5 mr-1 text-slate-500" />
                      <span>Share</span>
                    </>
                  )}
                </Button>

                <Button asChild variant="ghost" size="sm" className="h-8 text-xs text-primary font-bold gap-1 -mr-2 hover:bg-primary/10">
                  <Link href={detailUrl}>
                    <span>{isCompleted ? 'Results' : 'View'}</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Share & QR Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        tournamentId={t.id}
        tournamentName={t.name}
      />
    </>
  );
}

function CheckCircleBadge() {
  return (
    <svg className="h-3 w-3 fill-current text-white" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  );
}
