'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  Calendar,
  Clock,
  Layers,
  Gamepad2,
  DollarSign,
  ShieldAlert,
  Info,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { tournamentSchema, type TournamentInput } from '@/lib/validations';
import { getTournamentById } from '@/services/tournamentService';
import { updateTournamentAction } from '@/app/actions/tournamentActions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/modal';
import { getFixtureStatus } from '@/services/fixtureService';
import type { Tournament } from '@/types/database';

const BANNER_PRESETS = [
  { label: 'Stadium Floodlights', url: '/images/banner1.jpg' },
  { label: 'Arena Matchday', url: '/images/banner2.jpg' },
  { label: 'Golden Trophy', url: '/images/banner3.jpg' },
  { label: 'Championship Stage', url: '/images/banners/efootball-championship.jpg' },
  { label: 'eFootball Stadium', url: '/images/banners/efootball-stadium.jpg' },
];

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
    resolver: zodResolver(tournamentSchema) as any,
    defaultValues: {
      name: '',
      description: '',
      format: 'knockout',
      status: 'draft',
      start_date: '',
      end_date: '',
      registration_deadline: '',
      rules_text: '',
      banner_image: '',
      max_participants: 32,
      rounds_per_pair: 1,
      qualifiers_per_group: 2,
      is_paid: false,
      entry_fee_rupees: 0,
      prize_pool_rupees: 0,
      currency: 'INR',
    },
  });

  const selectedFormat = watch('format');
  const selectedStatus = watch('status');
  const isPaid = watch('is_paid');
  const entryFeeRupees = watch('entry_fee_rupees') || 0;
  const prizePoolRupees = watch('prize_pool_rupees') || 0;
  const maxParticipants = watch('max_participants') || 32;

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
            registration_deadline: t.registration_deadline ? t.registration_deadline.split('T')[0] : '',
            rules_text: t.rules_text || '',
            banner_image: t.banner_image || '',
            max_participants: t.max_participants,
            rounds_per_pair: t.rounds_per_pair || 1,
            qualifiers_per_group: t.qualifiers_per_group || 2,
            is_paid: Boolean(t.is_paid),
            entry_fee_rupees: (t.entry_fee_paise || 0) / 100,
            prize_pool_rupees: (t.prize_pool_paise || 0) / 100,
            currency: t.currency || 'INR',
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
      const res = await updateTournamentAction(id, data);
      if (!res.success) {
        setErrorMessage(res.message);
        return;
      }
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
      <div className="min-h-[400px] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00]" />
          <span className="text-xs font-semibold">Loading Tournament Settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16 text-white">
      {/* Back Button & Title */}
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full">
          <Link href={`/admin/tournaments/${id}`}>
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Details</span>
          </Link>
        </Button>

        <h1 className="text-2xl sm:text-4xl font-black text-white font-display uppercase tracking-wider">
          Edit Tournament
        </h1>
        <p className="text-xs sm:text-sm text-white/70">
          Modify tournament configurations, competitive format, capacity, and pricing.
        </p>
      </div>

      {/* Main Settings Card */}
      <Card className="border border-white/20 shadow-2xl bg-[#1818D4] rounded-[32px] overflow-hidden text-white">
        <CardHeader className="border-b border-white/10 pb-5">
          <CardTitle className="text-xl font-black font-display uppercase tracking-wider text-white">
            Tournament Settings & Configuration
          </CardTitle>
          <CardDescription className="text-xs text-white/70">
            Changes will update database records and revalidate live public and dashboard views.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-destructive/20 border border-destructive/40 text-red-200 text-xs font-semibold flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
            {/* 1. Basic Information */}
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#FFFF00]">
                1. Basic Information & Schedule
              </h3>

              <div>
                <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                  Tournament Name *
                </label>
                <Input
                  disabled={isSubmitting}
                  className="bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 focus:border-[#FFFF00] rounded-xl h-11"
                  {...register('name')}
                />
                {errors.name && <p className="text-xs text-red-300 mt-1 font-medium">{errors.name.message}</p>}
              </div>

              <div>
                <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                  Description
                </label>
                <textarea
                  className="w-full min-h-[90px] rounded-xl border border-white/20 bg-[#0A0A7A] p-3 text-xs text-white placeholder:text-white/40 focus-visible:outline-none focus:border-[#FFFF00]"
                  disabled={isSubmitting}
                  {...register('description')}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-[#FFFF00]" />
                    <span>Start Date</span>
                  </label>
                  <Input
                    type="date"
                    disabled={isSubmitting}
                    className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-11"
                    {...register('start_date')}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-[#FFFF00]" />
                    <span>End Date</span>
                  </label>
                  <Input
                    type="date"
                    disabled={isSubmitting}
                    className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-11"
                    {...register('end_date')}
                  />
                  {errors.end_date && <p className="text-xs text-red-300 mt-1 font-medium">{errors.end_date.message}</p>}
                </div>

                <div>
                  <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#FFFF00]" />
                    <span>Registration Deadline</span>
                  </label>
                  <Input
                    type="date"
                    disabled={isSubmitting}
                    className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-11"
                    {...register('registration_deadline')}
                  />
                  {errors.registration_deadline && (
                    <p className="text-xs text-red-300 mt-1 font-medium">{errors.registration_deadline.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Format & Status */}
            <div className="space-y-4 pt-4 border-t border-white/10">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#FFFF00]">
                2. Format & Tournament Lifecycle Status
              </h3>

              <div>
                <label className="text-xs font-bold text-white block mb-2 uppercase tracking-wider">
                  Tournament Format *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { id: 'knockout', label: 'Knockout', desc: 'Single elimination playoff tree' },
                    { id: 'league', label: 'League', desc: 'Round-robin points leaderboard' },
                    { id: 'group_knockout', label: 'Groups + Knockout', desc: 'Group stage leading to playoff tree' },
                    {
                      id: 'single_league_knockout',
                      label: 'Single League + Eliminators',
                      desc: 'Coming in v2.0 (Use Groups + Knockout)',
                      disabled: true,
                    },
                  ].map((fmt) => {
                    const isSelected = selectedFormat === fmt.id;
                    const isDisabled = Boolean((fmt as any).disabled);
                    return (
                      <button
                        type="button"
                        key={fmt.id}
                        disabled={isDisabled}
                        onClick={() => {
                          if (!isDisabled) setValue('format', fmt.id as any);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          isDisabled
                            ? 'opacity-40 cursor-not-allowed border-white/10 bg-[#07075A]'
                            : isSelected
                            ? 'border-[#FFFF00] bg-[#FFFF00] text-[#08088F] shadow-md cursor-pointer'
                            : 'border-white/20 bg-[#0A0A7A] text-white hover:border-white/40 cursor-pointer'
                        }`}
                      >
                        <span className={`block text-xs font-black uppercase tracking-wider ${isSelected ? 'text-[#08088F]' : 'text-white'}`}>
                          {fmt.label}
                        </span>
                        <span className={`block text-[10px] mt-0.5 ${isSelected ? 'text-[#08088F]/80 font-bold' : 'text-white/60'}`}>
                          {fmt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status Selector */}
              <div>
                <label className="text-xs font-bold text-white block mb-2 uppercase tracking-wider">
                  Status *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: 'draft', label: 'Draft', desc: 'Hidden from public lists' },
                    { id: 'registration', label: 'Registration', desc: 'Open for player signups' },
                    { id: 'ongoing', label: 'Ongoing', desc: 'Matches in progress' },
                    { id: 'completed', label: 'Completed', desc: 'Finalized results' },
                  ].map((st) => {
                    const isSelected = selectedStatus === st.id;
                    return (
                      <button
                        type="button"
                        key={st.id}
                        onClick={() => setValue('status', st.id as any)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#FFFF00] bg-[#FFFF00] text-[#08088F] shadow-md'
                            : 'border-white/20 bg-[#0A0A7A] text-white hover:border-white/40'
                        }`}
                      >
                        <span className={`block text-xs font-black uppercase tracking-wider ${isSelected ? 'text-[#08088F]' : 'text-white'}`}>
                          {st.label}
                        </span>
                        <span className={`block text-[10px] ${isSelected ? 'text-[#08088F]/80 font-bold' : 'text-white/60'}`}>
                          {st.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 3. Capacity & Pricing */}
            <div className="space-y-4 pt-4 border-t border-white/10">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#FFFF00]">
                3. Participant Capacity & Entry Fee
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                    Max Capacity (Slots) *
                  </label>
                  <Input
                    type="number"
                    min={2}
                    max={1024}
                    disabled={isSubmitting}
                    className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-11"
                    {...register('max_participants', { valueAsNumber: true })}
                  />
                  {errors.max_participants && (
                    <p className="text-xs text-red-300 mt-1 font-medium">{errors.max_participants.message}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                    Pricing Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setValue('is_paid', false);
                        setValue('entry_fee_rupees', 0);
                      }}
                      className={`h-11 rounded-xl text-xs font-black uppercase border transition-all cursor-pointer ${
                        !isPaid
                          ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00]'
                          : 'bg-[#0A0A7A] text-white border-white/20'
                      }`}
                    >
                      Free
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setValue('is_paid', true);
                        if (entryFeeRupees === 0) setValue('entry_fee_rupees', 50);
                      }}
                      className={`h-11 rounded-xl text-xs font-black uppercase border transition-all cursor-pointer ${
                        isPaid
                          ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00]'
                          : 'bg-[#0A0A7A] text-white border-white/20'
                      }`}
                    >
                      Paid
                    </button>
                  </div>
                </div>

                {isPaid && (
                  <div>
                    <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                      Entry Fee (₹ INR) *
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={50000}
                      disabled={isSubmitting}
                      className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-11 font-mono font-bold"
                      {...register('entry_fee_rupees', { valueAsNumber: true })}
                    />
                    {errors.entry_fee_rupees && (
                      <p className="text-xs text-red-300 mt-1 font-medium">{errors.entry_fee_rupees.message}</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                  Prize Pool (₹ INR)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={10000000}
                  disabled={isSubmitting}
                  className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-11 max-w-xs font-mono font-bold"
                  {...register('prize_pool_rupees', { valueAsNumber: true })}
                />
              </div>
            </div>

            {/* 4. Banner & Rules */}
            <div className="space-y-4 pt-4 border-t border-white/10">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#FFFF00]">
                4. Media & Rules Text
              </h3>

              <div>
                <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                  Banner Image URL / Preset Path
                </label>
                <Input
                  disabled={isSubmitting}
                  className="bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 focus:border-[#FFFF00] rounded-xl h-11"
                  {...register('banner_image')}
                />
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {BANNER_PRESETS.map((p) => (
                    <button
                      type="button"
                      key={p.url}
                      onClick={() => setValue('banner_image', p.url, { shouldValidate: true })}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-[#0A0A7A] hover:bg-[#FFFF00] hover:text-[#08088F] text-white font-bold border border-white/20 transition-colors cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                  Competitive Rules
                </label>
                <textarea
                  className="w-full min-h-[120px] rounded-xl border border-white/20 bg-[#0A0A7A] p-3 text-xs text-white placeholder:text-white/40 focus-visible:outline-none focus:border-[#FFFF00] font-mono leading-relaxed"
                  disabled={isSubmitting}
                  {...register('rules_text')}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-6 flex items-center justify-end gap-3 border-t border-white/10">
              <Button asChild variant="outline" type="button" className="rounded-full border-white/30 text-white hover:bg-white/10 font-bold px-6">
                <Link href={`/admin/tournaments/${id}`}>Cancel</Link>
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black rounded-full px-8 h-11 gap-2 shadow-lg uppercase tracking-wider cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" />
                    <span>Saving Changes...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 text-[#08088F]" />
                    <span>Save Tournament Settings</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Confirmation Modal when modifying existing generated fixtures */}
      <ConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={async () => {
          setIsConfirmModalOpen(false);
          if (pendingSubmitData) {
            await executeUpdate(pendingSubmitData);
          }
        }}
        title="Modify Tournament Structure?"
        description="Matches or bracket fixtures have already been generated for this tournament. Changing the tournament format or capacity may impact existing bracket nodes or match progression."
        confirmText="Confirm Changes"
        variant="destructive"
      />
    </div>
  );
}
