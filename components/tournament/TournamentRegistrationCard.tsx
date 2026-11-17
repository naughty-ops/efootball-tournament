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
  Copy,
  Check,
  Wallet,
  PlusCircle,
  RefreshCw,
  AlertTriangle,
  ArrowDownRight,
  ShieldCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { registerForTournamentAction, cancelRegistrationAction } from '@/app/actions/playerActions';
import { getPlayerWalletBalanceAction, getWalletPaymentSettingsAction } from '@/app/actions/walletActions';
import { cancelRegistrationRequestAction } from '@/app/actions/paymentRegistrationActions';
import { getManualPaymentSettings, DEFAULT_MANUAL_PAYMENT_SETTINGS } from '@/services/paymentSettingsService';
import { generateWhatsAppPaymentLink, generateWhatsAppPaymentMessageText } from '@/lib/whatsappPayment';
import { playConnecting } from '@/src/lib/sounds/sound-manager';
import { calculatePrizeSplit } from '@/lib/utils';
import AddMoneyModal from '@/components/wallet/AddMoneyModal';
import type { TournamentWithStats } from '@/services/tournamentService';
import type { ManualPaymentSettings, RegistrationStatus } from '@/types/database';
import type { WalletPaymentSettings } from '@/types/wallet';

interface TournamentRegistrationCardProps {
  tournament: TournamentWithStats;
  onRegisteredSuccess?: () => void;
}

interface PlayerWalletData {
  availableBalancePaise: number;
  availableBalanceInr: number;
  lockedBalancePaise: number;
  lockedBalanceInr: number;
  walletStatus: string;
}

export function TournamentRegistrationCard({
  tournament,
  onRegisteredSuccess,
}: TournamentRegistrationCardProps) {
  const router = useRouter();
  const rawPathname = usePathname();
  const pathname = rawPathname || '';

  // User & Profile State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Registration State
  const [isRegistered, setIsRegistered] = useState(false);
  const [registrationRecord, setRegistrationRecord] = useState<any>(null);
  const [participantRecord, setParticipantRecord] = useState<any>(null);

  // Wallet State
  const [walletData, setWalletData] = useState<PlayerWalletData | null>(null);
  const [walletSettings, setWalletSettings] = useState<WalletPaymentSettings | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);

  // Settings & WhatsApp Fallback
  const [paymentSettings, setPaymentSettings] = useState<ManualPaymentSettings>(DEFAULT_MANUAL_PAYMENT_SETTINGS);

  // Action States
  const [isRegistering, setIsRegistering] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modals
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [addFundsModalOpen, setAddFundsModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  // Tournament Derived Values
  const isRegistrationOpen = tournament.status === 'registration';
  const participantCount = tournament.participant_count ?? 0;
  const maxParticipants = tournament.max_participants || 32;
  const isFull = participantCount >= maxParticipants;
  const slotsRemaining = Math.max(0, maxParticipants - participantCount);

  const isPaidTournament = Boolean(tournament.is_paid && (tournament.entry_fee_paise || 0) > 0);
  const entryFeePaise = tournament.entry_fee_paise || 0;
  const entryFeeINR = Math.round(entryFeePaise / 100);
  const prizeSplit = calculatePrizeSplit(tournament);

  // Financial Calculations
  const availableWalletInr = walletData?.availableBalanceInr ?? 0;
  const hasSufficientBalance = availableWalletInr >= entryFeeINR;
  const balanceShortfallInr = Math.max(0, entryFeeINR - availableWalletInr);
  const balanceAfterRegistrationInr = Math.max(0, availableWalletInr - entryFeeINR);

  // Refresh wallet balance
  const refreshWalletBalance = useCallback(async () => {
    setIsRefreshingBalance(true);
    try {
      const balanceRes = await getPlayerWalletBalanceAction();
      if (balanceRes.success && balanceRes.data) {
        setWalletData(balanceRes.data);
      }
    } catch (err) {
      console.error('Error refreshing wallet balance:', err);
    } finally {
      setIsRefreshingBalance(false);
    }
  }, []);

  // Check user session, registration status, wallet balance & settings
  const checkAuthAndRegistration = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoadingUser(false);
        return;
      }

      setCurrentUser(user);
      setLoadingWallet(true);

      // Fetch user profile, participant, registration, wallet, and settings in parallel
      const [profileRes, partRes, regRes, settingsData, walletRes, walletSetRes] = await Promise.all([
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
        getPlayerWalletBalanceAction(),
        getWalletPaymentSettingsAction(),
      ]);

      if (profileRes.data) setUserProfile(profileRes.data);
      if (settingsData) setPaymentSettings(settingsData);
      if (partRes.data) setParticipantRecord(partRes.data);
      if (walletRes.success && walletRes.data) setWalletData(walletRes.data);
      if (walletSetRes.success && walletSetRes.data) setWalletSettings(walletSetRes.data);

      const isPart = Boolean(partRes.data);
      const reg = (regRes.data as any) || null;
      setIsRegistered(Boolean(isPart || (reg && (reg.status === 'approved' || reg.status === 'confirmed'))));
      setRegistrationRecord(reg);
    } catch (err) {
      console.error('Error checking registration status:', err);
    } finally {
      setLoadingUser(false);
      setLoadingWallet(false);
    }
  }, [tournament.id]);

  useEffect(() => {
    checkAuthAndRegistration();
  }, [checkAuthAndRegistration]);

  // Profile completeness check
  const efootballId = userProfile?.efootball_id || currentUser?.user_metadata?.efootball_id;
  const isProfileComplete = Boolean(efootballId && efootballId.trim().length > 0);
  const isWhatsappVerified = Boolean(
    userProfile?.whatsapp_verified === true || userProfile?.whatsapp_verification_status === 'verified'
  );

  const handleCopyMessage = async () => {
    const regId = registrationRecord?.id || '';
    if (!regId) return;
    const msg = generateWhatsAppPaymentMessageText({
      adminWhatsAppNumber: paymentSettings.admin_whatsapp_number || '+919207516227',
      tournamentName: tournament.name,
      tournamentId: tournament.id,
      registrationId: regId,
      userName: userProfile?.display_name || currentUser?.user_metadata?.full_name || 'Player',
      efootballId: efootballId || 'Not set',
      userPhone: userProfile?.whatsapp_number || '',
      entryFeeINR,
    });
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2500);
    } catch {
      // Fallback
    }
  };

  /**
   * Wallet-Powered Tournament Registration:
   * - Atomically deducts fee from player_wallets via secure PostgreSQL RPC.
   * - Immediately confirms participant and issues immutable ledger entry.
   */
  const handleRegistration = async () => {
    setIsRegistering(true);
    setFeedback(null);
    setConfirmModalOpen(false);

    try {
      const res = await registerForTournamentAction(tournament.id, { rulesAccepted: true });
      if (res.success) {
        playConnecting();

        setIsRegistered(true);
        if (res.data?.registrationId) {
          setRegistrationRecord({
            id: res.data.registrationId,
            status: 'confirmed',
            payment_method: res.data.paymentMethod || (isPaidTournament ? 'wallet' : 'free'),
            amount_paise: res.data.amountPaise,
          });
        }

        // Update local wallet balance state
        if (res.data?.balanceAfterInr !== undefined && res.data?.balanceAfterInr !== null) {
          setWalletData((prev) =>
            prev
              ? {
                  ...prev,
                  availableBalanceInr: res.data.balanceAfterInr,
                  availableBalancePaise: Math.round(res.data.balanceAfterInr * 100),
                }
              : null
          );
        } else {
          refreshWalletBalance();
        }

        setFeedback({
          message: res.message || `Congratulations! You are officially registered for ${tournament.name}.`,
          type: 'success',
        });

        if (onRegisteredSuccess) {
          onRegisteredSuccess();
        }

        router.refresh();
      } else {
        if (res.data?.code === 'INSUFFICIENT_WALLET_BALANCE') {
          setFeedback({
            message: res.message || `Insufficient wallet balance. Please add funds to your wallet to register.`,
            type: 'error',
          });
          setAddFundsModalOpen(true);
        } else {
          setFeedback({ message: res.message || 'Registration failed.', type: 'error' });
        }
      }
    } catch {
      setFeedback({ message: 'A network error occurred. Please try again.', type: 'error' });
    } finally {
      setIsRegistering(false);
    }
  };

  /**
   * Withdrawal and Refund Handler:
   * - Atomically cancels registration and refunds entry fee to wallet.
   */
  const handleWithdrawalAndRefund = async () => {
    setIsCancelling(true);
    setWithdrawModalOpen(false);
    setFeedback(null);

    try {
      const res = await cancelRegistrationAction(tournament.id);
      if (res.success) {
        setIsRegistered(false);
        setRegistrationRecord(null);
        setParticipantRecord(null);

        // Update local wallet balance state with refunded amount
        if (res.data?.balanceAfterInr !== undefined && res.data?.balanceAfterInr !== null) {
          setWalletData((prev) =>
            prev
              ? {
                  ...prev,
                  availableBalanceInr: res.data.balanceAfterInr,
                  availableBalancePaise: Math.round(res.data.balanceAfterInr * 100),
                }
              : null
          );
        } else {
          refreshWalletBalance();
        }

        setFeedback({
          message: res.message || 'Registration cancelled. Entry fee refunded to your wallet.',
          type: 'info',
        });

        await checkAuthAndRegistration();
        router.refresh();
      } else {
        setFeedback({ message: res.message || 'Failed to cancel registration.', type: 'error' });
      }
    } catch {
      setFeedback({ message: 'Error cancelling registration.', type: 'error' });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRegisterClick = () => {
    if (isPaidTournament && !hasSufficientBalance) {
      setAddFundsModalOpen(true);
      return;
    }
    setConfirmModalOpen(true);
  };

  const loginRedirectUrl = `/auth/login?next=${encodeURIComponent(pathname || `/tournaments/${tournament.id}`)}`;
  const regStatus = registrationRecord?.status as RegistrationStatus | undefined;
  const isWalletPaid = registrationRecord?.payment_method === 'wallet' || Boolean(isPaidTournament && isRegistered);

  // Fallback WhatsApp Link
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
              <Badge className="bg-[#08088F] text-[#FFFF00] font-black text-[10px] tracking-wider uppercase px-3 py-1 rounded-full border border-[#FFFF00]/30 shadow-xs">
                TOURNAMENT ENTRY
              </Badge>
              {isPaidTournament ? (
                <Badge className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] uppercase px-3 py-1 rounded-full border-0 shadow-xs flex items-center gap-1">
                  <Wallet className="h-3 w-3" />
                  <span>ENTRY FEE: ₹{entryFeeINR}</span>
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
              <Badge className="bg-amber-400 text-amber-950 font-black text-[10px] uppercase px-3 py-1 rounded-full border-0 flex items-center gap-1 shadow-xs">
                <Trophy className="h-3 w-3 text-amber-950" />
                <span>
                  PRIZE POOL: {prizeSplit.hasPrizeMoney ? prizeSplit.formattedTotal : 'TROPHY & GLORY'}
                </span>
              </Badge>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase font-display tracking-tight">
              {isRegistrationOpen ? 'Reserve Your Competitor Slot' : 'Tournament Registration'}
            </h2>
          </div>

          {/* Capacity Counter */}
          <div className="flex items-center gap-3 bg-[#1010C5] border border-white/15 px-4 py-2.5 rounded-2xl shrink-0">
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

        {/* Prize Pool Distribution Showcase */}
        <div className="p-4 rounded-2xl bg-[#1010C5] border border-amber-400/30 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-[#FFFF00] font-black uppercase text-[11px] tracking-wider">
              <Trophy className="h-3.5 w-3.5" />
              <span>Official Prize Rewards</span>
            </div>
            <p className="text-[11px] text-[#D9DCFF]/80 font-medium">
              Total prize money distributed to champions / runners up.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="px-3 py-1 rounded-xl bg-[#08088F] border border-amber-400/40 text-[11px]">
              <span className="text-amber-300 font-extrabold">🏆 1st: {prizeSplit.hasPrizeMoney ? prizeSplit.formattedChampion : '70%'}</span>
              {prizeSplit.championNotes && (
                <span className="text-[10px] text-amber-200/80 block font-medium truncate max-w-[140px]">+ {prizeSplit.championNotes}</span>
              )}
            </div>
            <div className="px-3 py-1 rounded-xl bg-[#08088F] border border-white/20 text-[11px]">
              <span className="text-slate-300 font-extrabold">🥈 2nd: {prizeSplit.hasPrizeMoney ? prizeSplit.formattedRunnerUp : '30%'}</span>
              {prizeSplit.runnerUpNotes && (
                <span className="text-[10px] text-slate-300/80 block font-medium truncate max-w-[140px]">+ {prizeSplit.runnerUpNotes}</span>
              )}
            </div>
            {prizeSplit.hasThirdPlace && (
              <div className="px-3 py-1 rounded-xl bg-[#08088F] border border-amber-700/40 text-[11px]">
                <span className="text-amber-500 font-extrabold">🥉 3rd: {prizeSplit.thirdPlaceRupees > 0 ? prizeSplit.formattedThirdPlace : 'Podium'}</span>
                {prizeSplit.thirdPlaceNotes && (
                  <span className="text-[10px] text-amber-400/80 block font-medium truncate max-w-[140px]">+ {prizeSplit.thirdPlaceNotes}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* In-App Wallet Balance Showcase (for Logged In Users) */}
        {currentUser && isPaidTournament && (
          <div className="p-4 rounded-2xl bg-[#0B0B7C] border border-white/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#1010C5] border border-white/15 flex items-center justify-center text-[#FFFF00] shrink-0">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase text-[#D9DCFF] tracking-wider">
                    In-App Wallet Balance
                  </span>
                  <button
                    onClick={refreshWalletBalance}
                    disabled={isRefreshingBalance}
                    title="Refresh Balance"
                    className="text-white/60 hover:text-[#FFFF00] transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`h-3 w-3 ${isRefreshingBalance ? 'animate-spin text-[#FFFF00]' : ''}`} />
                  </button>
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-lg font-black text-white font-mono">
                    ₹{availableWalletInr.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-[#D9DCFF]/70">INR</span>
                  {hasSufficientBalance ? (
                    <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[9px] font-black px-2 py-0 rounded-full">
                      Sufficient Funds
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[9px] font-black px-2 py-0 rounded-full">
                      Short by ₹{balanceShortfallInr.toFixed(2)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <Button
                type="button"
                size="sm"
                onClick={() => setAddFundsModalOpen(true)}
                className="bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs rounded-full h-8 px-4 gap-1.5 shadow-md cursor-pointer uppercase tracking-wider"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>Add Money</span>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="text-xs font-bold rounded-full h-8 px-3 border-white/30 text-white hover:bg-white/10"
              >
                <Link href="/dashboard/wallet">Wallet History</Link>
              </Button>
            </div>
          </div>
        )}

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
          <div className="p-5 rounded-3xl bg-[#1010C5] border border-[#FFFF00]/40 space-y-4">
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-[#FFFF00] font-black text-sm">
                <CheckCircle2 className="h-5 w-5 text-[#FFFF00]" />
                <span>You Are Officially Registered!</span>
              </div>
              <div className="flex items-center gap-2">
                {isPaidTournament ? (
                  <Badge className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] px-3 py-1 rounded-full uppercase border-0 flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    <span>Paid via Wallet (₹{entryFeeINR})</span>
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-400 text-emerald-950 font-black text-[10px] px-3 py-1 rounded-full uppercase border-0">
                    Free Entry
                  </Badge>
                )}
                <Badge className="bg-white/20 text-white font-extrabold text-[10px] px-3 py-1 rounded-full uppercase border-0">
                  Confirmed Competitor
                </Badge>
              </div>
            </div>

            <p className="text-xs text-[#D9DCFF] font-medium leading-relaxed">
              Your competitor slot in this tournament is 100% secured. Match fixtures, room names, and opponent pairings will appear on your dashboard once generated.
            </p>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/10">
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm" className="bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] text-xs font-black rounded-full h-10 px-5 shadow-md">
                  <Link href="/dashboard/tournaments">
                    <span>View My Tournaments</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="text-xs font-bold rounded-full h-10 px-4 border-white/40 text-white hover:bg-white/10">
                  <Link href="/dashboard/matches">
                    <span>Check Match Schedule</span>
                  </Link>
                </Button>
              </div>

              {/* Cancellation & Refund Option (Allowed only while registration is still open) */}
              {isRegistrationOpen && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setWithdrawModalOpen(true)}
                  disabled={isCancelling}
                  className="text-xs font-bold rounded-full h-10 px-4 border-rose-400/40 text-rose-300 hover:bg-rose-500/20 hover:text-white cursor-pointer transition-all"
                >
                  {isCancelling ? 'Processing...' : isPaidTournament ? 'Withdraw & Refund Entry Fee' : 'Withdraw Registration'}
                </Button>
              )}
            </div>
          </div>
        ) : regStatus === 'pending_payment' || regStatus === 'payment_submitted' ? (
          /* State 2: Legacy Registration Pending — WhatsApp Communication */
          <div className="p-5 rounded-3xl bg-[#1010C5] border border-[#FFFF00]/50 space-y-3">
            <div className="flex items-center gap-2 text-[#FFFF00] font-black text-sm">
              <MessageSquare className="h-5 w-5 text-[#FFFF00]" />
              <span>Pending Manual Payment Request</span>
            </div>
            <p className="text-xs text-[#D9DCFF] leading-relaxed">
              You have an active registration request. You can also pay directly using your in-app wallet balance for instant confirmation!
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-2 sm:gap-3">
              <Button
                onClick={handleRegisterClick}
                disabled={isRegistering}
                className="bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] text-xs font-black rounded-full min-h-[44px] h-11 px-5 shadow-lg gap-2 cursor-pointer uppercase tracking-wider"
              >
                <Wallet className="h-4 w-4" />
                <span>Pay from Wallet Now (Instant)</span>
              </Button>
              {activeWhatsAppUrl && (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="text-xs font-bold rounded-full min-h-[44px] h-11 px-4 border-white/40 text-white hover:bg-white/10 gap-1.5 cursor-pointer"
                >
                  <a href={activeWhatsAppUrl} target="_blank" rel="noopener noreferrer">
                    <MessageSquare className="h-4 w-4" />
                    <span>Open WhatsApp</span>
                  </a>
                </Button>
              )}
            </div>
          </div>
        ) : !currentUser ? (
          /* State 3: Visitor is Not Logged In */
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
          /* State 4: Tournament is Full */
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
          /* State 5: Registration is Closed */
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
          /* State 6: Incomplete Profile Warning */
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
        ) : !isWhatsappVerified ? (
          /* State 7: WhatsApp Verification Required */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#1010C5] border border-amber-400/40 text-white text-xs">
            <div className="space-y-1">
              <span className="font-bold flex items-center gap-1.5 text-amber-300 text-sm">
                <ShieldAlert className="h-4 w-4" />
                WhatsApp Verification Required
              </span>
              <p className="text-[#D9DCFF]">
                Please verify your WhatsApp number in your profile before entering official tournaments.
              </p>
            </div>
            <Button asChild size="sm" className="bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black rounded-full h-10 px-5 shrink-0">
              <Link href="/dashboard/profile">Verify WhatsApp</Link>
            </Button>
          </div>
        ) : (
          /* State 8: Eligible to Register via Wallet */
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

              {isPaidTournament ? (
                hasSufficientBalance ? (
                  <Button
                    onClick={handleRegisterClick}
                    disabled={isRegistering}
                    className="bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs rounded-full h-11 px-6 shadow-xl gap-2 shrink-0 uppercase tracking-wider cursor-pointer"
                  >
                    {isRegistering ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Deducting Fee...</span>
                      </>
                    ) : (
                      <>
                        <Wallet className="h-4 w-4" />
                        <span>Pay ₹{entryFeeINR} & Join</span>
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={() => setAddFundsModalOpen(true)}
                    className="bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs rounded-full h-11 px-6 shadow-xl gap-2 shrink-0 uppercase tracking-wider cursor-pointer"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>Add ₹{balanceShortfallInr.toFixed(0)} to Wallet</span>
                  </Button>
                )
              ) : (
                <Button
                  onClick={handleRegisterClick}
                  disabled={isRegistering}
                  className="bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs rounded-full h-11 px-6 shadow-xl gap-2 shrink-0 uppercase tracking-wider cursor-pointer"
                >
                  {isRegistering ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Registering...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Register for Free</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Financial Confirmation Modal */}
        {confirmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 border border-slate-200 text-[#0A0D14] animate-in zoom-in-95 duration-200">
              <div className="space-y-2">
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-[#08088F] flex items-center justify-center border border-indigo-100">
                  {isPaidTournament ? <Wallet className="h-6 w-6 text-[#08088F]" /> : <Trophy className="h-6 w-6 text-[#00C853]" />}
                </div>
                <h3 className="text-xl font-black text-[#0A0D14] uppercase tracking-tight font-display">
                  {isPaidTournament ? 'Confirm Wallet Payment' : 'Confirm Tournament Registration'}
                </h3>
                <p className="text-xs text-[#1E232E] font-medium leading-relaxed">
                  You are confirming your official competitor registration for <strong className="text-[#0A0D14] font-black">{tournament.name}</strong>.
                </p>
              </div>

              {/* Financial & Participant Breakdown */}
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[#475569] font-bold">Competitor:</span>
                  <span className="font-extrabold text-[#0A0D14] text-sm">
                    {userProfile?.display_name || currentUser?.user_metadata?.full_name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#475569] font-bold">eFootball ID:</span>
                  <span className="font-mono font-black text-[#0A0D14] text-xs tracking-wide bg-white px-2.5 py-0.5 rounded-lg border border-[#E2E8F0]">
                    {efootballId}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#475569] font-bold">Format:</span>
                  <span className="font-extrabold text-[#0A0D14] capitalize">
                    {tournament.format?.replace(/_/g, ' ')}
                  </span>
                </div>

                {isPaidTournament ? (
                  <>
                    <div className="border-t border-[#E2E8F0] pt-2.5 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[#475569] font-bold">Current Wallet Balance:</span>
                        <span className="font-mono font-extrabold text-slate-800">₹{availableWalletInr.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-rose-600 font-extrabold">
                        <span>Tournament Entry Fee:</span>
                        <span className="font-mono">- ₹{entryFeeINR.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center border-t border-dashed border-[#CBD5E1] pt-2 text-sm font-black text-[#08088F]">
                        <span>Remaining Balance After:</span>
                        <span className="font-mono">₹{balanceAfterRegistrationInr.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between items-center border-t border-[#E2E8F0] pt-2.5 text-sm font-black text-emerald-600">
                    <span>Entry:</span>
                    <span>Free Entry</span>
                  </div>
                )}
              </div>

              {tournament.rules_text && (
                <div className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs max-h-24 overflow-y-auto space-y-1">
                  <span className="font-bold text-[#0A0D14] block text-[10px] uppercase tracking-wider">Tournament Rules:</span>
                  <p className="whitespace-pre-line text-[11px] text-[#1E232E] font-medium leading-relaxed">{tournament.rules_text}</p>
                </div>
              )}

              {isPaidTournament && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-[#08088F] font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>Entry fee will be deducted atomically from your wallet. 100% refundable if you withdraw before kickoff.</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmModalOpen(false)}
                  disabled={isRegistering}
                  className="flex-1 rounded-xl text-xs font-black h-11 border-2 border-slate-300 bg-white text-[#0A0D14] hover:bg-slate-100 hover:border-slate-400 hover:text-black transition-all shadow-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleRegistration}
                  disabled={isRegistering}
                  className="flex-1 font-black text-xs rounded-xl h-11 shadow-sm uppercase tracking-wider transition-all disabled:opacity-50 bg-[#08088F] hover:bg-[#06066B] text-white cursor-pointer"
                >
                  {isRegistering ? (
                    <Loader2 className="h-4 w-4 animate-spin text-current" />
                  ) : isPaidTournament ? (
                    `Confirm & Pay ₹${entryFeeINR}`
                  ) : (
                    'Confirm & Join'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Withdrawal & Refund Confirmation Modal */}
        {withdrawModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 border border-slate-200 text-[#0A0D14] animate-in zoom-in-95 duration-200">
              <div className="space-y-2">
                <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
                  <AlertTriangle className="h-6 w-6 text-rose-600" />
                </div>
                <h3 className="text-xl font-black text-[#0A0D14] uppercase tracking-tight font-display">
                  Withdraw From Tournament?
                </h3>
                <p className="text-xs text-[#475569] font-medium leading-relaxed">
                  Are you sure you want to withdraw from <strong className="text-[#0A0D14]">{tournament.name}</strong>?
                </p>
              </div>

              {isPaidTournament ? (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-black">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Instant Wallet Refund</span>
                  </div>
                  <p className="text-emerald-700 leading-relaxed font-medium">
                    Your entry fee of <strong className="text-emerald-950 font-bold">₹{entryFeeINR}.00</strong> will be refunded immediately back to your in-app wallet balance.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-[#475569]">
                  Your slot will be released so other players can register.
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setWithdrawModalOpen(false)}
                  disabled={isCancelling}
                  className="flex-1 rounded-xl text-xs font-black h-11 border-2 border-slate-300 bg-white text-[#0A0D14] hover:bg-slate-100 hover:border-slate-400 hover:text-black transition-all shadow-xs cursor-pointer"
                >
                  Keep Registration
                </Button>
                <Button
                  type="button"
                  onClick={handleWithdrawalAndRefund}
                  disabled={isCancelling}
                  className="flex-1 font-black text-xs rounded-xl h-11 shadow-sm uppercase tracking-wider transition-all disabled:opacity-50 bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                >
                  {isCancelling ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : 'Confirm Withdrawal'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Add Money Modal (Top-Up Directly with Shortfall Pre-filled) */}
        {walletSettings && (
          <AddMoneyModal
            isOpen={addFundsModalOpen}
            onClose={() => setAddFundsModalOpen(false)}
            currentAvailableInr={availableWalletInr}
            paymentSettings={walletSettings}
            initialAmount={balanceShortfallInr > 0 ? Math.max(10, Math.ceil(balanceShortfallInr)) : 100}
            onDepositSuccess={() => {
              setAddFundsModalOpen(false);
              refreshWalletBalance();
              setFeedback({
                message: 'Deposit request submitted! Once approved by admin, your balance will update and you can register.',
                type: 'info',
              });
            }}
          />
        )}
      </Card>
    </>
  );
}
