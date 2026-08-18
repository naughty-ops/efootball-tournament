'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Trophy, Medal, Users, Calendar, ChevronRight, Edit, Trash2, Share2, Check, Image as ImageIcon } from 'lucide-react';
import type { TournamentWithStats } from '@/services/tournamentService';
import { formatDate } from '@/lib/utils';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShareModal } from '@/components/share/ShareModal';
import { EditCoverImageModal } from '@/components/tournament/EditCoverImageModal';

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
      return 'Group + Knockout';
    default:
      return format;
  }
}

export function TournamentCard({ tournament: t, isAdmin = false, onDelete }: TournamentCardProps) {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  const [currentBanner, setCurrentBanner] = useState<string>(t.banner_image || '/images/banner1.jpg');
  const [copiedLink, setCopiedLink] = useState(false);

  const isCompleted = t.status === 'completed';
  const champion = t.championUser;
  const runnerUp = t.runnerUpUser;

  const detailUrl = isAdmin ? `/admin/tournaments/${t.id}` : `/tournaments/${t.id}`;

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
        className="relative overflow-hidden group transition-all duration-300 hover:shadow-2xl border border-white/20 hover:border-emerald-400/60 min-h-[340px] flex flex-col justify-between"
      >
        {/* Full Card Cover Background Image */}
        <div className="absolute inset-0 w-full h-full overflow-hidden bg-slate-950">
          <img
            src={currentBanner}
            alt={t.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-100"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/images/banner1.jpg';
            }}
          />
          {/* Vibrant eFootball Emerald Stadium Glow (No heavy black shading!) */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#062418]/95 via-[#0A3D29]/40 to-black/20" />
        </div>

        {/* Card Foreground Content */}
        <div className="relative z-10 p-5 flex flex-col justify-between h-full space-y-4">
          {/* Top Header: Status & Format & Share */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              {isCompleted ? (
                <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white font-black text-[10px] uppercase px-2.5 py-1 tracking-wider gap-1 border-0 shadow-md">
                  <CheckCircleBadge />
                  <span>COMPLETED</span>
                </Badge>
              ) : (
                <Badge
                  variant={t.status === 'ongoing' ? 'default' : t.status === 'registration' ? 'secondary' : 'outline'}
                  className="capitalize font-extrabold text-[10px] shadow-md px-2.5 py-1 bg-black/40 text-white backdrop-blur-md border-white/20"
                >
                  {t.status}
                </Badge>
              )}

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black text-white bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/20 uppercase tracking-wide shrink-0 shadow-xs">
                  {formatTournamentFormat(t.format)}
                </span>

                {/* Share Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsShareModalOpen(true)}
                  className="h-7 w-7 p-0 rounded-lg text-white bg-black/50 hover:bg-black/75 backdrop-blur-md border border-white/20"
                  title="Share Public Link & QR Code"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Tournament Title & Description */}
            <div className="space-y-1 pt-1">
              <CardTitle className="text-lg sm:text-xl font-black text-white group-hover:text-emerald-300 transition-colors line-clamp-2 drop-shadow-md">
                {t.name}
              </CardTitle>
              {t.description && !isCompleted && (
                <CardDescription className="text-xs text-slate-200/90 line-clamp-2 drop-shadow-xs font-medium">
                  {t.description}
                </CardDescription>
              )}
            </div>
          </div>

          {/* Center & Bottom: Winner Box, Metadata & Action Buttons */}
          <div className="space-y-3.5">
            {/* Championship Box if Completed */}
            {isCompleted ? (
              <div className="rounded-2xl bg-black/40 backdrop-blur-md border border-amber-400/40 p-3 space-y-2 shadow-lg">
                {/* Champion Row */}
                <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-amber-500/20 to-emerald-500/20 p-2 rounded-xl border border-amber-400/60">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-amber-400/30 border border-amber-300 flex items-center justify-center shrink-0">
                      <Trophy className="h-4 w-4 text-amber-300 drop-shadow-xs" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-[9px] font-extrabold text-amber-300 uppercase tracking-wider">
                        <span>🏆 WINNER</span>
                      </div>
                      <p className="font-extrabold text-xs text-white truncate">
                        {champion?.username || 'Champion TBD'}
                      </p>
                    </div>
                  </div>
                  <Badge className="text-[9px] font-extrabold bg-amber-400 text-amber-950 border-0 shrink-0">
                    1st
                  </Badge>
                </div>

                {/* Runner-Up Row */}
                {runnerUp && (
                  <div className="flex items-center justify-between gap-2 bg-slate-900/60 p-2 rounded-xl border border-white/10">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-lg bg-slate-700/50 border border-slate-500 flex items-center justify-center shrink-0">
                        <Medal className="h-4 w-4 text-slate-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                          <span>🥈 RUNNER-UP</span>
                        </div>
                        <p className="font-bold text-xs text-white/90 truncate">
                          {runnerUp.username}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[9px] font-semibold border-slate-500 text-slate-300 shrink-0">
                      2nd
                    </Badge>
                  </div>
                )}
              </div>
            ) : null}

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/15 font-bold text-white">
              <div className="flex items-center gap-1.5 truncate">
                <Users className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">
                  {t.participant_count}/{t.max_participants} Players
                </span>
              </div>
              <div className="flex items-center gap-1.5 justify-end truncate text-slate-200">
                <Calendar className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{formatDate(t.start_date)}</span>
              </div>
            </div>

            {/* Footer Action Bar */}
            <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
              {isAdmin ? (
                <>
                  <div className="flex items-center gap-1 flex-wrap">
                    {/* Separate Cover Image Button for Admins */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsCoverModalOpen(true)}
                      className="h-8 px-2 text-xs font-bold text-emerald-300 bg-black/50 border-emerald-400/40 hover:bg-emerald-950/60 hover:border-emerald-400 backdrop-blur-md"
                      title="Edit Cover Image"
                    >
                      <ImageIcon className="h-3.5 w-3.5 mr-1" />
                      <span>Cover</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOneTapCopy}
                      className="h-8 px-2 text-xs font-bold text-white bg-black/40 border-white/20 hover:bg-white/20 hover:border-white/40 backdrop-blur-md"
                      title="1-Tap Copy Public URL"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                          <span className="text-emerald-300 font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="h-3.5 w-3.5 mr-1 text-slate-300" />
                          <span>Share</span>
                        </>
                      )}
                    </Button>

                    <Button asChild variant="outline" size="sm" className="h-8 px-2 text-xs font-bold text-white bg-black/40 border-white/20 hover:bg-white/20">
                      <Link href={`/admin/tournaments/${t.id}/edit`}>
                        <Edit className="h-3.5 w-3.5 mr-1 text-slate-300" />
                        Edit
                      </Link>
                    </Button>

                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(t.id)}
                        className="h-8 px-2 text-xs text-rose-300 hover:text-rose-200 hover:bg-rose-900/40"
                        title="Delete Tournament"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Delete
                      </Button>
                    )}
                  </div>

                  <Button asChild size="sm" className="h-8 px-3 text-xs font-extrabold gap-1 rounded-xl bg-emerald-500 text-emerald-950 hover:bg-emerald-400 shadow-md">
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
                    className="h-8 px-2.5 text-xs font-bold text-white bg-black/40 border-white/20 hover:bg-white/20 backdrop-blur-md"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                        <span className="text-emerald-300 font-bold">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="h-3.5 w-3.5 mr-1 text-slate-300" />
                        <span>Share</span>
                      </>
                    )}
                  </Button>

                  <Button asChild size="sm" className="h-8 px-4 text-xs font-extrabold gap-1 rounded-xl bg-emerald-500 text-emerald-950 hover:bg-emerald-400 shadow-md">
                    <Link href={detailUrl}>
                      <span>{isCompleted ? 'Results' : 'View Tournament'}</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Separate Cover Image Modal for Admin */}
      {isAdmin && (
        <EditCoverImageModal
          isOpen={isCoverModalOpen}
          onClose={() => setIsCoverModalOpen(false)}
          tournamentId={t.id}
          tournamentName={t.name}
          currentBannerUrl={currentBanner}
          onSuccess={(newBannerUrl) => setCurrentBanner(newBannerUrl)}
        />
      )}

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
