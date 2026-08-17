'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Edit,
  Play,
  AlertCircle,
  Loader2,
  Users,
  GitBranch,
  Swords,
  Grid,
  Trophy,
  Zap,
  Trash2,
} from 'lucide-react';
import {
  getTournamentStageInfo,
  startTournament,
  completeTournament,
  deleteTournament,
} from '@/services/tournamentService';
import type { Participant, Tournament } from '@/types/database';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { ConfirmModal } from '@/components/ui/modal';
import { StageProgressIndicator } from '@/components/tournament/StageProgressIndicator';
import { WinnerCelebrationOverlay } from '@/components/tournament/WinnerCelebrationOverlay';
import { SeasonStatsCards } from '@/components/tournament/SeasonStatsCards';
import { TournamentSubStage } from '@/lib/lifecycle/lifecycleEngine';
import {
  getFixtureStatus,
  generateTournamentFixtures,
  regenerateTournamentFixtures,
  FixtureStatusSummary,
} from '@/services/fixtureService';

function formatTournamentFormat(format: string) {
  switch (format) {
    case 'group_knockout':
    case 'single_league_knockout':
      return 'League + Knockout';
    case 'knockout':
      return 'Knockout';
    case 'league':
      return 'League';
    default:
      return format.replace(/_/g, ' ');
  }
}

export default function TournamentDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [stageInfo, setStageInfo] = useState<{
    tournament: Tournament;
    subStage: TournamentSubStage;
    participants: Participant[];
    participantsCount: number;
    maxParticipants: number;
    groupMatchesTotal: number;
    groupMatchesCompleted: number;
    isGroupStageComplete: boolean;
    isGroupStageFinalized: boolean;
    knockoutMatchesTotal: number;
    knockoutMatchesCompleted: number;
    finalMatch: unknown;
    finalWinner: Participant | null;
    champion: Participant | null;
  } | null>(null);

  const [fixtureStatus, setFixtureStatus] = useState<FixtureStatusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Modals
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleDeleteTournament = async () => {
    setActionLoading(true);
    try {
      await deleteTournament(id);
      router.push('/admin/tournaments');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete tournament.';
      setError(msg);
      setIsDeleteModalOpen(false);
    } finally {
      setActionLoading(false);
    }
  };

  const loadStageData = async () => {
    try {
      const [data, fStatus] = await Promise.all([
        getTournamentStageInfo(id),
        getFixtureStatus(id),
      ]);
      setStageInfo(data);
      setFixtureStatus(fStatus);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load tournament details.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFixtures = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await generateTournamentFixtures(id);
      await loadStageData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fixture generation failed.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegenerateFixtures = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await regenerateTournamentFixtures(id);
      await loadStageData();
      setIsRegenerateModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fixture regeneration failed.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const [data, fStatus] = await Promise.all([
          getTournamentStageInfo(id),
          getFixtureStatus(id),
        ]);
        if (isMounted) {
          setStageInfo(data);
          setFixtureStatus(fStatus);
          setError(null);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load tournament details.';
          setError(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleStartTournament = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await startTournament(id);
      await loadStageData();
      setIsStartModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start tournament';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteTournament = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await completeTournament(id);
      await loadStageData();
      setIsCompleteModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to complete tournament';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#0B3323]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs font-semibold">Loading Tournament Details...</span>
        </div>
      </div>
    );
  }

  if (error || !stageInfo) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-[#0B3323]">{error || 'Tournament Not Found'}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/tournaments">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tournaments
          </Link>
        </Button>
      </div>
    );
  }

  const {
    tournament,
    subStage,
    participantsCount,
    maxParticipants,
    groupMatchesTotal,
    groupMatchesCompleted,
    isGroupStageComplete,
    isGroupStageFinalized,
    knockoutMatchesTotal,
    knockoutMatchesCompleted,
    finalWinner,
    champion,
  } = stageInfo;

  const isGroupKnockout = tournament.format === 'group_knockout';
  const isCompleted = tournament.status === 'completed';

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Hero Banner Image if provided */}
      {tournament.banner_image && (
        <div className="relative w-full aspect-[21/8] min-h-[180px] max-h-[340px] rounded-2xl sm:rounded-3xl overflow-hidden border border-border shadow-lg bg-slate-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={tournament.banner_image}
            alt={tournament.name}
            className="w-full h-full object-cover object-center"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/images/banner1.jpg';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B3323] via-[#0B3323]/50 to-transparent" />
          <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between">
            <Badge variant="efootball" className="bg-[#00C853] text-white font-extrabold text-xs shadow-md">
              Tournament Banner Image
            </Badge>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary -ml-2 mb-1">
            <Link href="/admin/tournaments">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Tournaments</span>
            </Link>
          </Button>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
              {tournament.name}
            </h1>
            <Badge variant={isCompleted ? 'default' : 'efootball'} className="capitalize text-xs py-1 px-3">
              {subStage.replace(/_/g, ' ')}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <Button asChild variant="outline" className="font-bold gap-2">
            <Link href={`/admin/tournaments/${tournament.id}/edit`}>
              <Edit className="h-4 w-4" />
              <span>Edit Details</span>
            </Link>
          </Button>

          <Button
            onClick={() => setIsDeleteModalOpen(true)}
            className="bg-rose-600 hover:bg-rose-700 text-white font-bold gap-2"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete Tournament</span>
          </Button>
        </div>
      </div>

      {/* Champion Banner if Completed */}
      {champion && (
        <Card className="border-emerald-500/40 bg-gradient-to-r from-emerald-900 via-[#0B3323] to-emerald-950 text-white shadow-xl p-6 relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[#9FE870]/10 blur-2xl pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-[#9FE870] text-[#0B3323] flex items-center justify-center shrink-0 shadow-lg">
                <Trophy className="h-8 w-8" />
              </div>
              <div>
                <Badge variant="efootball" className="bg-[#9FE870] text-[#0B3323] font-bold text-[10px] uppercase mb-1">
                  Official Champion
                </Badge>
                <h2 className="text-2xl font-black text-white tracking-tight">{champion.username}</h2>
                {champion.real_name && <p className="text-xs text-emerald-200">{champion.real_name}</p>}
              </div>
            </div>
            <Badge variant="outline" className="text-xs border-emerald-400/40 text-emerald-200 px-3 py-1 font-mono">
              Tournament Completed
            </Badge>
          </div>
        </Card>
      )}

      {/* Visual Lifecycle Progress Indicator */}
      <StageProgressIndicator format={tournament.format} subStage={subStage} />

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols: Details & Rules */}
        <div className="md:col-span-2 space-y-6">
          <Card className="bg-white border-border shadow-xs">
            <CardHeader>
              <CardTitle className="text-base font-extrabold text-[#0B3323]">Tournament Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-xs font-bold text-muted-foreground block mb-1">Description</span>
                <p className="text-xs text-[#0B3323] leading-relaxed">
                  {tournament.description || 'No description provided for this tournament.'}
                </p>
              </div>

              <div>
                <span className="text-xs font-bold text-muted-foreground block mb-1">Official Rules</span>
                <div className="p-3.5 rounded-xl bg-[#F4F8F5] border border-border text-xs text-[#0B3323] whitespace-pre-wrap leading-relaxed">
                  {tournament.rules_text || 'Standard competitive eFootball tournament rules apply.'}
                </div>
              </div>

              {/* Season Stats & Honor Roll Cards */}
              <SeasonStatsCards tournamentId={tournament.id} />
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Quick Stats & Stage-Specific Actions */}
        <div className="space-y-6">
          <Card className="bg-white border-border shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-extrabold text-[#0B3323]">Key Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">Format</span>
                <span className="font-bold text-[#0B3323]">{formatTournamentFormat(tournament.format)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">Participants</span>
                <span className="font-bold text-primary">
                  {participantsCount} / {maxParticipants}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">Fixture Status</span>
                <Badge
                  variant={fixtureStatus?.isGenerated ? 'efootball' : 'outline'}
                  className="font-bold text-[11px]"
                >
                  {fixtureStatus?.isGenerated
                    ? `Generated (${fixtureStatus.totalMatches} Matches)`
                    : 'Not Generated'}
                </Badge>
              </div>
              {isGroupKnockout && (
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">League Stage Progress</span>
                  <span className="font-bold text-[#0B3323]">
                    {groupMatchesCompleted} / {groupMatchesTotal} Matches
                  </span>
                </div>
              )}
              {knockoutMatchesTotal > 0 && (
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Knockout Progress</span>
                  <span className="font-bold text-[#0B3323]">
                    {knockoutMatchesCompleted} / {knockoutMatchesTotal} Matches
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">Start Date</span>
                <span className="font-semibold text-[#0B3323]">
                  {formatDate(tournament.start_date)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Stage-Specific Action Module */}
          <Card className="bg-[#F4F8F5] border-border shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-[#0B3323]">Stage Actions</CardTitle>
              <CardDescription className="text-xs">
                Actions available for <strong className="capitalize">{subStage.replace(/_/g, ' ')}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {/* Participant Management Action */}
              {!isCompleted && (
                <Button asChild variant="outline" className="w-full justify-start gap-2 text-xs h-9 border-primary text-primary hover:bg-primary hover:text-white font-bold transition-colors">
                  <Link href={`/admin/tournaments/${tournament.id}/participants`}>
                    <Users className="h-4 w-4" />
                    <span>Manage Participants ({participantsCount})</span>
                  </Link>
                </Button>
              )}

              {/* Automatic Fixtures Action */}
              {!isCompleted && tournament.format !== 'group_knockout' && (
                !fixtureStatus?.isGenerated ? (
                  <Button
                    onClick={handleGenerateFixtures}
                    disabled={actionLoading || participantsCount < 2}
                    className="w-full justify-center gap-2 text-xs h-9 font-bold bg-primary text-white shadow-sm"
                  >
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    <span>Auto Generate Fixtures</span>
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button asChild variant="outline" className="w-full justify-start gap-2 text-xs h-9 border-primary text-primary hover:bg-primary hover:text-white font-bold transition-colors">
                      <Link href={tournament.format === 'knockout' ? `/admin/tournaments/${tournament.id}/bracket` : `/admin/tournaments/${tournament.id}/matches`}>
                        {tournament.format === 'knockout' ? <GitBranch className="h-4 w-4" /> : <Swords className="h-4 w-4" />}
                        <span>View Fixtures & Matches</span>
                      </Link>
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => setIsRegenerateModalOpen(true)}
                      disabled={actionLoading || (fixtureStatus?.completedMatches || 0) > 0}
                      className="w-full justify-center gap-2 text-xs h-9 font-bold border-amber-600 text-amber-700 hover:bg-amber-50"
                    >
                      <Zap className="h-4 w-4" />
                      <span>Regenerate Fixtures</span>
                    </Button>
                  </div>
                )
              )}

              {/* Draft / Registration Mode Start Button */}
              {(subStage === 'draft' || subStage === 'registration') && (
                <Button
                  onClick={() => setIsStartModalOpen(true)}
                  disabled={participantsCount < 2}
                  className="w-full justify-center gap-2 text-xs h-9 font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>Start Tournament</span>
                </Button>
              )}

              {/* Group / League Stage Mode */}
              {(subStage === 'group_stage' || subStage === 'group_stage_finalized' || isGroupKnockout) && (
                <>
                  <Button asChild variant="outline" className="w-full justify-start gap-2 text-xs h-9 border-primary text-primary hover:bg-primary hover:text-white font-bold transition-colors">
                    <Link href={`/admin/tournaments/${tournament.id}/groups`}>
                      <Trophy className="h-4 w-4 text-amber-500" />
                      <span>View & Edit Points Table</span>
                    </Link>
                  </Button>

                  <Button asChild variant="outline" className="w-full justify-start gap-2 text-xs h-9 border-primary text-primary hover:bg-primary hover:text-white font-bold transition-colors">
                    <Link href={`/admin/tournaments/${tournament.id}/groups/matches`}>
                      <Swords className="h-4 w-4" />
                      <span>Manage League Fixtures & Scores</span>
                    </Link>
                  </Button>
                </>
              )}

              {/* Start Knockout Stage Button (When League Complete or Finalized) */}
              {isGroupKnockout && (isGroupStageComplete || isGroupStageFinalized || subStage === 'group_stage_finalized' || subStage === 'group_stage') && (
                <Button asChild className="w-full justify-center gap-2 text-xs h-10 font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md">
                  <Link href={`/admin/tournaments/${tournament.id}/groups/transition`}>
                    <Zap className="h-4 w-4" />
                    <span>Start Knockout Stage → Review Top 8 & Create Bracket</span>
                  </Link>
                </Button>
              )}

              {/* Knockout & Final Mode */}
              {(subStage === 'knockout' || subStage === 'final') && (
                <>
                  <Button asChild variant="outline" className="w-full justify-start gap-2 text-xs h-9 border-primary text-primary hover:bg-primary hover:text-white font-bold transition-colors">
                    <Link href={`/admin/tournaments/${tournament.id}/bracket`}>
                      <GitBranch className="h-4 w-4" />
                      <span>View Knockout Bracket</span>
                    </Link>
                  </Button>

                  <Button asChild variant="outline" className="w-full justify-start gap-2 text-xs h-9 border-primary text-primary hover:bg-primary hover:text-white font-bold transition-colors">
                    <Link href={`/admin/tournaments/${tournament.id}/matches`}>
                      <Swords className="h-4 w-4" />
                      <span>Manage Knockout Matches</span>
                    </Link>
                  </Button>

                  {subStage === 'final' && finalWinner && (
                    <Button
                      onClick={() => setIsCompleteModalOpen(true)}
                      className="w-full justify-center gap-2 text-xs h-9 font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm"
                    >
                      <Trophy className="h-4 w-4" />
                      <span>Complete Tournament & Crown Champion</span>
                    </Button>
                  )}
                </>
              )}

              {/* Completed Mode */}
              {subStage === 'completed' && (
                <div className="space-y-2">
                  <Button asChild variant="outline" className="w-full justify-start gap-2 text-xs h-9 border-border font-bold">
                    <Link href={`/admin/tournaments/${tournament.id}/bracket`}>
                      <GitBranch className="h-4 w-4" />
                      <span>View Final Bracket</span>
                    </Link>
                  </Button>
                  {isGroupKnockout && (
                    <Button asChild variant="outline" className="w-full justify-start gap-2 text-xs h-9 border-border font-bold">
                      <Link href={`/admin/tournaments/${tournament.id}/groups`}>
                        <Grid className="h-4 w-4" />
                        <span>View Final Standings</span>
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Start Tournament Modal */}
      <ConfirmModal
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        onConfirm={handleStartTournament}
        title="Start Tournament"
        description={`Are you sure you want to start "${tournament.name}"? This will lock participant registrations and officially begin the ${tournament.format.replace('_', ' + ')} competition.`}
        confirmText="Start Tournament"
        isLoading={actionLoading}
      />

      {/* Complete Tournament Modal */}
      <ConfirmModal
        isOpen={isCompleteModalOpen}
        onClose={() => setIsCompleteModalOpen(false)}
        onConfirm={handleCompleteTournament}
        title="Complete Tournament"
        description={`The Final match has been completed! Champion: ${finalWinner?.username}. Are you sure you want to mark this tournament as COMPLETED? Tournament data will become read-only.`}
        confirmText="Complete Tournament"
        isLoading={actionLoading}
      />

      {/* Regenerate Fixtures Confirmation Modal */}
      <ConfirmModal
        isOpen={isRegenerateModalOpen}
        onClose={() => setIsRegenerateModalOpen(false)}
        onConfirm={handleRegenerateFixtures}
        title="Regenerate Fixtures"
        description="Are you sure you want to regenerate all tournament fixtures? Existing unplayed matches will be removed and recalculated."
        confirmText="Regenerate Fixtures"
        variant="destructive"
        isLoading={actionLoading}
      />

      {/* Delete Tournament Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteTournament}
        title="Delete Tournament"
        description={`Are you sure you want to permanently delete "${tournament.name}"? All associated participants, rounds, and match records will be removed from Supabase. This action cannot be undone.`}
        confirmText="Yes, Delete Tournament"
        variant="destructive"
        isLoading={actionLoading}
      />
    </div>
  );
}
