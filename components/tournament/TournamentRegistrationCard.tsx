'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Trophy,
  CheckCircle2,
  Users,
  AlertCircle,
  LogIn,
  Loader2,
  Sparkles,
  Gamepad2,
  ArrowRight,
  Clock,
  ShieldAlert,
  MessageSquare,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { registerForTournamentAction } from '@/app/actions/playerActions';
import { cancelRegistrationRequestAction } from '@/app/actions/paymentRegistrationActions';
import { getManualPaymentSettings, DEFAULT_MANUAL_PAYMENT_SETTINGS } from '@/services/paymentSettingsService';
import { generateWhatsAppPaymentLink } from '@/lib/whatsappPayment';
import { playConnecting } from '@/src/lib/sounds/sound-manager';
import type { TournamentWithStats } from '@/services/tournamentService';
import type { ManualPaymentSettings, RegistrationStatus } from '@/types/database';

interface TournamentRegistrationCardProps {
  tournament: TournamentWithStats;
  onRegisteredSuccess?: () => void;
}

export function TournamentRegistrationCard({
  tournament,
  onRegisteredSuccess,
}: TournamentRegistrationCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [registrationRecord, setRegistrationRecord] = useState<any>(null);
  const [paymentSettings, setPaymentSettings] = useState<ManualPaymentSettings>(DEFAULT_MANUAL_PAYMENT_SETTINGS);
  const [loadingUser, setLoadingUser] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const isRegistrationOpen = tournament.status === 'registration';
  const participantCount = tournament.participant_count ?? 0;
  const maxParticipants = tournament.max_participants || 32;
  const isFull = participantCount >= maxParticipants;
  const slotsRemaining = Math.max(0, maxParticipants - participantCount);

  const isPaidTournament = Boolean(tournament.is_paid && (tournament.entry_fee_paise || 0) > 0);
  const entryFeeINR = Math.round((tournament.entry_fee_paise || 0) / 100);

  // Check user session, registration status & payment settings
  const checkAuthAndRegistration = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoadingUser(false);
        return;
      }

      setCurrentUser(user);

      // Fetch user profile, participant, registration, and payment settings in parallel
      const [profileRes, partRes, regRes, settingsData] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase
          .from('participants')
          .select('*')
          .eq('tournament_id', tournament.id)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('tournament_registrations')
          .select('*')
          .eq('tournament_id', tournament.id)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        getManualPaymentSettings(supabase),
      ]);

      if (profileRes.data) setUserProfile(profileRes.data);
      if (settingsData) setPaymentSettings(settingsData);

      const isPart = Boolean(partRes.data);
      const reg = (regRes.data as any) || null;
      setIsRegistered(Boolean(isPart || (reg && (reg.status === 'approved' || reg.status === 'confirmed'))));
      setRegistrationRecord(reg);
    } catch (err) {
      console.error('Error checking registration status:', err);
    } finally {
      setLoadingUser(false);
    }
  }, [tournament.id]);

  useEffect(() => {
    checkAuthAndRegistration();
  }, [checkAuthAndRegistration]);

  // Profile completeness check
  const efootballId = userProfile?.efootball_id || currentUser?.user_metadata?.efootball_id;
  const isProfileComplete = Boolean(efootballId && efootballId.trim().length > 0);

  /**
   * Registration handler:
   * - Free: Instantly confirms participant
   * - Paid: Creates pending_payment registration and immediately redirects/opens WhatsApp (no payment modal)
   */
  const handleRegistration = async () => {
    setIsRegistering(true);
    setFeedback(null);
    setConfirmModalOpen(false);

    try {
      const res = await registerForTournamentAction(tournament.id, { rulesAccepted: true });
      if (res.success) {
        playConnecting();

        if (res.data?.isPaid && res.data?.registrationId) {
          // Paid tournament: Build prefilled WhatsApp link and immediately open
          const waUrl = generateWhatsAppPaymentLink({
            adminWhatsAppNumber: paymentSettings.admin_whatsapp_number || '+919207516227',
            tournamentName: tournament.name,
            tournamentId: tournament.id,
            registrationId: res.data.registrationId,
            userName: userProfile?.display_name || currentUser?.user_metadata?.full_name || 'Player',
            efootballId: efootballId || 'Not set',
            userPhone: userProfile?.whatsapp_number || '',
            entryFeeINR,
          });

          // Open WhatsApp immediately in new tab / window
          if (typeof window !== 'undefined') {
            const opened = window.open(waUrl, '_blank');
            if (!opened) {
              window.location.assign(waUrl);
            }
          }

          setRegistrationRecord({
            id: res.data.registrationId,
            status: 'pending_payment',
          });

          setFeedback({
            message: 'Registration request created! Please send the pre-filled WhatsApp message to the admin to complete payment.',
            type: 'info',
          });
        } else {
          // Free tournament: Instant confirmation
          setIsRegistered(true);
          setFeedback({
            message: `Congratulations! You are officially registered for ${tournament.name}.`,
            type: 'success',
          });
          if (onRegisteredSuccess) {
            onRegisteredSuccess();
          }
        }

        router.refresh();
      } else {
        setFeedback({ message: res.message || 'Registration failed.', type: 'error' });
      }
    } catch {
      setFeedback({ message: 'A network error occurred. Please try again.', type: 'error' });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!registrationRecord?.id) return;
    if (!window.confirm('Are you sure you want to cancel this registration request?')) return;

    setIsCancelling(true);
    try {
      const res = await cancelRegistrationRequestAction(registrationRecord.id);
      if (res.success) {
        setFeedback({ message: 'Registration request cancelled.', type: 'info' });
        await checkAuthAndRegistration();
        router.refresh();
      } else {
        setFeedback({ message: res.message || 'Failed to cancel request.', type: 'error' });
      }
    } catch {
      setFeedback({ message: 'Error cancelling request.', type: 'error' });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRegisterClick = () => {
    setConfirmModalOpen(true);
  };

  const loginRedirectUrl = `/auth/login?next=${encodeURIComponent(pathname || `/tournaments/${tournament.id}`)}`;

  // Status badge details
  const regStatus = registrationRecord?.status as RegistrationStatus | undefined;

  // Prefilled WhatsApp link for active registration
  const activeWhatsAppUrl = registrationRecord?.id
    ? generateWhatsAppPaymentLink({
        adminWhatsAppNumber: paymentSettings.admin_whatsapp_number || '+919207516227',
        tournamentName: tournament.name,
        tournamentId: tournament.id,
        registrationId: registrationRecord.id,
        userName: userProfile?.display_name || currentUser?.user_metadata?.full_name || 'Player',
        efootballId: efootballId || 'Not set',
        userPhone: userProfile?.whatsapp_number || '',
        entryFeeINR,
      })
    : null;

  return (
    <>
      <Card className="relative overflow-hidden bg-[#1D1DE0] border border-white/20 shadow-2xl rounded-[28px] p-6 sm:p-7 space-y-6 text-white">
        {/* Top Banner & Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/15 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-[#08088F] text-[#FFFF00] font-black text-[10px] tracking-wider uppercase px-3 py-1 rounded-full">
                TOURNAMENT ENTRY
              </Badge>
              {isPaidTournament ? (
                <Badge className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] uppercase px-3 py-1 rounded-full border-0">
                  ENTRY FEE: ₹{entryFeeINR}
                </Badge>
              ) : (
                <Badge className="bg-emerald-400 text-emerald-950 font-black text-[10px] uppercase px-3 py-1 rounded-full border-0">
                  FREE ENTRY
                </Badge>
              )}
              {isRegistrationOpen ? (
                <Badge className="bg-white/20 text-white font-black text-[10px] uppercase px-3 py-1 rounded-full border-0">
                  REGISTRATION OPEN
                </Badge>
              ) : (
                <Badge variant="outline" className="font-extrabold text-[10px] uppercase text-white border-white/30 rounded-full">
                  {tournament.status}
                </Badge>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase font-display tracking-tight">
              {isRegistrationOpen ? 'Reserve Your Competitor Slot' : 'Tournament Registration'}
            </h2>
          </div>

          {/* Capacity Counter */}
          <div className="flex items-center gap-3 bg-[#1010C5] border border-white/15 px-4 py-2 rounded-2xl shrink-0">
            <Users className="h-4 w-4 text-[#FFFF00]" />
            <div>
              <span className="text-xs font-black text-white block">
                {participantCount} / {maxParticipants} Slots Filled
              </span>
              <span className="text-[10px] text-[#D9DCFF] block font-semibold">
                {isFull ? 'Tournament Full' : `${slotsRemaining} slots remaining`}
              </span>
            </div>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between border ${
              feedback.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                : feedback.type === 'info'
                ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                : 'bg-rose-500/20 text-rose-200 border-rose-400/40'
            }`}
          >
            <span>{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="underline ml-4 hover:no-underline shrink-0 font-bold cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        {/* Registration State Actions */}
        {loadingUser ? (
          <div className="py-6 flex items-center justify-center gap-2 text-xs font-semibold text-white/70">
            <Loader2 className="h-4 w-4 animate-spin text-[#FFFF00]" />
            <span>Checking registration eligibility...</span>
          </div>
        ) : isRegistered || regStatus === 'approved' || regStatus === 'confirmed' ? (
          /* State 1: Officially Confirmed Participant */
          <div className="p-5 rounded-3xl bg-[#1010C5] border border-[#FFFF00]/40 space-y-3">
            <div className="flex items-center gap-2 text-[#FFFF00] font-black text-sm">
              <CheckCircle2 className="h-5 w-5 text-[#FFFF00]" />
              <span>You Are Officially Registered!</span>
            </div>
            <p className="text-xs text-[#D9DCFF] font-medium leading-relaxed">
              Your slot in this tournament is secured. Match fixtures, room names, and opponent pairings will appear on your dashboard once generated.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Button asChild size="sm" className="bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] text-xs font-black rounded-full h-10 px-5 shadow-md">
                <Link href="/dashboard/tournaments">
                  <span>View My Tournaments</span>
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="text-xs font-bold rounded-full h-10 px-5 border-white/40 text-white hover:bg-white/10">
                <Link href="/dashboard/matches">
                  <span>Check Match Schedule</span>
                </Link>
              </Button>
            </div>
          </div>
        ) : regStatus === 'pending_payment' || regStatus === 'payment_submitted' ? (
          /* State 2: Registration Pending — WhatsApp Communication Required */
          <div className="p-5 rounded-3xl bg-[#1010C5] border border-[#FFFF00]/50 space-y-3">
            <div className="flex items-center gap-2 text-[#FFFF00] font-black text-sm">
              <MessageSquare className="h-5 w-5 text-[#FFFF00]" />
              <span>Registration Pending — Complete on WhatsApp</span>
            </div>
            <p className="text-xs text-[#D9DCFF] leading-relaxed">
              Your registration request has been created. Chat directly with the admin on WhatsApp to complete payment (₹{entryFeeINR} INR) and confirm your competitor slot.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              {activeWhatsAppUrl && (
                <Button
                  asChild
                  size="sm"
                  className="bg-[#00C853] hover:bg-[#00B048] text-[#072418] text-xs font-black rounded-full h-10 px-5 shadow-lg gap-2 cursor-pointer"
                >
                  <a href={activeWhatsAppUrl} target="_blank" rel="noopener noreferrer">
                    <MessageSquare className="h-4 w-4" />
                    <span>Open WhatsApp Chat</span>
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancelRequest}
                disabled={isCancelling}
                className="text-xs font-bold rounded-full h-10 px-4 border-white/40 text-rose-300 hover:bg-rose-500/20 hover:text-white"
              >
                {isCancelling ? 'Cancelling...' : 'Cancel Request'}
              </Button>
            </div>
          </div>
        ) : regStatus === 'under_verification' ? (
          /* State 3: Admin actively verifying */
          <div className="p-5 rounded-3xl bg-[#1010C5] border border-amber-400/50 space-y-3">
            <div className="flex items-center gap-2 text-amber-300 font-black text-sm">
              <Clock className="h-5 w-5 text-amber-300 animate-pulse" />
              <span>Admin Is Verifying Your Registration</span>
            </div>
            <p className="text-xs text-[#D9DCFF] leading-relaxed">
              An administrator is reviewing your registration on WhatsApp. Your slot will be finalized shortly.
            </p>
            <div className="pt-1 flex items-center gap-2">
              {activeWhatsAppUrl && (
                <Button
                  asChild
                  size="sm"
                  className="bg-[#00C853] hover:bg-[#00B048] text-[#072418] text-xs font-black rounded-full h-9 px-4 gap-1.5 shadow-sm"
                >
                  <a href={activeWhatsAppUrl} target="_blank" rel="noopener noreferrer">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Chat on WhatsApp</span>
                  </a>
                </Button>
              )}
            </div>
          </div>
        ) : regStatus === 'rejected' ? (
          /* State 4: Rejected */
          <div className="p-5 rounded-3xl bg-[#1010C5] border border-rose-400/50 space-y-3">
            <div className="flex items-center gap-2 text-rose-300 font-black text-sm">
              <AlertCircle className="h-5 w-5 text-rose-300" />
              <span>Registration Request Rejected</span>
            </div>
            <p className="text-xs text-[#D9DCFF]">
              Reason: <strong className="text-white">{registrationRecord?.rejection_reason || 'Registration not approved.'}</strong>
            </p>
            <div className="pt-2 flex items-center gap-3">
              <Button
                size="sm"
                onClick={handleRegisterClick}
                className="bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] text-xs font-black rounded-full h-9 px-4"
              >
                <span>Re-apply for Tournament</span>
              </Button>
              {activeWhatsAppUrl && (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="text-xs font-bold rounded-full h-9 px-4 border-white/30 text-white hover:bg-white/10 gap-1.5"
                >
                  <a href={activeWhatsAppUrl} target="_blank" rel="noopener noreferrer">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Contact Admin</span>
                  </a>
                </Button>
              )}
            </div>
          </div>
        ) : !currentUser ? (
          /* State 5: Visitor is Not Logged In */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#1010C5] border border-white/15">
            <div className="space-y-1">
              <span className="text-sm font-black text-white block">
                Player Account Required
              </span>
              <p className="text-xs text-[#D9DCFF] max-w-md">
                Sign in or create a player profile with your eFootball ID to register for this tournament.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button asChild className="bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs rounded-full h-10 px-5 shadow-md gap-1.5">
                <Link href={loginRedirectUrl}>
                  <LogIn className="h-4 w-4" />
                  <span>Sign In to Register</span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="text-xs font-bold rounded-full h-10 px-4 border-white/40 text-white hover:bg-white/10">
                <Link href={`/signup?next=${encodeURIComponent(pathname || `/tournaments/${tournament.id}`)}`}>
                  Sign Up
                </Link>
              </Button>
            </div>
          </div>
        ) : isFull ? (
          /* State 6: Tournament is Full */
          <div className="p-5 rounded-3xl bg-[#1010C5] border border-amber-400/50 text-white text-xs space-y-1">
            <span className="font-extrabold flex items-center gap-1.5 text-amber-300">
              <AlertCircle className="h-4 w-4 text-amber-300" />
              Tournament Has Reached Maximum Capacity
            </span>
            <p className="text-[#D9DCFF]">
              All {maxParticipants} competitor slots have been filled. Keep an eye on open tournaments for the next season!
            </p>
          </div>
        ) : !isRegistrationOpen ? (
          /* State 7: Registration is Closed */
          <div className="p-5 rounded-3xl bg-[#1010C5] border border-white/20 text-white text-xs space-y-1">
            <span className="font-extrabold flex items-center gap-1.5 text-[#FFFF00]">
              <Clock className="h-4 w-4 text-[#FFFF00]" />
              Registration is Closed
            </span>
            <p className="text-[#D9DCFF]">
              This tournament is currently in status &quot;{tournament.status}&quot;. Registration is not being accepted.
            </p>
          </div>
        ) : !isProfileComplete ? (
          /* State 8: Incomplete Profile Warning */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#1010C5] border border-amber-400/40 text-white text-xs">
            <div className="space-y-1">
              <span className="font-bold flex items-center gap-1.5 text-amber-300 text-sm">
                <ShieldAlert className="h-4 w-4" />
                eFootball ID Required
              </span>
              <p className="text-[#D9DCFF]">
                Please add your verified eFootball ID to your profile before registering.
              </p>
            </div>
            <Button asChild size="sm" className="bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black rounded-full h-10 px-5 shrink-0">
              <Link href="/dashboard/profile">Complete Profile</Link>
            </Button>
          </div>
        ) : (
          /* State 9: Eligible to Register */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#1010C5] border border-white/20">
              <div className="space-y-1">
                <span className="text-sm font-black text-white flex items-center gap-1.5 font-display">
                  <Gamepad2 className="h-4 w-4 text-[#FFFF00]" />
                  Registering as: {userProfile?.display_name || currentUser.user_metadata?.full_name || 'Player'}
                </span>
                <p className="text-xs text-[#D9DCFF] font-mono">
                  eFootball ID: <strong className="text-white font-bold">{efootballId}</strong>
                </p>
              </div>

              <Button
                onClick={handleRegisterClick}
                disabled={isRegistering}
                className="bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs rounded-full h-11 px-6 shadow-xl gap-2 shrink-0 uppercase tracking-wider"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Registering...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>{isPaidTournament ? `Register & Pay via WhatsApp` : 'Register for Tournament'}</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {confirmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 border border-slate-200 text-[#0A0D14] animate-in zoom-in-95 duration-200">
              <div className="space-y-2">
                <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-[#00C853] flex items-center justify-center border border-emerald-100">
                  <Trophy className="h-6 w-6 text-[#00C853]" />
                </div>
                <h3 className="text-xl font-black text-[#0A0D14] uppercase tracking-tight font-display">
                  Confirm Tournament Registration
                </h3>
                <p className="text-xs text-[#1E232E] font-medium leading-relaxed">
                  You are about to register for <strong className="text-[#0A0D14] font-black">{tournament.name}</strong>.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[#475569] font-bold">Competitor Name:</span>
                  <span className="font-extrabold text-[#0A0D14] text-sm">
                    {userProfile?.display_name || currentUser?.user_metadata?.full_name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#475569] font-bold">eFootball ID:</span>
                  <span className="font-mono font-black text-[#0A0D14] text-sm tracking-wide bg-white px-2.5 py-0.5 rounded-lg border border-[#E2E8F0]">
                    {efootballId}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#475569] font-bold">Format:</span>
                  <span className="font-extrabold text-[#0A0D14] capitalize">
                    {tournament.format?.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-[#E2E8F0] pt-2.5 text-sm font-black text-[#0A0D14]">
                  <span>Entry:</span>
                  {isPaidTournament ? (
                    <span className="text-[#08088F] font-black">₹{entryFeeINR} INR</span>
                  ) : (
                    <span className="text-emerald-600 font-black">Free Entry</span>
                  )}
                </div>
              </div>

              {tournament.rules_text && (
                <div className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs max-h-28 overflow-y-auto space-y-1">
                  <span className="font-bold text-[#0A0D14] block text-[10px] uppercase tracking-wider">Tournament Rules:</span>
                  <p className="whitespace-pre-line text-[11px] text-[#1E232E] font-medium leading-relaxed">{tournament.rules_text}</p>
                </div>
              )}

              {isPaidTournament && (
                <p className="text-[11px] text-[#1E232E] bg-emerald-50 p-3 rounded-xl border border-emerald-200 font-medium leading-relaxed">
                  💬 Confirming will register your request and immediately open WhatsApp with a prefilled message to the tournament admin.
                </p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmModalOpen(false)}
                  disabled={isRegistering}
                  className="flex-1 rounded-xl text-xs font-black h-11 border-2 border-slate-300 bg-white text-[#0A0D14] hover:bg-slate-100 hover:border-slate-400 hover:text-black transition-all shadow-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleRegistration}
                  disabled={isRegistering}
                  className="flex-1 font-black text-xs rounded-xl h-11 shadow-sm uppercase tracking-wider transition-all disabled:opacity-50 bg-[#00C853] hover:bg-[#00B048] text-[#072418]"
                >
                  {isRegistering ? (
                    <Loader2 className="h-4 w-4 animate-spin text-current" />
                  ) : (
                    isPaidTournament ? 'Confirm & Open WhatsApp' : 'Confirm & Join'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
