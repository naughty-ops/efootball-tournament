'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trophy,
  Swords,
  Users,
  ShieldCheck,
  Check,
  XCircle,
} from 'lucide-react';
import {
  getGroupKnockoutTransitionPreview,
  prepareKnockoutFromGroups,
  GroupKnockoutTransitionPreview,
} from '@/services/groupService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmModal } from '@/components/ui/modal';

export default function AdminGroupTransitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const router = useRouter();

  const [preview, setPreview] = useState<GroupKnockoutTransitionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const data = await getGroupKnockoutTransitionPreview(tournamentId);
        if (isMounted) {
          setPreview(data);
          setError(null);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load transition preview';
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

  const handleGenerateKnockout = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await prepareKnockoutFromGroups(tournamentId);
      setIsConfirmModalOpen(false);
      router.push(`/admin/tournaments/${tournamentId}/bracket`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Knockout generation failed';
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
          <span className="text-xs font-semibold">Loading Transition Preview...</span>
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-[#0B3323]">{error || 'Transition Preview Failed'}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/tournaments/${tournamentId}/groups`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Groups Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  const {
    tournament,
    isGroupStageFinalized,
    isGroupStageComplete,
    isKnockoutAlreadyGenerated,
    qualifiers,
    eliminated,
    proposedMatchups,
    bracketSize,
    totalQualifiers,
    validationError,
  } = preview;

  const canGenerate = isGroupStageFinalized && isGroupStageComplete && !isKnockoutAlreadyGenerated && !validationError;

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary -ml-2 mb-1">
            <Link href={`/admin/tournaments/${tournamentId}/groups`}>
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Groups Dashboard</span>
            </Link>
          </Button>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
              Group Stage → Knockout Transition
            </h1>
            <Badge variant={isGroupStageFinalized ? 'default' : 'outline'} className="text-xs py-1 px-3 font-bold">
              {isGroupStageFinalized ? 'Group Stage Finalized' : 'Unfinalized'}
            </Badge>
            {isKnockoutAlreadyGenerated && (
              <Badge variant="efootball" className="text-xs py-1 px-3 font-bold">
                Knockout Active
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Tournament: <span className="font-bold text-[#0B3323]">{tournament.name}</span>
          </p>
        </div>

        {/* Action Header Button */}
        <div className="flex items-center gap-2 shrink-0">
          {isKnockoutAlreadyGenerated ? (
            <Button asChild variant="default" size="sm" className="rounded-xl text-xs font-bold gap-2">
              <Link href={`/admin/tournaments/${tournamentId}/bracket`}>
                <Trophy className="h-4 w-4" />
                <span>View Knockout Bracket</span>
              </Link>
            </Button>
          ) : (
            <Button
              onClick={() => setIsConfirmModalOpen(true)}
              disabled={!canGenerate || actionLoading}
              className="rounded-xl text-xs font-bold gap-2 shadow-md bg-primary text-white"
            >
              <Zap className="h-4 w-4" />
              <span>Generate Knockout Stage</span>
            </Button>
          )}
        </div>
      </div>

      {/* Validation Banner (Unfinalized / Incomplete) */}
      {validationError && !isKnockoutAlreadyGenerated && (
        <Card className="border-amber-500/30 bg-amber-500/10 p-5 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-extrabold text-sm">Group Stage Not Ready for Knockout</h3>
              <p className="text-xs">{validationError}</p>
              <div className="pt-2">
                <Button asChild variant="outline" size="sm" className="h-8 text-xs font-bold border-amber-600/30">
                  <Link href={`/admin/tournaments/${tournamentId}/groups`}>
                    Go to Groups Dashboard
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Already Generated Banner */}
      {isKnockoutAlreadyGenerated && (
        <Card className="border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-extrabold text-sm">Knockout Stage Already Generated</h3>
              <p className="text-xs">
                The knockout bracket for this tournament is active. Group stage results are locked.
              </p>
              <div className="pt-2">
                <Button asChild variant="default" size="sm" className="h-8 text-xs font-bold gap-2">
                  <Link href={`/admin/tournaments/${tournamentId}/bracket`}>
                    <Trophy className="h-3.5 w-3.5" />
                    <span>View Knockout Bracket</span>
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Qualified Participants Section */}
      <Card className="border-border bg-white shadow-xs overflow-hidden">
        <CardHeader className="bg-[#F4F8F5] border-b border-border pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-extrabold text-[#0B3323] flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Qualified Participants ({totalQualifiers})</span>
            </CardTitle>
            <Badge variant="efootball" className="font-mono text-xs font-bold">
              {bracketSize}-Player Bracket
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Review top qualifiers ranked by final group standings and assigned seeding codes.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-secondary/40 text-[#0B3323] font-bold border-b border-border text-[11px]">
                <tr>
                  <th className="p-3 w-16 text-center">Seed</th>
                  <th className="p-3">Participant</th>
                  <th className="p-3">Group</th>
                  <th className="p-3 text-center">Position</th>
                  <th className="p-3 text-center">Pts</th>
                  <th className="p-3 text-center">GD</th>
                  <th className="p-3 text-center">GF</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-xs">
                {qualifiers.map((q) => (
                  <tr key={q.participant.id} className="bg-emerald-50/60 font-semibold text-emerald-950">
                    <td className="p-3 text-center">
                      <Badge variant="efootball" className="font-mono font-extrabold text-[10px] px-2">
                        {q.seedCode}
                      </Badge>
                    </td>
                    <td className="p-3 font-extrabold text-[#0B3323]">
                      {q.participant.username}
                      {q.participant.real_name && (
                        <span className="text-[11px] text-muted-foreground ml-1.5 font-normal">
                          ({q.participant.real_name})
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-bold">{q.groupName}</td>
                    <td className="p-3 text-center font-mono">{q.position === 1 ? '1st' : `${q.position}nd`}</td>
                    <td className="p-3 text-center font-mono font-extrabold text-primary">{q.points}</td>
                    <td className="p-3 text-center font-mono">
                      {q.goalDifference > 0 ? `+${q.goalDifference}` : q.goalDifference}
                    </td>
                    <td className="p-3 text-center font-mono">{q.goalsFor}</td>
                    <td className="p-3 text-right">
                      <Badge variant="default" className="bg-emerald-600 text-white text-[9px] font-bold gap-1">
                        <Check className="h-3 w-3" />
                        <span>QUALIFIED</span>
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Proposed Knockout Fixtures Preview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-xl font-extrabold text-[#0B3323] flex items-center gap-2">
            <Swords className="h-5 w-5 text-primary" />
            <span>Proposed Knockout Matchups</span>
          </h2>
          <span className="text-xs text-muted-foreground">
            Deterministic Cross-Group Pairing ($A1$ vs $B2$, $B1$ vs $A2$)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {proposedMatchups.map((m) => (
            <Card key={m.matchPosition} className="border-border bg-white shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between font-mono text-xs pb-2 border-b border-border/60">
                <span className="font-extrabold text-[#0B3323]">
                  {bracketSize === 4 ? `Semi Final ${m.matchPosition}` : `Quarter Final ${m.matchPosition}`}
                </span>
                <Badge variant="outline" className="text-[10px] font-bold text-muted-foreground">
                  Match #{m.matchPosition}
                </Badge>
              </div>

              <div className="space-y-2 py-1">
                {/* Slot A */}
                <div className="flex items-center justify-between p-2.5 rounded-xl border border-emerald-300 bg-emerald-50/70 text-xs font-semibold text-emerald-950">
                  <div className="flex items-center gap-2 truncate">
                    <Badge variant="efootball" className="text-[10px] px-1.5 py-0 font-mono font-extrabold">
                      {m.slotA.seedCode}
                    </Badge>
                    <span className="font-extrabold truncate">{m.slotA.participant.username}</span>
                  </div>
                  <span className="text-[11px] text-emerald-800 font-mono">{m.slotA.groupName} 1st</span>
                </div>

                <div className="text-center font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  VS
                </div>

                {/* Slot B */}
                <div className="flex items-center justify-between p-2.5 rounded-xl border border-emerald-300 bg-emerald-50/70 text-xs font-semibold text-emerald-950">
                  <div className="flex items-center gap-2 truncate">
                    <Badge variant="efootball" className="text-[10px] px-1.5 py-0 font-mono font-extrabold">
                      {m.slotB.seedCode}
                    </Badge>
                    <span className="font-extrabold truncate">{m.slotB.participant.username}</span>
                  </div>
                  <span className="text-[11px] text-emerald-800 font-mono">{m.slotB.groupName} 2nd</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Eliminated Participants Section */}
      {eliminated.length > 0 && (
        <Card className="border-border bg-white shadow-xs overflow-hidden">
          <CardHeader className="bg-secondary/30 border-b border-border pb-3">
            <CardTitle className="text-sm font-extrabold text-[#0B3323] flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>Eliminated Participants ({eliminated.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-secondary/20 text-[#0B3323] font-bold border-b border-border text-[11px]">
                  <tr>
                    <th className="p-3">Participant</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-xs text-muted-foreground">
                  {eliminated.map((p) => (
                    <tr key={p.id} className="hover:bg-secondary/10">
                      <td className="p-3 font-semibold text-[#0B3323]">
                        {p.username}
                        {p.real_name && <span className="text-[11px] text-muted-foreground ml-1.5 font-normal">({p.real_name})</span>}
                      </td>
                      <td className="p-3 text-right">
                        <Badge variant="outline" className="text-[9px] font-bold border-destructive/30 text-destructive gap-1">
                          <XCircle className="h-3 w-3" />
                          <span>ELIMINATED</span>
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleGenerateKnockout}
        title="Generate Knockout Stage"
        description={`The group stage will be locked into the knockout phase. ${totalQualifiers} participants will advance into the ${bracketSize}-player bracket using the existing knockout system. Continue?`}
        confirmText="Generate Knockout"
        isLoading={actionLoading}
      />
    </div>
  );
}
