'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { getTournamentById, TournamentWithStats } from '@/services/tournamentService';
import { getTournamentBracket, BracketOverview } from '@/services/bracketService';
import { fetchKnockoutDraft } from '@/services/bracketCustomizerService';
import type { KnockoutDraftPayload } from '@/types/database';
import AdminKnockoutCustomizer from '@/components/admin/bracket-customizer/AdminKnockoutCustomizer';
import { Button } from '@/components/ui/button';

export default function CustomizeBracketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params);

  const [tournament, setTournament] = useState<TournamentWithStats | null>(null);
  const [bracketOverview, setBracketOverview] = useState<BracketOverview | null>(null);
  const [draftPayload, setDraftPayload] = useState<KnockoutDraftPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tData, bData, dPayload] = await Promise.all([
        getTournamentById(tournamentId),
        getTournamentBracket(tournamentId),
        fetchKnockoutDraft(tournamentId),
      ]);

      if (!tData) {
        throw new Error('Tournament not found');
      }

      setTournament(tData);
      setBracketOverview(bData);
      setDraftPayload(dPayload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load tournament customizer data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tournamentId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p className="text-xs font-bold text-slate-500">Loading Knockout Customizer...</p>
      </div>
    );
  }

  if (error || !tournament || !bracketOverview || !draftPayload) {
    return (
      <div className="space-y-4 max-w-xl mx-auto py-12">
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-3xl text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-rose-600 mx-auto" />
          <h3 className="text-base font-black text-rose-950">Unable to load Customizer</h3>
          <p className="text-xs font-semibold text-rose-700">{error || 'Required data not found'}</p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Link href={`/admin/tournaments/${tournamentId}/bracket`}>
              <Button variant="outline" className="rounded-xl text-xs font-bold">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to Bracket
              </Button>
            </Link>
            <Button onClick={loadData} className="rounded-xl text-xs font-bold bg-emerald-600 text-white">
              <RefreshCw className="h-4 w-4 mr-1" /> Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const liveMatches = bracketOverview.rounds.flatMap((r) => r.matches);

  return (
    <div className="space-y-6 pb-12">
      {/* Header back button */}
      <div className="flex items-center justify-between">
        <Link
          href={`/admin/tournaments/${tournamentId}/bracket`}
          className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-600 hover:text-[#0B3323] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Tournament Bracket</span>
        </Link>
      </div>

      <AdminKnockoutCustomizer
        tournamentId={tournamentId}
        tournamentName={tournament.name}
        initialPayload={draftPayload}
        allParticipants={bracketOverview.participants}
        liveMatches={liveMatches}
      />
    </div>
  );
}
