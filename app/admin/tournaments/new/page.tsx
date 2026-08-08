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
                {errors.format && (
                  <p className="text-xs text-destructive mt-1 font-medium">
                    {errors.format.message}
                  </p>
                )}
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
                        <option value={1}>Top 1 per group</option>
                        <option value={2}>Top 2 per group (Standard)</option>
                        <option value={3}>Top 3 per group</option>
                        <option value={4}>Top 4 per group</option>
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
                <label className="text-xs font-bold text-[#0B3323] block mb-1.5">
                  Banner Image URL
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
