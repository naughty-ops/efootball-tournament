'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Trophy,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Users,
  ShieldAlert,
  Gamepad2,
  DollarSign,
  Layers,
  Sparkles,
  ArrowRight,
  Eye,
  Check,
  FileText,
  Clock,
  Info,
} from 'lucide-react';
import { tournamentSchema, type TournamentInput } from '@/lib/validations';
import { createTournamentAction } from '@/app/actions/tournamentActions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const STEPS = [
  { id: 1, title: 'Basics', icon: FileText, desc: 'Name & Schedule' },
  { id: 2, title: 'Format', icon: Layers, desc: 'Knockout or League' },
  { id: 3, title: 'Capacity', icon: Users, desc: 'Slots & Rules' },
  { id: 4, title: 'Gameplay', icon: Gamepad2, desc: '8-min Match Rules' },
  { id: 5, title: 'Prizes', icon: DollarSign, desc: 'Entry Fee & Pool' },
  { id: 6, title: 'Review', icon: Eye, desc: 'Publish or Draft' },
];

const BANNER_PRESETS = [
  { label: 'Stadium Floodlights', url: '/images/banner1.jpg' },
  { label: 'Arena Matchday', url: '/images/banner2.jpg' },
  { label: 'Golden Trophy', url: '/images/banner3.jpg' },
  { label: 'Championship Stage', url: '/images/banners/efootball-championship.jpg' },
  { label: 'eFootball Stadium', url: '/images/banners/efootball-stadium.jpg' },
];

const STANDARD_RULES_TEMPLATE = `1. Match Duration: 8 Minutes (standard competitive setting).
2. Extra Time & Penalties (PK): ENABLED for all knockout/playoff ties.
3. Player Condition: NORMAL (Equal footing).
4. Mode: Authentic Team / Dream Team (configured in room settings).
5. Hosting & Coordination:
   - The Home player generates the Friend Match Room Code.
   - Room Code must be shared in the match chat or via verified WhatsApp.
   - Matches must kick off within 10 minutes of the scheduled time.
6. Verification & Results:
   - Both players must take a clear screenshot of the full match summary screen (score, player IDs).
   - In case of a dispute, submit the screenshot to tournament administration.
7. Fair Play: Intentional disconnects or game quits result in an immediate 3-0 forfeit loss.`;

export default function CreateTournamentPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [matchLength, setMatchLength] = useState('8');
  const [extraTime, setExtraTime] = useState(true);
  const [penalties, setPenalties] = useState(true);
  const [conditionSetting, setConditionSetting] = useState('Normal');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
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
      rules_text: STANDARD_RULES_TEMPLATE,
      banner_image: '/images/banner1.jpg',
      max_participants: 32,
      rounds_per_pair: 1,
      qualifiers_per_group: 2,
      is_paid: false,
      entry_fee_rupees: 0,
      prize_pool_rupees: 0,
      currency: 'INR',
    },
  });

  const formValues = watch();
  const selectedFormat = watch('format');
  const isPaid = watch('is_paid');
  const entryFeeRupees = watch('entry_fee_rupees') || 0;
  const prizePoolRupees = watch('prize_pool_rupees') || 0;
  const maxParticipants = watch('max_participants') || 32;

  // Live financial calculations
  const projectedGross = isPaid ? maxParticipants * entryFeeRupees : 0;

  // Step navigation with field validation
  const nextStep = async () => {
    let fieldsToValidate: (keyof TournamentInput)[] = [];
    if (currentStep === 1) {
      fieldsToValidate = ['name', 'start_date', 'end_date', 'registration_deadline', 'banner_image'];
    } else if (currentStep === 2) {
      fieldsToValidate = ['format', 'rounds_per_pair', 'qualifiers_per_group'];
    } else if (currentStep === 3) {
      fieldsToValidate = ['max_participants'];
    } else if (currentStep === 4) {
      fieldsToValidate = ['rules_text'];
    } else if (currentStep === 5) {
      fieldsToValidate = ['is_paid', 'entry_fee_rupees', 'prize_pool_rupees'];
    }

    const isValid = await trigger(fieldsToValidate);
    if (isValid) {
      setErrorMessage(null);
      setCurrentStep((prev) => Math.min(prev + 1, 6));
    }
  };

  const prevStep = () => {
    setErrorMessage(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const applyRulesPreset = () => {
    const customized = `1. Match Duration: ${matchLength} Minutes.
2. Extra Time: ${extraTime ? 'ENABLED' : 'DISABLED'}.
3. Penalty Shootout (PK): ${penalties ? 'ENABLED' : 'DISABLED'}.
4. Player Condition: ${conditionSetting}.
5. Hosting & Coordination:
   - The Home player creates the Friend Match room and sends Invitation Code.
   - Both players must enter within 10 minutes of scheduled match time.
6. Result Submission:
   - Both players must take a clear screenshot of the final score screen.
7. Fair Play: Disconnection without reconnection counts as a 3-0 forfeit loss.`;
    setValue('rules_text', customized, { shouldValidate: true });
  };

  const submitTournament = async (targetStatus: 'draft' | 'registration') => {
    setErrorMessage(null);
    setValue('status', targetStatus);

    const valid = await trigger();
    if (!valid) {
      setErrorMessage('Please fix validation errors before submitting.');
      return;
    }

    try {
      const data = watch();
      data.status = targetStatus;
      const res = await createTournamentAction(data);
      if (!res.success) {
        setErrorMessage(res.message);
        return;
      }
      router.push('/admin/tournaments');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create tournament';
      setErrorMessage(msg);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16 text-white">
      {/* Header & Back Button */}
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full">
          <Link href="/admin/tournaments">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Tournaments</span>
          </Link>
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-white font-display uppercase tracking-wider">
              Create Tournament Wizard
            </h1>
            <p className="text-xs sm:text-sm text-white/70 mt-0.5">
              Set up competitive formats, capacity, 8-min eFootball match rules, and entry fees.
            </p>
          </div>
          <span className="self-start sm:self-auto px-3.5 py-1 rounded-full bg-[#0A0A7A] border border-white/20 text-[#FFFF00] text-xs font-black uppercase tracking-wider">
            Step {currentStep} of 6
          </span>
        </div>
      </div>

      {/* Wizard Step Progress Tracker */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 bg-[#0A0A7A] p-2 rounded-2xl border border-white/20">
        {STEPS.map((s) => {
          const Icon = s.icon;
          const isActive = currentStep === s.id;
          const isCompleted = currentStep > s.id;

          return (
            <button
              type="button"
              key={s.id}
              onClick={() => {
                if (s.id < currentStep) setCurrentStep(s.id);
              }}
              className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-xl text-center transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#FFFF00] text-[#08088F] font-black shadow-md'
                  : isCompleted
                  ? 'bg-white/10 text-white hover:bg-white/15'
                  : 'text-white/40 cursor-default'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5 sm:mb-1">
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400 stroke-[3]" />
                ) : (
                  <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-[#08088F]' : 'text-white/60'}`} />
                )}
                <span className="text-[10px] min-[360px]:text-[11px] font-black uppercase tracking-wider">{s.title}</span>
              </div>
              <span className={`hidden sm:block text-[9px] truncate max-w-full ${isActive ? 'text-[#08088F]/80 font-bold' : 'text-white/50'}`}>
                {s.desc}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Wizard Form Card */}
      <Card className="border border-white/20 shadow-2xl bg-[#1818D4] rounded-[32px] overflow-hidden text-white">
        <CardHeader className="border-b border-white/10 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-black font-display uppercase tracking-wider text-white flex items-center gap-2">
                <span>{STEPS[currentStep - 1].title}:</span>
                <span className="text-[#FFFF00]">{STEPS[currentStep - 1].desc}</span>
              </CardTitle>
              <CardDescription className="text-xs text-white/70 mt-0.5">
                Complete all required settings. You can edit this configuration anytime prior to tournament start.
              </CardDescription>
            </div>
            <span className="text-xs font-mono text-[#FFFF00] bg-[#0A0A7A] px-2.5 py-1 rounded-lg border border-white/15">
              Step {currentStep}/6
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-destructive/20 border border-destructive/40 text-red-200 text-xs font-semibold flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 1: BASIC INFORMATION */}
          {/* ========================================================================= */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div>
                <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                  Tournament Name *
                </label>
                <Input
                  placeholder="e.g. eFootball Championship Spring 2026"
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
                  placeholder="Official tournament details, season description, community guidelines, or eligibility criteria..."
                  disabled={isSubmitting}
                  {...register('description')}
                />
              </div>

              {/* Schedule Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
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

              {/* Banner Image & Presets */}
              <div className="space-y-3 pt-2">
                <label className="text-xs font-bold text-white flex items-center justify-between uppercase tracking-wider">
                  <span>Banner Image URL / Asset Path</span>
                  <span className="text-[10px] text-white/60 font-normal">Displayed on public lobby & tournament header</span>
                </label>
                <Input
                  placeholder="/images/banner1.jpg or https://..."
                  disabled={isSubmitting}
                  className="bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 focus:border-[#FFFF00] rounded-xl h-11"
                  {...register('banner_image')}
                />
                {errors.banner_image && <p className="text-xs text-red-300 mt-1 font-medium">{errors.banner_image.message}</p>}

                <div>
                  <span className="text-[11px] font-bold text-white/70 block mb-1.5">Quick Banner Presets:</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {BANNER_PRESETS.map((preset) => {
                      const isCurrent = watch('banner_image') === preset.url;
                      return (
                        <button
                          type="button"
                          key={preset.url}
                          onClick={() => setValue('banner_image', preset.url, { shouldValidate: true })}
                          className={`text-[11px] px-3 py-1.5 rounded-full font-bold border transition-all cursor-pointer ${
                            isCurrent
                              ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00]'
                              : 'bg-[#0A0A7A] hover:bg-white/10 text-white border-white/20'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {watch('banner_image') && (
                  <div className="relative w-full aspect-[21/9] min-h-[140px] max-h-[220px] rounded-2xl overflow-hidden border border-white/20 shadow-inner bg-[#0A0A7A]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={watch('banner_image') || '/images/banner1.jpg'}
                      alt="Banner Preview"
                      className="w-full h-full object-cover object-center"
                    />
                    <span className="absolute bottom-2 left-2 px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-xs text-white text-[10px] font-bold">
                      Live Banner Preview
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2: TOURNAMENT FORMAT */}
          {/* ========================================================================= */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <label className="text-xs font-bold text-white block mb-2 uppercase tracking-wider">
                  Select Competitive Format *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      id: 'knockout',
                      label: 'Knockout Bracket',
                      badge: 'Single Elimination',
                      desc: 'Classic playoff tree. Lose one match and you are eliminated. Quickest & highest excitement.',
                    },
                    {
                      id: 'league',
                      label: 'Round-Robin League',
                      badge: 'Full Season',
                      desc: 'Leaderboard points table. Every player plays all participants. Winner crowned with most points.',
                    },
                    {
                      id: 'group_knockout',
                      label: 'Group Stage + Knockout',
                      badge: 'Championship Style',
                      desc: 'Players divided into groups. Top qualifiers advance into a seeded knockout playoff bracket.',
                    },
                    {
                      id: 'single_league_knockout',
                      label: 'Single League + Eliminators',
                      badge: 'Coming in v2.0',
                      desc: 'Unified table with playoff cuts (Planned). Please select Group Stage + Knockout for current tournament seasons.',
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
                        className={`p-4 rounded-2xl border text-left transition-all ${
                          isDisabled
                            ? 'opacity-40 cursor-not-allowed border-white/10 bg-[#07075A]'
                            : isSelected
                            ? 'border-[#FFFF00] bg-[#FFFF00] text-[#08088F] shadow-lg scale-[1.01] cursor-pointer'
                            : 'border-white/20 bg-[#0A0A7A] text-white hover:border-white/40 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-sm font-black uppercase tracking-wider ${isSelected ? 'text-[#08088F]' : 'text-white'}`}>
                            {fmt.label}
                          </span>
                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                              isSelected ? 'bg-[#08088F] text-[#FFFF00]' : 'bg-white/10 text-white/70'
                            }`}
                          >
                            {fmt.badge}
                          </span>
                        </div>
                        <p className={`text-xs leading-relaxed ${isSelected ? 'text-[#08088F]/80 font-medium' : 'text-white/60'}`}>
                          {fmt.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {errors.format && <p className="text-xs text-red-300 mt-1 font-medium">{errors.format.message}</p>}
              </div>

              {/* Format Specific Parameters */}
              {(selectedFormat === 'group_knockout' || selectedFormat === 'single_league_knockout' || selectedFormat === 'league') && (() => {
                const maxP = formValues.max_participants || 16;
                const isPureLeague = selectedFormat === 'league';
                const isSingleLeague = selectedFormat === 'single_league_knockout' || isPureLeague;
                const rounds = formValues.rounds_per_pair || 1;
                const qualPerGroup = formValues.qualifiers_per_group || (isSingleLeague ? 8 : 2);
                const groupCount = isSingleLeague ? 1 : Math.max(2, Math.floor(maxP / 4));
                const playersPerGroup = Math.ceil(maxP / groupCount);
                const matchesPerGroup = Math.floor((playersPerGroup * (playersPerGroup - 1)) / 2) * rounds;
                const totalLeagueMatches = matchesPerGroup * groupCount;
                const totalQualifiers = isSingleLeague ? Math.min(qualPerGroup, maxP) : groupCount * qualPerGroup;

                return (
                  <div className="p-5 rounded-2xl bg-[#0A0A7A] border border-white/20 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-[#FFFF00] uppercase tracking-wider flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        <span>Round-Robin & Qualification Rules</span>
                      </h4>
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-[#FFFF00] text-[#08088F] uppercase tracking-wider">
                        Live Projection
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-white block mb-1">
                          Matches Per Opponent Pair
                        </label>
                        <select
                          {...register('rounds_per_pair', { valueAsNumber: true })}
                          className="w-full h-11 px-3 rounded-xl border border-white/20 bg-[#1818D4] text-xs font-bold text-white focus:outline-none focus:border-[#FFFF00]"
                        >
                          <option value={1}>1 Round (Single Round-Robin — 1 match against each opponent)</option>
                          <option value={2}>2 Rounds (Double Round-Robin — Home & Away)</option>
                          <option value={3}>3 Rounds</option>
                          <option value={4}>4 Rounds</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-white block mb-1">
                          {isPureLeague ? 'Top Leaderboard Cutoff' : 'Qualifiers Advancing to Knockouts'}
                        </label>
                        <select
                          {...register('qualifiers_per_group', { valueAsNumber: true })}
                          className="w-full h-11 px-3 rounded-xl border border-white/20 bg-[#1818D4] text-xs font-bold text-white focus:outline-none focus:border-[#FFFF00]"
                        >
                          <option value={2}>Top 2 Qualifiers</option>
                          <option value={4}>Top 4 Qualifiers</option>
                          <option value={6}>Top 6 Qualifiers</option>
                          <option value={8}>Top 8 Qualifiers (Standard)</option>
                          <option value={12}>Top 12 Qualifiers</option>
                          <option value={16}>Top 16 Qualifiers</option>
                        </select>
                      </div>
                    </div>

                    {/* Live Projection Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                      <div className="bg-[#1818D4] p-3 rounded-xl border border-white/10">
                        <span className="text-white/60 text-[10px] block">Group Division</span>
                        <span className="font-bold text-white">{isSingleLeague ? `1 League (${maxP} players)` : `${groupCount} Groups (${playersPerGroup} players/grp)`}</span>
                      </div>
                      <div className="bg-[#1818D4] p-3 rounded-xl border border-white/10">
                        <span className="text-white/60 text-[10px] block">Total Fixtures</span>
                        <span className="font-bold text-[#FFFF00]">{totalLeagueMatches} Matches</span>
                      </div>
                      <div className="bg-[#1818D4] p-3 rounded-xl border border-white/10">
                        <span className="text-white/60 text-[10px] block">Playoff Qualifiers</span>
                        <span className="font-bold text-[#FFFF00]">{isPureLeague ? 'Top of Table' : `${totalQualifiers} Players`}</span>
                      </div>
                      <div className="bg-[#1818D4] p-3 rounded-xl border border-white/10">
                        <span className="text-white/60 text-[10px] block">Round Count</span>
                        <span className="font-bold text-white">{rounds} Round{rounds > 1 ? 's' : ''} per pair</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3: REGISTRATION RULES & CAPACITY */}
          {/* ========================================================================= */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                  Maximum Participant Limit (Tournament Capacity) *
                </label>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-[11px] font-bold text-white/70">Standard Capacity Presets:</span>
                  {[8, 16, 32, 64, 128].map((size) => (
                    <button
                      type="button"
                      key={size}
                      onClick={() => setValue('max_participants', size, { shouldValidate: true })}
                      className={`text-xs px-3.5 py-1.5 rounded-full font-bold border transition-all cursor-pointer ${
                        maxParticipants === size
                          ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00]'
                          : 'bg-[#0A0A7A] hover:bg-white/10 text-white border-white/20'
                      }`}
                    >
                      {size} Players
                    </button>
                  ))}
                </div>
                <Input
                  type="number"
                  min={2}
                  max={1024}
                  disabled={isSubmitting}
                  className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-11 max-w-xs font-mono text-base font-bold"
                  {...register('max_participants', { valueAsNumber: true })}
                />
                {errors.max_participants && (
                  <p className="text-xs text-red-300 mt-1 font-medium">{errors.max_participants.message}</p>
                )}
              </div>

              {/* Player Verification Policy Info */}
              <div className="p-5 rounded-2xl bg-[#0A0A7A] border border-white/20 space-y-3">
                <div className="flex items-center gap-2 text-[#FFFF00]">
                  <ShieldAlert className="h-5 w-5" />
                  <h4 className="text-xs font-black uppercase tracking-wider">Player Eligibility Requirements</h4>
                </div>
                <p className="text-xs text-white/80 leading-relaxed">
                  Before a user is permitted to reserve or register for this tournament, the platform enforces strict verification:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-xl bg-[#1818D4] border border-white/10 flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <span className="font-bold text-white block">Verified eFootball ID</span>
                      <span className="text-white/60 text-[11px]">Format: ABCD-123-456-789. Verified against profile.</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#1818D4] border border-white/10 flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <span className="font-bold text-white block">Verified WhatsApp Contact</span>
                      <span className="text-white/60 text-[11px]">Required for match room invitation codes and dispute resolution.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 4: MATCH SETTINGS & RULES */}
          {/* ========================================================================= */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-5 rounded-2xl bg-[#0A0A7A] border border-white/20 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-[#FFFF00] uppercase tracking-wider flex items-center gap-2">
                    <Gamepad2 className="h-4 w-4" />
                    <span>eFootball Competitive Gameplay Settings</span>
                  </h4>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                    Official eFootball Config
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-white/80 block mb-1 uppercase">Match Duration</label>
                    <select
                      value={matchLength}
                      onChange={(e) => setMatchLength(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-white/20 bg-[#1818D4] text-xs font-bold text-white"
                    >
                      <option value="8">8 Minutes (Standard)</option>
                      <option value="10">10 Minutes</option>
                      <option value="6">6 Minutes</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-white/80 block mb-1 uppercase">Extra Time (ET)</label>
                    <button
                      type="button"
                      onClick={() => setExtraTime(!extraTime)}
                      className={`w-full h-10 px-3 rounded-xl border font-bold text-xs transition-colors cursor-pointer ${
                        extraTime ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300' : 'bg-red-500/20 border-red-400 text-red-300'
                      }`}
                    >
                      {extraTime ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-white/80 block mb-1 uppercase">Penalty Shootout (PK)</label>
                    <button
                      type="button"
                      onClick={() => setPenalties(!penalties)}
                      className={`w-full h-10 px-3 rounded-xl border font-bold text-xs transition-colors cursor-pointer ${
                        penalties ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300' : 'bg-red-500/20 border-red-400 text-red-300'
                      }`}
                    >
                      {penalties ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-white/60">Generate rules text with the current eFootball settings above:</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applyRulesPreset}
                    className="gap-1.5 text-xs font-bold text-[#08088F] bg-[#FFFF00] hover:bg-[#E6E600] border-none rounded-full cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Apply Settings to Rules</span>
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                  Full Rules & Guidelines Text *
                </label>
                <textarea
                  className="w-full min-h-[180px] rounded-xl border border-white/20 bg-[#0A0A7A] p-3 text-xs text-white placeholder:text-white/40 focus-visible:outline-none focus:border-[#FFFF00] font-mono leading-relaxed"
                  placeholder="Detailed competitive rules, room hosting guidelines, disconnect rules..."
                  disabled={isSubmitting}
                  {...register('rules_text')}
                />
                {errors.rules_text && <p className="text-xs text-red-300 mt-1 font-medium">{errors.rules_text.message}</p>}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 5: PRIZE CONFIGURATION */}
          {/* ========================================================================= */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <label className="text-xs font-bold text-white block mb-2 uppercase tracking-wider">
                  Tournament Pricing Model *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                  <button
                    type="button"
                    onClick={() => {
                      setValue('is_paid', false);
                      setValue('entry_fee_rupees', 0);
                    }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      !isPaid
                        ? 'border-[#FFFF00] bg-[#FFFF00] text-[#08088F] shadow-lg'
                        : 'border-white/20 bg-[#0A0A7A] text-white hover:border-white/40'
                    }`}
                  >
                    <span className={`block text-xs font-black uppercase tracking-wider ${!isPaid ? 'text-[#08088F]' : 'text-white'}`}>
                      Free Tournament
                    </span>
                    <span className={`block text-[11px] mt-0.5 ${!isPaid ? 'text-[#08088F]/80 font-bold' : 'text-white/60'}`}>
                      No entry fee required. Any verified player can register immediately.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setValue('is_paid', true);
                      if (entryFeeRupees === 0) setValue('entry_fee_rupees', 50);
                    }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      isPaid
                        ? 'border-[#FFFF00] bg-[#FFFF00] text-[#08088F] shadow-lg'
                        : 'border-white/20 bg-[#0A0A7A] text-white hover:border-white/40'
                    }`}
                  >
                    <span className={`block text-xs font-black uppercase tracking-wider ${isPaid ? 'text-[#08088F]' : 'text-white'}`}>
                      Paid Tournament
                    </span>
                    <span className={`block text-[11px] mt-0.5 ${isPaid ? 'text-[#08088F]/80 font-bold' : 'text-white/60'}`}>
                      Players pay an entry fee. Slot holds 12-minute reservation during checkout.
                    </span>
                  </button>
                </div>
              </div>

              {isPaid && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 rounded-2xl bg-[#0A0A7A] border border-white/20">
                  <div>
                    <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider flex items-center justify-between">
                      <span>Entry Fee (₹ INR) *</span>
                      <span className="text-[10px] text-[#FFFF00] font-mono font-bold">
                        {entryFeeRupees * 100} paise
                      </span>
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={50000}
                      placeholder="e.g. 50"
                      disabled={isSubmitting}
                      className="bg-[#1818D4] border-white/20 text-white rounded-xl h-11 text-base font-bold font-mono"
                      {...register('entry_fee_rupees', { valueAsNumber: true })}
                    />
                    {errors.entry_fee_rupees && (
                      <p className="text-xs text-red-300 mt-1 font-medium">{errors.entry_fee_rupees.message}</p>
                    )}
                    <p className="text-[11px] text-white/60 mt-1">
                      The displayed entry fee is the exact total amount paid by the player in Indian Rupees.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider flex items-center justify-between">
                      <span>Prize Pool (₹ INR)</span>
                      <span className="text-[10px] text-[#FFFF00] font-mono font-bold">
                        {prizePoolRupees * 100} paise
                      </span>
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={10000000}
                      placeholder="e.g. 1000"
                      disabled={isSubmitting}
                      className="bg-[#1818D4] border-white/20 text-white rounded-xl h-11 text-base font-bold font-mono"
                      {...register('prize_pool_rupees', { valueAsNumber: true })}
                    />
                    {errors.prize_pool_rupees && (
                      <p className="text-xs text-red-300 mt-1 font-medium">{errors.prize_pool_rupees.message}</p>
                    )}
                    <p className="text-[11px] text-white/60 mt-1">
                      Total prize money distributed to champions / runners up.
                    </p>
                  </div>
                </div>
              )}

              {/* Financial Projection & Policy Summary */}
              <div className="p-5 rounded-2xl bg-[#0A0A7A] border border-white/20 space-y-3">
                <h4 className="text-xs font-black text-[#FFFF00] uppercase tracking-wider flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  <span>Financial Projection & Prize Distribution Notice</span>
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                  <div className="bg-[#1818D4] p-3 rounded-xl border border-white/10">
                    <span className="text-white/60 text-[10px] block">Max Capacity</span>
                    <span className="font-bold text-white">{maxParticipants} Players</span>
                  </div>
                  <div className="bg-[#1818D4] p-3 rounded-xl border border-white/10">
                    <span className="text-white/60 text-[10px] block">Entry Fee</span>
                    <span className="font-bold text-white">{isPaid ? `₹${entryFeeRupees}` : 'FREE'}</span>
                  </div>
                  <div className="bg-[#1818D4] p-3 rounded-xl border border-white/10">
                    <span className="text-white/60 text-[10px] block">Gross Projected</span>
                    <span className="font-bold text-[#FFFF00]">₹{projectedGross.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="bg-[#1818D4] p-3 rounded-xl border border-white/10">
                    <span className="text-white/60 text-[10px] block">Prize Pool</span>
                    <span className="font-bold text-emerald-400">₹{prizePoolRupees.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white/70 flex items-start gap-2.5">
                  <Info className="h-4 w-4 text-[#FFFF00] shrink-0 mt-0.5" />
                  <span>
                    <strong>Tournament Policy:</strong> A paid tournament slot is reserved for exactly 12 minutes during player checkout. Prize pool distribution is handled manually by tournament administrators post-completion.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 6: REVIEW & PUBLICATION */}
          {/* ========================================================================= */}
          {currentStep === 6 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-5 rounded-2xl bg-[#0A0A7A] border border-white/20 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-[#FFFF00] uppercase tracking-wider flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    <span>Configuration Review Summary</span>
                  </h3>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                    Ready for Deployment
                  </span>
                </div>

                {/* Banner & Title preview */}
                <div className="relative w-full aspect-[21/9] min-h-[140px] max-h-[180px] rounded-2xl overflow-hidden border border-white/20 shadow-inner">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={formValues.banner_image || '/images/banner1.jpg'}
                    alt="Cover"
                    className="w-full h-full object-cover object-center"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 flex flex-col justify-end">
                    <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider font-display">
                      {formValues.name || 'Untitled Tournament'}
                    </h2>
                    <span className="text-xs text-white/80 line-clamp-1">{formValues.description || 'No description provided'}</span>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
                  <div className="p-3 rounded-xl bg-[#1818D4] border border-white/10">
                    <span className="text-white/60 text-[10px] uppercase block">Format</span>
                    <span className="font-bold text-white capitalize">{selectedFormat.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#1818D4] border border-white/10">
                    <span className="text-white/60 text-[10px] uppercase block">Max Capacity</span>
                    <span className="font-bold text-[#FFFF00]">{maxParticipants} Slots</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#1818D4] border border-white/10">
                    <span className="text-white/60 text-[10px] uppercase block">Pricing</span>
                    <span className="font-bold text-emerald-400">{isPaid ? `₹${entryFeeRupees} INR` : 'FREE'}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#1818D4] border border-white/10">
                    <span className="text-white/60 text-[10px] uppercase block">Prize Pool</span>
                    <span className="font-bold text-emerald-400">₹{prizePoolRupees.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Schedule & Rules preview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-[#1818D4] border border-white/10 space-y-1">
                    <span className="font-bold text-[#FFFF00] uppercase text-[10px] tracking-wider block">Dates & Deadlines</span>
                    <p className="text-white/80">Start: {formValues.start_date || 'Not set'}</p>
                    <p className="text-white/80">End: {formValues.end_date || 'Not set'}</p>
                    <p className="text-white/80">Reg Deadline: {formValues.registration_deadline || 'Not set'}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#1818D4] border border-white/10 space-y-1">
                    <span className="font-bold text-[#FFFF00] uppercase text-[10px] tracking-wider block">Match Rules</span>
                    <p className="text-white/80 line-clamp-3 font-mono text-[11px]">{formValues.rules_text}</p>
                  </div>
                </div>
              </div>

              {/* Validation Checklist */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-xs">
                <span className="font-bold text-white uppercase text-[10px] tracking-wider block">Pre-Publication Checklist</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>Tournament Name: &quot;{formValues.name}&quot;</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>Format: {selectedFormat.replace(/_/g, ' ')} ({maxParticipants} participants)</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>Rules: Standard 8-min eFootball match settings applied</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>Pricing: {isPaid ? `Paid (₹${entryFeeRupees} / slot)` : 'Free tournament'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* NAVIGATION FOOTER */}
          {/* ========================================================================= */}
          <div className="pt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-white/10">
            <div className="w-full sm:w-auto">
              {currentStep > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={prevStep}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto rounded-full border-white/30 text-white hover:bg-white/10 font-bold px-6 h-11 gap-2 cursor-pointer justify-center"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Previous Step</span>
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              {currentStep < 6 ? (
                <Button
                  type="button"
                  onClick={nextStep}
                  className="w-full sm:w-auto bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black rounded-full px-8 h-11 gap-2 shadow-lg uppercase tracking-wider cursor-pointer justify-center"
                >
                  <span>Continue to Step {currentStep + 1}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                  <Button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => submitTournament('draft')}
                    className="w-full sm:w-auto bg-[#0A0A7A] hover:bg-[#0A0A7A]/80 text-white border border-white/30 font-bold rounded-full px-6 h-11 gap-2 cursor-pointer justify-center"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
                        <span>Save as Draft</span>
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => submitTournament('registration')}
                    className="w-full sm:w-auto bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black rounded-full px-8 h-11 gap-2 shadow-lg uppercase tracking-wider cursor-pointer justify-center"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" />
                        <span>Publishing...</span>
                      </>
                    ) : (
                      <>
                        <Trophy className="h-4 w-4 text-[#08088F]" />
                        <span>Publish & Open Registration</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
