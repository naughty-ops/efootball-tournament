'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Save, Loader2, AlertCircle } from 'lucide-react';
import { tournamentSchema, TournamentInput } from '@/lib/validations';
import { getTournamentById, updateTournament } from '@/services/tournamentService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import { ConfirmModal } from '@/components/ui/modal';
import { getFixtureStatus } from '@/services/fixtureService';
import type { Tournament } from '@/types/database';

export default function EditTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [originalTournament, setOriginalTournament] = useState<Tournament | null>(null);
  const [hasFixtures, setHasFixtures] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<TournamentInput | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TournamentInput>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: {
      name: '',
      description: '',
      format: 'knockout',
      status: 'draft',
      start_date: '',
      end_date: '',
      rules_text: '',
      banner_image: '',
      max_participants: 32,
    },
  });

  const selectedFormat = watch('format');
  const selectedStatus = watch('status');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [t, fStatus] = await Promise.all([
          getTournamentById(id),
          getFixtureStatus(id),
        ]);

        if (!t) {
          setErrorMessage('Tournament not found.');
        } else {
          setOriginalTournament(t);
          setHasFixtures(fStatus.isGenerated);
          reset({
            name: t.name,
            description: t.description || '',
            format: t.format,
            status: t.status,
            start_date: t.start_date ? t.start_date.split('T')[0] : '',
            end_date: t.end_date ? t.end_date.split('T')[0] : '',
            rules_text: t.rules_text || '',
            banner_image: t.banner_image || '',
            max_participants: t.max_participants,
            rounds_per_pair: t.rounds_per_pair || 1,
            qualifiers_per_group: t.qualifiers_per_group || 2,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load tournament data.';
        setErrorMessage(msg);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id, reset]);

  const executeUpdate = async (data: TournamentInput) => {
    setErrorMessage(null);
    try {
      await updateTournament(id, data);
      router.push(`/admin/tournaments/${id}`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update tournament';
      setErrorMessage(msg);
    }
  };

  const onSubmit = async (data: TournamentInput) => {
    const formatChanged = originalTournament && originalTournament.format !== data.format;
    const limitChanged = originalTournament && originalTournament.max_participants !== data.max_participants;

    if (hasFixtures && (formatChanged || limitChanged)) {
      setPendingSubmitData(data);
      setIsConfirmModalOpen(true);
      return;
    }

    await executeUpdate(data);
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#0B3323]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs font-semibold">Loading Tournament Form...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Back Button & Title */}
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary -ml-2">
          <Link href={`/admin/tournaments/${id}`}>
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Details</span>
          </Link>
        </Button>

        <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
          Edit Tournament
        </h1>
        <p className="text-sm text-muted-foreground">
          Update tournament information, dates, rules, or participant limits.
        </p>
      </div>

      {/* Form Card */}
      <Card className="border-border shadow-md bg-white">
        <CardHeader>
          <CardTitle className="text-xl">Tournament Settings</CardTitle>
          <CardDescription className="text-xs">
            Save changes to update the Supabase database.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* 1. Basic Information */}
            <div className="space-y-4 pt-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                1. Basic Information
              </h3>

              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-1.5">
                  Tournament Name *
                </label>
                <Input
                  disabled={isSubmitting}
                  {...register('name')}
                />
                {errors.name && (
                  <p className="text-xs text-destructive mt-1 font-medium">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-1.5">
                  Description
                </label>
                <textarea
                  className="w-full min-h-[90px] rounded-xl border border-input bg-card p-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={isSubmitting}
                  {...register('description')}
                />
              </div>
            </div>

            {/* 2. Format & Status */}
            <div className="space-y-4 pt-4 border-t border-border/60">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                2. Tournament Format & Status
              </h3>

              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-2">
                  Tournament Format *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'knockout', label: 'Knockout', desc: 'Single/Double elimination tree' },
                    { id: 'league', label: 'League', desc: 'Round-robin points leaderboard' },
                    { id: 'group_knockout', label: 'Group + Knockout', desc: 'Group stage leading to knockout' },
                  ].map((fmt) => {
                    const isSelected = selectedFormat === fmt.id;
                    return (
                      <button
                        type="button"
                        key={fmt.id}
                        onClick={() => setValue('format', fmt.id as 'knockout' | 'league' | 'group_knockout')}
                        className={`p-3.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-primary bg-secondary/80 shadow-xs'
                            : 'border-border bg-white hover:bg-secondary/40'
                        }`}
                      >
                        <span className="block text-xs font-extrabold text-[#0B3323]">{fmt.label}</span>
                        <span className="block text-[11px] text-muted-foreground mt-0.5">{fmt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedFormat === 'group_knockout' && (
                <div className="p-4 rounded-2xl bg-[#F4F8F5] border border-border space-y-4">
                  <h4 className="text-xs font-extrabold text-[#0B3323] uppercase tracking-wider">
                    Group Stage Configuration
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-[#0B3323] block mb-1">
                        Matches Per Pair (Rounds)
                      </label>
                      <select
                        {...register('rounds_per_pair', { valueAsNumber: true })}
                        className="w-full h-10 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-[#0B3323]"
                      >
                        <option value={1}>1 Round (Single Round-Robin)</option>
                        <option value={2}>2 Rounds (Double Round-Robin / Two Legs)</option>
                        <option value={3}>3 Rounds</option>
                        <option value={4}>4 Rounds</option>
                      </select>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Select how many times each pair plays against each other in the group stage.
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[#0B3323] block mb-1">
                        Qualifiers Per Group
                      </label>
                      <select
                        {...register('qualifiers_per_group', { valueAsNumber: true })}
                        className="w-full h-10 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-[#0B3323]"
                      >
                        <option value={8}>Top 8 Qualify (Quarter-Finals - Standard)</option>
                        <option value={16}>Top 16 Qualify (Round of 16)</option>
                        <option value={32}>Top 32 Qualify (Round of 32)</option>
                        <option value={24}>Top 24 Qualify</option>
                        <option value={12}>Top 12 Qualify</option>
                        <option value={6}>Top 6 Qualify (1st & 2nd Direct Semi-Finals, 3rd-6th Eliminators)</option>
                        <option value={4}>Top 4 Qualify (Semi-Finals)</option>
                        <option value={2}>Top 2 Qualify (Grand Final)</option>
                        <option value={1}>Top 1 Qualify</option>
                      </select>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Top ranked players per group that advance to the Knockout Bracket.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-2">
                  Status *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['draft', 'registration', 'ongoing', 'completed'].map((st) => {
                    const isSelected = selectedStatus === st;
                    return (
                      <button
                        type="button"
                        key={st}
                        onClick={() => setValue('status', st as 'draft' | 'registration' | 'ongoing' | 'completed')}
                        className={`p-2.5 rounded-xl border text-center transition-all capitalize text-xs font-bold ${
                          isSelected
                            ? 'border-primary bg-secondary/80 text-[#0B3323] shadow-xs'
                            : 'border-border bg-white text-muted-foreground hover:bg-secondary/40'
                        }`}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 3. Dates & Participant Limit */}
            <div className="space-y-4 pt-4 border-t border-border/60">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                3. Schedule & Participant Limit
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#0B3323] block mb-1.5">
                    Start Date
                  </label>
                  <Input
                    type="date"
                    disabled={isSubmitting}
                    {...register('start_date')}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[#0B3323] block mb-1.5">
                    End Date
                  </label>
                  <Input
                    type="date"
                    disabled={isSubmitting}
                    {...register('end_date')}
                  />
                  {errors.end_date && (
                    <p className="text-xs text-destructive mt-1 font-medium">
                      {errors.end_date.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-[#0B3323] block mb-1.5">
                    Max Participants *
                  </label>
                  <Input
                    type="number"
                    min={2}
                    max={1024}
                    disabled={isSubmitting}
                    {...register('max_participants', { valueAsNumber: true })}
                  />
                  {errors.max_participants && (
                    <p className="text-xs text-destructive mt-1 font-medium">
                      {errors.max_participants.message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 4. Banner & Rules */}
            <div className="space-y-4 pt-4 border-t border-border/60">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                4. Media & Rules
              </h3>

              <div>
                <label className="text-xs font-bold text-[#0B3323] flex items-center justify-between mb-1.5">
                  <span>Banner Image URL</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Visible on Admin & Public pages</span>
                </label>
                <Input
                  disabled={isSubmitting}
                  placeholder="https://domain.com/banner.jpg"
                  {...register('banner_image')}
                />
                {errors.banner_image && (
                  <p className="text-xs text-destructive mt-1 font-medium">
                    {errors.banner_image.message}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[11px] font-bold text-muted-foreground">Quick Presets:</span>
                  {[
                    { label: 'Banner 1', url: '/images/banner1.jpg' },
                    { label: 'Banner 2', url: '/images/banner2.jpg' },
                    { label: 'Banner 3', url: '/images/banner3.jpg' },
                  ].map((preset) => (
                    <button
                      type="button"
                      key={preset.url}
                      onClick={() => setValue('banner_image', preset.url, { shouldValidate: true })}
                      className="text-[11px] px-2 py-0.5 rounded-lg bg-secondary hover:bg-primary/20 text-[#0B3323] font-semibold border border-border transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {watch('banner_image') && (
                  <div className="mt-3 relative w-full aspect-[21/9] min-h-[140px] max-h-[220px] rounded-xl overflow-hidden border border-border shadow-inner bg-slate-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={watch('banner_image') || '/images/banner1.jpg'}
                      alt="Banner Preview"
                      className="w-full h-full object-cover object-center"
                    />
                    <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold">
                      Live Banner Preview
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-1.5">
                  Rules Text
                </label>
                <textarea
                  className="w-full min-h-[100px] rounded-xl border border-input bg-card p-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={isSubmitting}
                  {...register('rules_text')}
                />
              </div>
            </div>

            {/* Save Actions */}
            <div className="pt-4 flex items-center justify-end gap-3 border-t border-border">
              <Button asChild variant="outline" type="button" className="rounded-xl">
                <Link href={`/admin/tournaments/${id}`}>Cancel</Link>
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="font-bold rounded-xl px-6 gap-2 shadow-md"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Update Tournament</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Format Change Safety Warning Modal */}
      <ConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => {
          setIsConfirmModalOpen(false);
          setPendingSubmitData(null);
        }}
        onConfirm={async () => {
          setIsConfirmModalOpen(false);
          if (pendingSubmitData) {
            await executeUpdate(pendingSubmitData);
          }
        }}
        title="Warning: Modifying Tournament Format / Limit"
        description="Fixtures have already been generated for this tournament. Changing the tournament format or participant limit may invalidate existing fixtures and brackets. Are you sure you want to continue?"
        confirmText="Save & Continue"
        variant="destructive"
      />
    </div>
  );
}
