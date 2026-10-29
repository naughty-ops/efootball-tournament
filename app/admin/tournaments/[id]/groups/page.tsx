'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Users,
  Grid,
  Zap,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  Trophy,
  Swords,
  Check,
  Unlock,
} from 'lucide-react';
import {
  getTournamentGroups,
  setupTournamentGroups,
  resetGroups,
  finalizeGroupStage,
  unlockGroupStage,
  swapGroupParticipants,
  moveGroupParticipant,
  saveCustomGroupAssignments,
  GroupStageOverview,
  GroupDetails,
} from '@/services/groupService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ConfirmModal } from '@/components/ui/modal';
import { EditGroupParticipantsModal } from '@/components/group/EditGroupParticipantsModal';
import { CustomGroupEditorModal } from '@/components/group/CustomGroupEditorModal';
import { EditPointsTableModal } from '@/components/group/EditPointsTableModal';
import { LeagueQualificationModal } from '@/components/group/LeagueQualificationModal';
import { cn } from '@/lib/utils';
import { UserCog, SlidersHorizontal, Edit3, ShieldCheck } from 'lucide-react';

export default function AdminGroupsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params);
  const router = useRouter();

  const [overview, setOverview] = useState<GroupStageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Group Setup Modal
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [groupCountInput, setGroupCountInput] = useState(2);
  const [qualifiersInput, setQualifiersInput] = useState(2);
  const [roundsPerPairInput, setRoundsPerPairInput] = useState(1); // 1 Round vs 2 Rounds

  // Edit Group Participants & Points Table Modal
  const [editingGroupDetails, setEditingGroupDetails] = useState<GroupDetails | null>(null);
  const [isCustomEditorOpen, setIsCustomEditorOpen] = useState(false);
  const [isEditPointsModalOpen, setIsEditPointsModalOpen] = useState(false);
  const [isQualificationModalOpen, setIsQualificationModalOpen] = useState(false);

  // Confirm Modals
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const handleSwapParticipants = async (pAId: string, gAId: string, pBId: string, gBId: string) => {
    setActionLoading(true);
    setError(null);
    try {
      await swapGroupParticipants(tournamentId, pAId, gAId, pBId, gBId);
      await fetchGroupData();
      setSuccessMsg('Group participants swapped successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Swap failed.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMoveParticipant = async (pId: string, srcGId: string, tgtGId: string) => {
    setActionLoading(true);
    setError(null);
    try {
      await moveGroupParticipant(tournamentId, pId, srcGId, tgtGId);
      await fetchGroupData();
      setSuccessMsg('Participant moved to target group successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Move failed.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveCustomAssignments = async (
    assignments: { groupId: string; participantIds: string[] }[],
    regenerateFixtures: boolean
  ) => {
    setActionLoading(true);
    setError(null);
    try {
      await saveCustomGroupAssignments(tournamentId, assignments, regenerateFixtures);
      await fetchGroupData();
      setSuccessMsg('Custom group assignments saved successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save group assignments.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const fetchGroupData = useCallback(async () => {
    try {
      const data = await getTournamentGroups(tournamentId);
      setOverview(data);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load group stage data.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const data = await getTournamentGroups(tournamentId);
        if (isMounted) {
          setOverview(data);
          setError(null);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load group stage data.';
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
  }, [tournamentId]);

  const handleSetupGroups = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await setupTournamentGroups(
        tournamentId,
        Number(groupCountInput),
        Number(qualifiersInput),
        Number(roundsPerPairInput)
      );
      await fetchGroupData();
      setIsSetupModalOpen(false);
      setSuccessMsg('Group Stage setup complete with fixtures generated!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Group setup failed.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalize = async () => {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await finalizeGroupStage(tournamentId);
      setIsFinalizeModalOpen(false);
      router.push(`/admin/tournaments/${tournamentId}/groups/transition`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Finalization failed.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlock = async () => {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await unlockGroupStage(tournamentId);
      await fetchGroupData();
      setIsUnlockModalOpen(false);
      setSuccessMsg('Group Stage unlocked for administrative edits.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unlock failed.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };



  const handleReset = async () => {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await resetGroups(tournamentId);
      await fetchGroupData();
      setIsResetModalOpen(false);
      setSuccessMsg('Group Stage reset successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reset failed.';
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
          <span className="text-xs font-semibold">Loading Group Stage Data...</span>
        </div>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-black text-[#0A0D14]">{error || 'Groups Not Found'}</h2>
        <Button asChild variant="ghost" size="sm" className="rounded-xl border-2 border-slate-300 bg-white text-[#0A0D14] hover:bg-slate-100 hover:border-slate-400 font-bold">
          <Link href="/admin/tournaments">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tournaments
          </Link>
        </Button>
      </div>
    );
  }

  if (!overview) return null;

  const {
    tournament,
    participants,
    groups,
    totalGroupMatches,
    completedGroupMatches,
    isGroupStageComplete,
    isFinalized,
    qualifiersPerGroup,
    roundsPerPair,
  } = overview;

  const isGroupKnockout = tournament.format === 'group_knockout';
  const groupStatus = isFinalized
    ? 'Finalized'
    : isGroupStageComplete
    ? 'Completed'
    : groups.length > 0
    ? 'In Progress'
    : 'Not Configured';

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="gap-2 text-[#334155] hover:text-[#0A0D14] -ml-2 mb-1 font-bold">
            <Link href={`/admin/tournaments/${tournament.id}`}>
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Tournament Details</span>
            </Link>
          </Button>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-black text-[#0A0D14] tracking-tight">
              {groups.length === 1 ? 'Single League Table Management' : 'Group Stage Management'}
            </h1>
            <Badge
              className={cn(
                'text-xs py-1 px-3 font-extrabold shadow-xs',
                isFinalized
                  ? 'bg-emerald-600 text-white border-0'
                  : isGroupStageComplete
                  ? 'bg-[#1D1DE0] text-white border-0'
                  : groups.length > 0
                  ? 'bg-[#00C853] text-[#072418] border-0'
                  : 'bg-slate-100 text-[#0A0D14] border border-slate-300'
              )}
            >
              {groupStatus}
            </Badge>

            {groups.length > 0 && (
              <Badge className="text-xs py-1 px-3 font-bold font-mono bg-white text-[#0A0D14] border border-slate-300 shadow-2xs">
                {roundsPerPair === 2 ? '2 Rounds Mode' : '1 Round Mode'}
              </Badge>
            )}
          </div>
          <p className="text-xs text-[#334155]">
            Tournament: <span className="font-extrabold text-[#0A0D14]">{tournament.name}</span>
          </p>
        </div>

        {/* Action Controls */}
        {isGroupKnockout && (
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                setActionLoading(true);
                try {
                  await fetchGroupData();
                  setSuccessMsg('Points table & standings recalculated and synced successfully!');
                } catch {
                  setError('Failed to sync standings.');
                } finally {
                  setActionLoading(false);
                }
              }}
              disabled={actionLoading}
              className="rounded-xl text-xs font-bold border-2 border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100 gap-1.5 shadow-xs cursor-pointer"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', actionLoading && 'animate-spin')} />
              <span>Recalculate Standings</span>
            </Button>

            {groups.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditPointsModalOpen(true)}
                  disabled={actionLoading}
                  className="rounded-xl text-xs font-bold gap-1.5 border-2 border-emerald-300 text-emerald-900 bg-emerald-50 hover:bg-emerald-100 shadow-xs cursor-pointer"
                >
                  <Edit3 className="h-3.5 w-3.5 text-emerald-700" />
                  <span>Edit Points Table</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsQualificationModalOpen(true)}
                  disabled={actionLoading}
                  className="rounded-xl text-xs font-bold gap-1.5 border-2 border-blue-300 text-blue-900 bg-blue-50 hover:bg-blue-100 shadow-xs cursor-pointer"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
                  <span>Qualification Admin Controls</span>
                </Button>
              </>
            )}

            {groups.length > 0 && !isFinalized && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setGroupCountInput(groups.length);
                    setQualifiersInput(qualifiersPerGroup);
                    setRoundsPerPairInput(roundsPerPair);
                    setIsSetupModalOpen(true);
                  }}
                  disabled={actionLoading}
                  className="rounded-xl text-xs font-bold gap-1.5 border-2 border-slate-300 text-[#0A0D14] bg-white hover:bg-slate-100 shadow-xs cursor-pointer"
                  title="Re-configure group count, qualifiers per group, or 1 vs 2 round mode"
                >
                  <Grid className="h-3.5 w-3.5" />
                  <span>Edit Group Setup</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCustomEditorOpen(true)}
                  disabled={actionLoading}
                  className="rounded-xl text-xs font-bold gap-1.5 border-2 border-slate-300 text-[#0A0D14] bg-white hover:bg-slate-100 shadow-xs cursor-pointer"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Custom Group Manager</span>
                </Button>
              </>
            )}

            {groups.length === 0 ? (
              <Button
                variant="ghost"
                onClick={() => setIsSetupModalOpen(true)}
                disabled={actionLoading || participants.length < 4}
                className="rounded-xl text-xs font-black gap-2 shadow-sm bg-[#00C853] hover:bg-[#00B048] text-[#072418] border-none cursor-pointer h-10 px-5 uppercase tracking-wider"
              >
                <Grid className="h-4 w-4 text-[#072418]" />
                <span>Create Groups & Fixtures</span>
              </Button>
            ) : (
              <>
                {!isFinalized ? (
                  <Button
                    variant="ghost"
                    onClick={() => setIsFinalizeModalOpen(true)}
                    disabled={actionLoading || !isGroupStageComplete}
                    className="rounded-xl text-xs font-black gap-2 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer h-10 px-5 uppercase tracking-wider"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Finalize Group Stage</span>
                  </Button>
                ) : (
                  <>
                    <Button
                      asChild
                      variant="ghost"
                      className="rounded-xl text-xs font-black gap-2 shadow-sm bg-[#1D1DE0] hover:bg-[#1515B0] text-white cursor-pointer h-10 px-5 uppercase tracking-wider"
                    >
                      <Link href={`/admin/tournaments/${tournamentId}/groups/transition`}>
                        <Zap className="h-4 w-4" />
                        <span>Prepare Knockout Stage</span>
                      </Link>
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsUnlockModalOpen(true)}
                      disabled={actionLoading}
                      className="rounded-xl text-xs font-bold gap-1.5 border-2 border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100 shadow-xs cursor-pointer"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      <span>Reopen Group Stage</span>
                    </Button>
                  </>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsResetModalOpen(true)}
                  disabled={actionLoading}
                  className="rounded-xl text-xs font-bold gap-1.5 border-2 border-rose-300 text-rose-900 bg-rose-50 hover:bg-rose-100 shadow-xs cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset Groups</span>
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Success & Error Banners */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="h-4.5 w-4.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Format Guard Notice */}
      {!isGroupKnockout && (
        <Card className="border-amber-500/30 bg-amber-500/10 p-6 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-extrabold text-sm">Group Stage System Notice</h3>
              <p className="text-xs mt-1">
                The Group Stage management system is available for tournaments configured with format: <strong>GROUP + KNOCKOUT</strong>. Current format: <strong className="uppercase">{tournament.format.replace('_', ' ')}</strong>.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Summary Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 bg-white border border-slate-200 shadow-xs flex items-center gap-3 rounded-2xl">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-[#1D1DE0] shrink-0 border border-slate-200">
            <Grid className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Total Groups</p>
            <p className="text-xl font-black text-[#0A0D14]">{groups.length} Groups</p>
          </div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-xs flex items-center gap-3 rounded-2xl">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-[#1D1DE0] shrink-0 border border-slate-200">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Participants</p>
            <p className="text-xl font-black text-[#0A0D14]">{participants.length} Players</p>
          </div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-xs flex items-center gap-3 rounded-2xl">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-[#1D1DE0] shrink-0 border border-slate-200">
            <Swords className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Fixture Progress</p>
            <p className="text-xl font-black text-[#0A0D14]">
              {completedGroupMatches} / {totalGroupMatches} Matches
            </p>
          </div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-xs flex items-center gap-3 rounded-2xl">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-[#1D1DE0] shrink-0 border border-slate-200">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Qualifiers Target</p>
            <p className="text-xl font-black text-[#0A0D14]">
              Top {qualifiersPerGroup} per group ({groups.length * qualifiersPerGroup} Total)
            </p>
          </div>
        </Card>
      </div>

      {/* Group Cards Grid / Empty State */}
      {groups.length === 0 ? (
        <Card className="border-2 border-dashed border-slate-300 bg-[#F8FAFC] p-12 text-center rounded-3xl shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white border-2 border-slate-200 text-[#1D1DE0] mb-4 shadow-xs">
            <Grid className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-black text-[#0A0D14]">Groups Not Configured Yet</h3>
          <p className="text-xs text-[#334155] font-medium max-w-md mx-auto mt-1 mb-6">
            {participants.length < 4
              ? 'At least 4 participants are required to create groups. Add players first in Participant Management.'
              : `Ready to divide ${participants.length} players into balanced groups with 1-Round or 2-Round fixtures.`}
          </p>

          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsSetupModalOpen(true)}
            disabled={actionLoading || participants.length < 4 || !isGroupKnockout}
            className="font-black gap-2 rounded-xl h-11 px-6 bg-[#00C853] hover:bg-[#00B048] text-[#072418] cursor-pointer shadow-sm text-xs uppercase tracking-wider disabled:opacity-50"
          >
            <Grid className="h-4 w-4 text-[#072418]" />
            <span>Setup Groups & Fixtures</span>
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 className="text-xl font-black text-[#0A0D14]">Groups Overview</h2>
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-bold text-[#1D1DE0] hover:text-[#1515B0] gap-1">
              <Link href={`/admin/tournaments/${tournamentId}/groups/matches`}>
                <Swords className="h-3.5 w-3.5" />
                <span>View Full Group Schedule</span>
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {groups.map((gDet) => (
              <Card key={gDet.group.id} className="border border-slate-200 bg-white shadow-xs rounded-2xl overflow-hidden flex flex-col justify-between">
                <CardHeader className="bg-[#F8FAFC] border-b border-slate-200 pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-black text-[#0A0D14] flex items-center gap-2">
                      <span>{gDet.group.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingGroupDetails(gDet)}
                        disabled={isFinalized || actionLoading}
                        className="h-7 text-xs font-bold gap-1.5 rounded-lg border-2 border-slate-300 bg-white text-[#0A0D14] hover:bg-slate-100 shadow-xs cursor-pointer px-2.5"
                      >
                        <UserCog className="h-3 w-3 text-[#1D1DE0]" />
                        <span>Edit Players</span>
                      </Button>
                    </CardTitle>
                    <Badge className={cn('text-xs font-bold font-mono', gDet.isComplete ? 'bg-[#00C853] text-[#072418]' : 'bg-slate-100 text-[#0A0D14] border border-slate-300')}>
                      {gDet.completedMatchesCount} / {gDet.totalMatchesCount} Fixtures
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-[#334155] font-medium">
                    {gDet.participants.length} Players • Top {qualifiersPerGroup} qualify
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  {/* Standings Preview Table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs font-sans">
                      <thead className="bg-[#F1F5F9] text-[#0A0D14] font-black border-b border-slate-200 text-xs">
                        <tr>
                          <th className="p-2.5 w-8 text-center text-[#0A0D14] font-black">#</th>
                          <th className="p-2.5 text-[#0A0D14] font-black">Player</th>
                          <th className="p-2.5 text-center text-[#0A0D14] font-black">P</th>
                          <th className="p-2.5 text-center text-[#0A0D14] font-black">GD</th>
                          <th className="p-2.5 text-right font-black text-[#0A0D14]">Pts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {gDet.standings.map((row) => (
                          <tr
                            key={row.participant.id}
                            className={
                              row.isQualified
                                ? 'bg-emerald-50 font-bold text-emerald-950 border-l-4 border-l-emerald-500'
                                : 'hover:bg-slate-50 text-[#0A0D14]'
                            }
                          >
                            <td className="p-2.5 text-center font-bold text-slate-500">{row.position}</td>
                            <td className="p-2.5">
                              <span className="font-bold text-[#0A0D14]">{row.participant.username}</span>
                              {row.isQualified && (
                                <Check className="h-3 w-3 text-emerald-600 inline ml-1.5" />
                              )}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-600">{row.played}</td>
                            <td className="p-2.5 text-center font-mono text-slate-600">
                              {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                            </td>
                            <td className="p-2.5 text-right font-mono font-extrabold text-[#1D1DE0]">
                              {row.points}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer Action */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span className="text-xs text-[#334155] font-medium">
                      {gDet.isComplete ? 'All fixtures finished' : 'In Progress'}
                    </span>
                    <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-bold text-[#1D1DE0] hover:text-[#1515B0] gap-1 cursor-pointer">
                      <Link href={`/admin/tournaments/${tournamentId}/groups/${gDet.group.id}`}>
                        <span>View Full Standings & Matches</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Group Setup Modal */}
      {isSetupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setIsSetupModalOpen(false)} />
          <Card className="relative w-full max-w-md bg-white border border-slate-200 shadow-2xl z-10 p-6 space-y-5 rounded-3xl animate-in zoom-in-95 duration-200 text-[#0A0D14]">
            <CardHeader className="p-0 pb-2">
              <CardTitle className="text-xl font-black text-[#0A0D14] uppercase tracking-tight">World Cup Group Stage Setup</CardTitle>
              <CardDescription className="text-xs text-[#334155] font-medium">
                Configure group count, rounds per pair, and qualification spots for {participants.length} players.
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleSetupGroups} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[#0A0D14] block mb-1">
                  Number of Groups
                </label>
                <Input
                  type="number"
                  min={2}
                  max={Math.floor(participants.length / 2)}
                  value={groupCountInput}
                  onChange={(e) => setGroupCountInput(Number(e.target.value))}
                  className="border-2 border-slate-300 text-[#0A0D14] font-bold h-10 rounded-xl"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#0A0D14] block mb-1">
                  Matches Per Pair (Rounds)
                </label>
                <select
                  value={roundsPerPairInput}
                  onChange={(e) => setRoundsPerPairInput(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl border-2 border-slate-300 bg-white text-xs font-bold text-[#0A0D14]"
                >
                  <option value={1}>1 Round (Single Round-Robin)</option>
                  <option value={2}>2 Rounds (Double Round-Robin / Two Legs)</option>
                  <option value={3}>3 Rounds</option>
                  <option value={4}>4 Rounds</option>
                </select>
                <p className="text-[11px] text-[#334155] mt-1 font-medium">
                  {roundsPerPairInput === 1
                    ? 'Each pair plays 1 match.'
                    : `Each pair plays ${roundsPerPairInput} matches. All results contribute to the group standings.`}
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0A0D14] block mb-1">
                  Qualifiers Per Group
                </label>
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={qualifiersInput}
                  onChange={(e) => setQualifiersInput(Number(e.target.value))}
                  className="border-2 border-slate-300 text-[#0A0D14] font-bold h-10 rounded-xl"
                  required
                />
                <p className="text-[11px] text-[#334155] mt-1 font-medium">
                  Top {qualifiersInput} players per group will qualify for the Knockout Stage ({groupCountInput * qualifiersInput} total qualifiers).
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSetupModalOpen(false)}
                  className="rounded-xl text-xs font-black h-10 px-5 border-2 border-slate-300 bg-white text-[#0A0D14] hover:bg-slate-100 hover:border-slate-400 cursor-pointer shadow-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  disabled={actionLoading}
                  className="rounded-xl font-black text-xs h-10 px-6 bg-[#00C853] hover:bg-[#00B048] text-[#072418] gap-2 shadow-sm cursor-pointer uppercase tracking-wider disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin text-[#072418]" /> : <Grid className="h-4 w-4 text-[#072418]" />}
                  <span>Generate Groups & Fixtures</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Finalize Group Stage Modal */}
      <ConfirmModal
        isOpen={isFinalizeModalOpen}
        onClose={() => setIsFinalizeModalOpen(false)}
        onConfirm={handleFinalize}
        title="Finalize Group Stage"
        description={`This will finalize group stage standings and lock top ${qualifiersPerGroup} qualified participants from each group for Knockout Stage preparation.`}
        confirmText="Finalize & Lock Group Stage"
        variant="destructive"
        isLoading={actionLoading}
      />

      {/* Reopen / Unlock Modal */}
      <ConfirmModal
        isOpen={isUnlockModalOpen}
        onClose={() => setIsUnlockModalOpen(false)}
        onConfirm={handleUnlock}
        title="Reopen Group Stage"
        description="Reopening will unlock group stage matches for editing. Note: If a Knockout Bracket has already been generated, changing group results could affect bracket qualification."
        confirmText="Reopen Group Stage"
        variant="destructive"
        isLoading={actionLoading}
      />

      {/* Reset Confirmation Modal */}
      <ConfirmModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleReset}
        title="Reset Groups"
        description="Are you sure you want to reset the group stage? All unstarted group fixtures and group assignments will be removed."
        confirmText="Reset Groups"
        variant="destructive"
        isLoading={actionLoading}
      />
      {/* Edit Group Participants Modal */}
      {editingGroupDetails && overview && (
        <EditGroupParticipantsModal
          isOpen={Boolean(editingGroupDetails)}
          onClose={() => setEditingGroupDetails(null)}
          onSwap={handleSwapParticipants}
          onMove={handleMoveParticipant}
          currentGroup={editingGroupDetails}
          allGroups={overview.groups}
          isLoading={actionLoading}
        />
      )}

      {/* Custom Group Manager Modal */}
      {isCustomEditorOpen && overview && (
        <CustomGroupEditorModal
          isOpen={isCustomEditorOpen}
          onClose={() => setIsCustomEditorOpen(false)}
          onSave={handleSaveCustomAssignments}
          overview={overview}
          isLoading={actionLoading}
        />
      )}

      {/* Edit Points Table / Standings Override Modal */}
      {isEditPointsModalOpen && overview && (
        <EditPointsTableModal
          isOpen={isEditPointsModalOpen}
          onClose={() => setIsEditPointsModalOpen(false)}
          tournamentId={tournamentId}
          rulesText={tournament.rules_text}
          standings={overview.groups[0]?.standings || []}
          onSaved={fetchGroupData}
        />
      )}

      {/* League Qualification Admin Controls Modal */}
      {isQualificationModalOpen && overview && (
        <LeagueQualificationModal
          isOpen={isQualificationModalOpen}
          onClose={() => setIsQualificationModalOpen(false)}
          tournamentId={tournamentId}
          standings={overview.groups[0]?.standings || []}
          currentQualifiersCount={overview.qualifiersPerGroup}
          isLocked={overview.isFinalized}
          onSaved={fetchGroupData}
        />
      )}
    </div>
  );
}
