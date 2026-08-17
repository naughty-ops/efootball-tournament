'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Trophy, Loader2, AlertCircle } from 'lucide-react';
import { tournamentSchema, TournamentInput } from '@/lib/validations';
import { createTournament } from '@/services/tournamentService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function CreateTournamentPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TournamentInput>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: {
      name: '',
      description: '',
      format: 'single_league_knockout',
      status: 'draft',
      start_date: '',
      end_date: '',
      rules_text: '',
      banner_image: '',
      max_participants: 32,
      qualifiers_per_group: 8,
      rounds_per_pair: 1,
    },
  });

  const selectedFormat = watch('format');
  const selectedStatus = watch('status');

  const onSubmit = async (data: TournamentInput) => {
    setErrorMessage(null);
    try {
      await createTournament(data);
      router.push('/admin/tournaments');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create tournament';
      setErrorMessage(msg);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Back Button & Title */}
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary">
          <Link href="/admin/tournaments">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Tournaments</span>
          </Link>
        </Button>

        <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
          Create New Tournament
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure tournament structure, participant limits, and competitive rules.
        </p>
      </div>

      {/* Form Card */}
      <Card className="border-border shadow-md bg-white">
        <CardHeader>
          <CardTitle className="text-xl">Tournament Setup Details</CardTitle>
          <CardDescription className="text-xs">
            All fields can be updated later from the admin dashboard.
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
                  placeholder="e.g. eFootball Champions Cup 2026"
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
                  placeholder="Brief description of the tournament rules or prize pool details..."
                  disabled={isSubmitting}
                  {...register('description')}
                />
              </div>
            </div>

            {/* 2. Format & Status */}
            <div className="space-y-4 pt-4 border-t border-border/60">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                2. Tournament Format & Initial Status
              </h3>

              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-2">
                  Tournament Format *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { id: 'single_league_knockout', label: 'League + Knockout', desc: 'Single league table season followed by knockout playoff tree' },
                    { id: 'knockout', label: 'Knockout', desc: 'Single elimination playoff tree' },
                    { id: 'league', label: 'League', desc: 'Round-robin points leaderboard' },
                    { id: 'group_knockout', label: 'Groups + Knockout', desc: 'Group stage leading to playoff tree' },
                  ].map((fmt) => {
                    const isSelected = selectedFormat === fmt.id;
                    return (
                      <button
                        type="button"
                        key={fmt.id}
                        onClick={() => setValue('format', fmt.id as 'knockout' | 'league' | 'group_knockout' | 'single_league_knockout')}
                        className={`p-3.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-primary bg-secondary/80 shadow-xs ring-1 ring-primary/30'
                            : 'border-border bg-white hover:bg-secondary/40'
                        }`}
                      >
                        <span className="block text-xs font-extrabold text-[#0B3323]">{fmt.label}</span>
                        <span className="block text-[11px] text-muted-foreground mt-0.5">{fmt.desc}</span>
                      </button>
                    );
                  })}
                </div>
                {errors.format && (
                  <p className="text-xs text-destructive mt-1 font-medium">
                    {errors.format.message}
                  </p>
                )}
              </div>

              {(selectedFormat === 'group_knockout' || selectedFormat === 'single_league_knockout') && (() => {
                const maxP = watch('max_participants') || 16;
                const isSingleLeague = selectedFormat === 'single_league_knockout';
                const rounds = watch('rounds_per_pair') || 1;
                const qualPerGroup = watch('qualifiers_per_group') || (isSingleLeague ? 8 : 2);
                const groupCount = isSingleLeague ? 1 : Math.max(2, Math.floor(maxP / 4));
                const playersPerGroup = Math.ceil(maxP / groupCount);
                const matchesPerGroup = Math.floor((playersPerGroup * (playersPerGroup - 1)) / 2) * rounds;
                const totalLeagueMatches = matchesPerGroup * groupCount;
                const totalQualifiers = isSingleLeague ? Math.min(qualPerGroup, maxP) : groupCount * qualPerGroup;
                const koStage = isSingleLeague
                  ? totalQualifiers === 6
                    ? 'Top 2 Direct Semi-Finals + 3rd-6th Eliminators'
                    : totalQualifiers <= 2 ? 'Grand Final' : totalQualifiers <= 4 ? 'Semi-Finals' : totalQualifiers <= 8 ? 'Quarter-Finals' : 'Round of 16'
                  : totalQualifiers <= 2 ? 'Grand Final' : totalQualifiers <= 4 ? 'Semi-Finals' : totalQualifiers <= 8 ? 'Quarter-Finals' : totalQualifiers <= 16 ? 'Round of 16' : 'Round of 32';

                return (
                  <div className="p-4.5 rounded-2xl bg-[#F4F8F5] border border-border space-y-4 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-extrabold text-[#0B3323] uppercase tracking-wider flex items-center gap-2">
                        <span>{isSingleLeague ? 'Single League Season & Knockout Configuration' : 'Group + Knockout Configuration'}</span>
                      </h4>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        Live Season Preview
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-[#0B3323] block mb-1">
                          Matches Per Opponent Pair
                        </label>
                        <select
                          {...register('rounds_per_pair', { valueAsNumber: true })}
                          className="w-full h-10 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-[#0B3323]"
                        >
                          <option value={1}>1 Round (Single Round-Robin - Face Each Player Once)</option>
                          <option value={2}>2 Rounds (Double Round-Robin - Face Each Player Twice)</option>
                          <option value={3}>3 Rounds</option>
                          <option value={4}>4 Rounds</option>
                        </select>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {isSingleLeague
                            ? 'Every player faces every opponent in the single league table.'
                            : 'Select how many times each pair plays against each other in the group stage.'}
                        </p>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-[#0B3323] block mb-1">
                          Knockout Qualification Count
                        </label>
                        <select
                          {...register('qualifiers_per_group', { valueAsNumber: true })}
                          className="w-full h-10 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-[#0B3323]"
                        >
                          <option value={8}>Top 8 Qualify to Knockout (Quarter-Finals - Standard)</option>
                          <option value={2}>Top 2 per Group (8 Total Qualifiers to Quarter-Finals)</option>
                          <option value={16}>Top 16 Qualify to Knockout (Round of 16)</option>
                          <option value={32}>Top 32 Qualify to Knockout (Round of 32)</option>
                          <option value={24}>Top 24 Qualify to Knockout</option>
                          <option value={12}>Top 12 Qualify to Knockout</option>
                          <option value={6}>Top 6 Qualify (1st & 2nd Direct Semi-Finals, 3rd-6th Eliminators)</option>
                          <option value={4}>Top 4 Qualify to Knockout (Semi-Finals)</option>
                        </select>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Top ranked league performers advancing to the Knockout Playoff Tree.
                        </p>
                      </div>
                    </div>

                    {/* Configurable Points System & Custom Tiebreakers Info */}
                    <div className="p-3.5 rounded-xl bg-white border border-border/80 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-[#0B3323] uppercase text-[10px] tracking-wider block">
                          ⚽ Default Points System & Custom Tiebreaker Hierarchy
                        </span>
                        <Badge variant="outline" className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border-emerald-300">
                          Configurable Engine Active
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-muted-foreground font-semibold">
                        <div>
                          • <strong>Points System</strong>: Win = 3 PTS · Draw = 1 PTS · Loss = 0 PTS
                        </div>
                        <div>
                          • <strong>Tiebreaker Priority</strong>: 1. Points → 2. GD → 3. GF → 4. Wins → 5. Head-to-Head
                        </div>
                      </div>
                    </div>

                    {/* Live Configuration Summary Card */}
                    <div className="p-3.5 rounded-xl bg-white border border-border/80 space-y-2 text-xs">
                      <span className="font-extrabold text-[#0B3323] uppercase text-[10px] tracking-wider block flex items-center justify-between">
                        <span>📊 Season Structure & Fixture Projection</span>
                        {isSingleLeague && <span className="text-amber-600 font-black">🏆 1st Place = League Shield Winner</span>}
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                        <div className="bg-[#F4F8F5] p-2 rounded-lg border border-border/50">
                          <span className="text-muted-foreground text-[10px] block">League Table</span>
                          <span className="font-bold text-[#0B3323]">{isSingleLeague ? `1 Single League (${maxP} players)` : `${groupCount} Groups (${playersPerGroup} players/grp)`}</span>
                        </div>
                        <div className="bg-[#F4F8F5] p-2 rounded-lg border border-border/50">
                          <span className="text-muted-foreground text-[10px] block">League Format</span>
                          <span className="font-bold text-[#0B3323]">{rounds === 2 ? 'Double Round-Robin (2x)' : 'Single Round-Robin (1x)'}</span>
                        </div>
                        <div className="bg-[#F4F8F5] p-2 rounded-lg border border-border/50">
                          <span className="text-muted-foreground text-[10px] block">Total Season Matches</span>
                          <span className="font-bold text-[#0B3323]">{totalLeagueMatches} Fixtures</span>
                        </div>
                        <div className="bg-[#F4F8F5] p-2 rounded-lg border border-border/50">
                          <span className="text-muted-foreground text-[10px] block">Playoff Format</span>
                          <span className="font-bold text-primary truncate" title={koStage}>{koStage}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="text-xs font-bold text-[#0B3323] block mb-2">
                  Initial Status *
                </label>
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  {[
                    { id: 'draft', label: 'Draft', desc: 'Hidden from public lists' },
                    { id: 'registration', label: 'Registration', desc: 'Open for player signups' },
                  ].map((st) => {
                    const isSelected = selectedStatus === st.id;
                    return (
                      <button
                        type="button"
                        key={st.id}
                        onClick={() => setValue('status', st.id as 'draft' | 'registration')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-primary bg-secondary/80 shadow-xs'
                            : 'border-border bg-white hover:bg-secondary/40'
                        }`}
                      >
                        <span className="block text-xs font-bold text-[#0B3323] capitalize">{st.label}</span>
                        <span className="block text-[10px] text-muted-foreground">{st.desc}</span>
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
                  placeholder="https://domain.com/banner.jpg"
                  disabled={isSubmitting}
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
                  placeholder="Match settings, match time, extra time rules, penalty rules..."
                  disabled={isSubmitting}
                  {...register('rules_text')}
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4 flex items-center justify-end gap-3 border-t border-border">
              <Button asChild variant="outline" type="button" className="rounded-xl">
                <Link href="/admin/tournaments">Cancel</Link>
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="font-bold rounded-xl px-6 gap-2 shadow-md"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Trophy className="h-4 w-4" />
                    <span>Save Tournament</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
