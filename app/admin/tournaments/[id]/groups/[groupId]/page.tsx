'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Trophy,
  Swords,
  AlertCircle,
  Loader2,
  Check,
  Edit,
  PlusCircle,
} from 'lucide-react';
import {
  getTournamentGroups,
  swapGroupParticipants,
  moveGroupParticipant,
  GroupDetails,
  GroupStageOverview,
} from '@/services/groupService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EditGroupParticipantsModal } from '@/components/group/EditGroupParticipantsModal';
import { UserCog } from 'lucide-react';

export default function SingleGroupDetailsPage({
  params,
}: {
  params: Promise<{ id: string; groupId: string }>;
}) {
  const { id: tournamentId, groupId } = use(params);

  const [overview, setOverview] = useState<GroupStageOverview | null>(null);
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);
  const [qualifiersPerGroup, setQualifiersPerGroup] = useState<number>(2);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const fetchGroupData = async () => {
    try {
      const data = await getTournamentGroups(tournamentId);
      setOverview(data);
      const gDet = data.groups.find((g) => g.group.id === groupId);
      if (!gDet) {
        setError('Group not found in this tournament.');
      } else {
        setGroupDetails(gDet);
        setQualifiersPerGroup(data.qualifiersPerGroup);
        setError(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load group details.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const data = await getTournamentGroups(tournamentId);
        const gDet = data.groups.find((g) => g.group.id === groupId);
        if (isMounted) {
          if (!gDet) {
            setError('Group not found in this tournament.');
          } else {
            setGroupDetails(gDet);
            setQualifiersPerGroup(data.qualifiersPerGroup);
            setError(null);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load group details.';
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
  }, [tournamentId, groupId]);

  const handleSwap = async (pAId: string, gAId: string, pBId: string, gBId: string) => {
    setActionLoading(true);
    try {
      await swapGroupParticipants(tournamentId, pAId, gAId, pBId, gBId);
      await fetchGroupData();
    } finally {
      setActionLoading(false);
    }
  };

  const handleMove = async (pId: string, srcGId: string, tgtGId: string) => {
    setActionLoading(true);
    try {
      await moveGroupParticipant(tournamentId, pId, srcGId, tgtGId);
      await fetchGroupData();
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#0B3323]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs font-semibold">Loading Group Standings & Fixtures...</span>
        </div>
      </div>
    );
  }

  if (error || !groupDetails) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-[#0B3323]">{error || 'Group Not Found'}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/tournaments/${tournamentId}/groups`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Groups Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  const { group, standings, matches, completedMatchesCount, totalMatchesCount, isComplete } =
    groupDetails;

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Back Link & Header */}
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary -ml-2 mb-1">
          <Link href={`/admin/tournaments/${tournamentId}/groups`}>
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Groups Dashboard</span>
          </Link>
        </Button>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
              {group.name} Details & Standings
            </h1>
            <Badge variant={isComplete ? 'default' : 'outline'} className="text-xs py-1 px-3 font-bold font-mono">
              {completedMatchesCount} / {totalMatchesCount} Completed
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditModalOpen(true)}
              disabled={overview?.isFinalized || actionLoading}
              className="rounded-xl text-xs font-bold border-border gap-1.5"
            >
              <UserCog className="h-3.5 w-3.5" />
              <span>Edit Group Players</span>
            </Button>

            <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-bold border-border">
              <Link href={`/admin/tournaments/${tournamentId}/matches`}>
                <Swords className="h-3.5 w-3.5 mr-1" />
                <span>All Tournament Matches</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Standings Table Card */}
      <Card className="border-border bg-white shadow-md overflow-hidden space-y-4 p-6">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-xl font-extrabold text-[#0B3323] flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <span>Group Standings Table</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ranked by Points (Win=3, Draw=1, Loss=0) $\rightarrow$ GD $\rightarrow$ GF $\rightarrow$ Head-to-Head
            </p>
          </div>

          <Badge variant="efootball" className="text-xs font-bold">
            Top {qualifiersPerGroup} Qualify
          </Badge>
        </div>

        {/* Standings Table */}
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-[#F4F8F5] text-[#0B3323] font-extrabold border-b border-border text-xs">
              <tr>
                <th className="p-3.5 w-12 text-center">Pos</th>
                <th className="p-3.5">Participant</th>
                <th className="p-3.5 text-center">P</th>
                <th className="p-3.5 text-center">W</th>
                <th className="p-3.5 text-center">D</th>
                <th className="p-3.5 text-center">L</th>
                <th className="p-3.5 text-center">GF</th>
                <th className="p-3.5 text-center">GA</th>
                <th className="p-3.5 text-center font-bold">GD</th>
                <th className="p-3.5 text-right font-black text-sm">Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {standings.map((row) => (
                <tr
                  key={row.participant.id}
                  className={
                    row.isQualified
                      ? 'bg-emerald-50/80 font-semibold text-emerald-950 hover:bg-emerald-100/60'
                      : 'hover:bg-secondary/15'
                  }
                >
                  <td className="p-3.5 text-center font-bold">{row.position}</td>
                  <td className="p-3.5 font-bold text-[#0B3323]">
                    <div className="flex items-center gap-2">
                      {row.participant.seed_number && (
                        <Badge variant="efootball" className="font-mono text-[10px] px-1.5 py-0">
                          #{row.participant.seed_number}
                        </Badge>
                      )}
                      <span>{row.participant.username}</span>
                      {row.isQualified && (
                        <Badge variant="default" className="bg-emerald-600 text-white text-[10px] gap-1 px-1.5 py-0">
                          <Check className="h-3 w-3" />
                          Qualified
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3.5 text-center font-mono">{row.played}</td>
                  <td className="p-3.5 text-center font-mono">{row.wins}</td>
                  <td className="p-3.5 text-center font-mono">{row.draws}</td>
                  <td className="p-3.5 text-center font-mono">{row.losses}</td>
                  <td className="p-3.5 text-center font-mono">{row.goalsFor}</td>
                  <td className="p-3.5 text-center font-mono">{row.goalsAgainst}</td>
                  <td className="p-3.5 text-center font-mono font-extrabold">
                    {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                  </td>
                  <td className="p-3.5 text-right font-mono font-black text-sm text-primary">
                    {row.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Group Fixtures List */}
      <Card className="border-border bg-white shadow-md p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="text-xl font-extrabold text-[#0B3323] flex items-center gap-2">
            <Swords className="h-5 w-5 text-primary" />
            <span>Group Fixture Matches</span>
          </h3>
          <span className="text-xs text-muted-foreground font-mono font-semibold">
            Single Round-Robin ({matches.length} Matches)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matches.map((m) => {
            const playerA = m.participantAUser;
            const playerB = m.participantBUser;
            const winner = m.winnerUser;

            const isCompleted = m.status === 'completed' || m.status === 'walkover';
            const isDraw = isCompleted && m.status === 'completed' && m.score_a === m.score_b;

            return (
              <div
                key={m.id}
                className="p-4 rounded-2xl border border-border bg-[#F4F8F5] space-y-3 hover:border-primary/50 transition-colors text-xs"
              >
                <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground border-b border-border/60 pb-2">
                  <span>Match #{m.match_position}</span>
                  <div className="flex items-center gap-1.5">
                    {isDraw && (
                      <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-800 border-amber-300 font-bold">
                        Draw (1 pt each)
                      </Badge>
                    )}
                    <Badge variant={isCompleted ? 'default' : 'secondary'} className="text-[10px] capitalize font-bold">
                      {m.status}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1.5 font-bold text-[#0B3323]">
                  <div className={`flex items-center justify-between p-2 rounded-xl border ${winner?.id === playerA?.id ? 'bg-emerald-100/70 border-emerald-300' : 'bg-white border-border'}`}>
                    <div className="flex items-center gap-2 truncate">
                      {playerA?.seed_number && (
                        <Badge variant="efootball" className="font-mono text-[10px] px-1.5 py-0">#{playerA.seed_number}</Badge>
                      )}
                      <span className="truncate">{playerA?.username}</span>
                    </div>
                    <span className="font-mono text-sm font-black">{isCompleted ? m.score_a : '-'}</span>
                  </div>

                  <div className={`flex items-center justify-between p-2 rounded-xl border ${winner?.id === playerB?.id ? 'bg-emerald-100/70 border-emerald-300' : 'bg-white border-border'}`}>
                    <div className="flex items-center gap-2 truncate">
                      {playerB?.seed_number && (
                        <Badge variant="efootball" className="font-mono text-[10px] px-1.5 py-0">#{playerB.seed_number}</Badge>
                      )}
                      <span className="truncate">{playerB?.username}</span>
                    </div>
                    <span className="font-mono text-sm font-black">{isCompleted ? m.score_b : '-'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-1">
                  <Button asChild size="sm" variant="ghost" className="h-7 text-xs font-bold text-primary gap-1">
                    <Link href={`/admin/tournaments/${tournamentId}/matches/${m.id}`}>
                      {isCompleted ? (
                        <>
                          <Edit className="h-3.5 w-3.5" />
                          <span>Edit Result</span>
                        </>
                      ) : (
                        <>
                          <PlusCircle className="h-3.5 w-3.5" />
                          <span>Enter Result</span>
                        </>
                      )}
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Edit Group Participants Modal */}
      {isEditModalOpen && groupDetails && overview && (
        <EditGroupParticipantsModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSwap={handleSwap}
          onMove={handleMove}
          currentGroup={groupDetails}
          allGroups={overview.groups}
          isLoading={actionLoading}
        />
      )}
    </div>
  );
}
