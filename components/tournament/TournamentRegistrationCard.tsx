'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  CreditCard,
  ArrowRight,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { registerForTournamentAction } from '@/app/actions/playerActions';
import type { TournamentWithStats } from '@/services/tournamentService';
import { loadRazorpayScript, type RazorpaySuccessResponse } from '@/lib/razorpay/client';
import { loadCashfreeScript, getClientCashfreeMode } from '@/lib/cashfree/client';

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
  const [loadingUser, setLoadingUser] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(true);

  // Active checkout state tracking to prevent duplicate orders or modal launches
  const [isCheckoutActive, setIsCheckoutActive] = useState(false);
  const isCheckoutActiveRef = useRef(false);

  const isPaidTournament = Boolean(tournament.is_paid && tournament.entry_fee_paise && Number(tournament.entry_fee_paise) > 0);
  const entryFeeRupees = isPaidTournament ? Number(tournament.entry_fee_paise) / 100 : 0;
  const isRegistrationOpen = tournament.status === 'registration';
  const participantCount = tournament.participant_count ?? 0;
  const maxParticipants = tournament.max_participants || 32;
  const isFull = participantCount >= maxParticipants;
  const slotsRemaining = Math.max(0, maxParticipants - participantCount);

  // Check user session and registration status
  useEffect(() => {
    let isMounted = true;
    async function checkAuthAndRegistration() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          if (isMounted) setLoadingUser(false);
          return;
        }

        if (isMounted) setCurrentUser(user);

        // Fetch user profile and existing participant record in parallel
        const [profileRes, partRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase
            .from('participants')
            .select('*')
            .eq('tournament_id', tournament.id)
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

        if (isMounted) {
          if (profileRes.data) setUserProfile(profileRes.data);
          if (partRes.data) {
            setIsRegistered(true);
          }
        }
      } catch (err) {
        console.error('Error checking registration status:', err);
      } finally {
        if (isMounted) setLoadingUser(false);
      }
    }

    checkAuthAndRegistration();
    return () => {
      isMounted = false;
    };
  }, [tournament.id]);

  /**
   * Flow A: Free tournament standard self-registration
   */
  const handleFreeRegistration = async () => {
    setIsRegistering(true);
    setFeedback(null);
    setConfirmModalOpen(false);

    try {
      const res = await registerForTournamentAction(tournament.id, { rulesAccepted: true });
      if (res.success) {
        setIsRegistered(true);
        setFeedback({
          message: `Congratulations! You are officially registered for ${tournament.name}.`,
          type: 'success',
        });
        if (onRegisteredSuccess) {
          onRegisteredSuccess();
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

  /**
   * Flow B: Paid tournament Razorpay checkout
   * 1. Check duplicate lock
   * 2. Request order from POST /api/registrations with tournamentId
   * 3. Load official Razorpay checkout script
   * 4. Open Razorpay modal with server-provided order ID, amount, and public key
   * 5. Handle success callback, user dismiss, and errors safely
   */
  const handlePaidCheckout = async () => {
    if (isCheckoutActiveRef.current || isRegistering) {
      return;
    }

    isCheckoutActiveRef.current = true;
    setIsCheckoutActive(true);
    setIsRegistering(true);
    setFeedback(null);
    setConfirmModalOpen(false);

    try {
      // 1. Request order creation from server endpoint
      const response = await fetch('/api/registrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tournamentId: tournament.id,
          rulesAccepted: true,
        }),
      });

      const orderData = await response.json();

      if (!response.ok || !orderData.success) {
        setFeedback({
          message: orderData.error || 'Failed to initiate tournament registration order. Please retry.',
          type: 'error',
        });
        isCheckoutActiveRef.current = false;
        setIsCheckoutActive(false);
        setIsRegistering(false);
        return;
      }

      // 2. Gateway Dispatch: Cashfree vs Razorpay
      if (orderData.gateway === 'cashfree') {
        const isMockSession = orderData.paymentSessionId?.startsWith('session_mock_');

        if (isMockSession) {
          // Automated testing mode: simulate sandbox payment verification without external network dependency
          setFeedback({
            message: 'Cashfree Sandbox Test Mode: Verifying simulated transaction...',
            type: 'info',
          });

          const verifyRes = await fetch('/api/registrations/verify-payment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              gateway: 'cashfree',
              order_id: orderData.orderId,
              cf_payment_id: `cf_mock_pay_${Date.now()}`,
            }),
          });

          const verifyData = await verifyRes.json();
          if (verifyRes.ok && verifyData.success) {
            setIsRegistered(true);
            setFeedback({
              message: verifyData.message || `Congratulations! You are officially registered for ${tournament.name}.`,
              type: 'success',
            });
            if (onRegisteredSuccess) onRegisteredSuccess();
            router.refresh();
          } else {
            setFeedback({
              message: verifyData.error || 'Payment verification failed.',
              type: 'error',
            });
          }
          isCheckoutActiveRef.current = false;
          setIsCheckoutActive(false);
          setIsRegistering(false);
          return;
        }

        // Live Cashfree Checkout SDK v3
        const scriptLoaded = await loadCashfreeScript();
        if (!scriptLoaded || !window.Cashfree) {
          setFeedback({
            message: 'Unable to load Cashfree payment gateway. Please check your internet connection.',
            type: 'error',
          });
          isCheckoutActiveRef.current = false;
          setIsCheckoutActive(false);
          setIsRegistering(false);
          return;
        }

        const cashfree = window.Cashfree({ mode: getClientCashfreeMode() });

        cashfree
          .checkout({
            paymentSessionId: orderData.paymentSessionId,
            redirectTarget: '_modal',
          })
          .then(async (result: any) => {
            if (result?.error) {
              console.warn('[Cashfree Checkout] Payment dismissed or error:', result.error);
              setFeedback({
                message: result.error?.message || 'Checkout closed. Your slot reservation will be held for up to 12 minutes.',
                type: 'info',
              });
              isCheckoutActiveRef.current = false;
              setIsCheckoutActive(false);
              setIsRegistering(false);
              return;
            }

            // Payment completed in modal: Verify with server
            setFeedback({
              message: 'Payment received by Cashfree. Verifying transaction with platform...',
              type: 'info',
            });

            try {
              const verifyRes = await fetch('/api/registrations/verify-payment', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  gateway: 'cashfree',
                  order_id: orderData.orderId,
                }),
              });

              const verifyData = await verifyRes.json();

              if (verifyRes.ok && verifyData.success) {
                setIsRegistered(true);
                setFeedback({
                  message: verifyData.message || `Congratulations! You are officially registered for ${tournament.name}.`,
                  type: 'success',
                });
                if (onRegisteredSuccess) onRegisteredSuccess();
                router.refresh();
              } else {
                setFeedback({
                  message: verifyData.error || 'Payment verification failed. Please contact support.',
                  type: 'error',
                });
              }
            } catch (err) {
              console.error('[Cashfree Checkout] Verification error:', err);
              setFeedback({
                message: 'Network error during verification. Your payment was received; please refresh to check status.',
                type: 'info',
              });
            } finally {
              isCheckoutActiveRef.current = false;
              setIsCheckoutActive(false);
              setIsRegistering(false);
            }
          })
          .catch((err: any) => {
            console.error('[Cashfree Checkout] Launch error:', err);
            setFeedback({
              message: err?.message || 'Error launching Cashfree checkout.',
              type: 'error',
            });
            isCheckoutActiveRef.current = false;
            setIsCheckoutActive(false);
            setIsRegistering(false);
          });

        return;
      }

      // 2B. Razorpay Flow (Fallback)
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        setFeedback({
          message: 'Unable to load payment gateway. Please verify your internet connection and try again.',
          type: 'error',
        });
        isCheckoutActiveRef.current = false;
        setIsCheckoutActive(false);
        setIsRegistering(false);
        return;
      }

      // 3. Configure Razorpay modal options
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'eFootball Tournament Platform',
        description: `Entry Fee for ${tournament.name}`,
        order_id: orderData.orderId,
        prefill: {
          name: userProfile?.display_name || currentUser?.user_metadata?.full_name || '',
          email: currentUser?.email || '',
          contact: userProfile?.whatsapp_number || currentUser?.user_metadata?.whatsapp_number || '',
        },
        notes: {
          tournament_id: tournament.id,
          registration_id: orderData.registrationId,
        },
        theme: {
          color: '#1D1DE0',
        },
        modal: {
          backdropclose: false,
          escape: false,
          ondismiss: () => {
            console.log('[Razorpay Checkout] Checkout dismissed by user');
            isCheckoutActiveRef.current = false;
            setIsCheckoutActive(false);
            setIsRegistering(false);
            setFeedback({
              message: 'Checkout closed. Your slot reservation will be held for up to 12 minutes.',
              type: 'info',
            });
          },
        },
        handler: async (response: RazorpaySuccessResponse) => {
          // Checkout complete callback: Call server-side verification endpoint
          setFeedback({
            message: 'Payment received by gateway. Verifying transaction with platform...',
            type: 'info',
          });

          try {
            const verifyRes = await fetch('/api/registrations/verify-payment', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();

            if (verifyRes.ok && verifyData.success) {
              setIsRegistered(true);
              setFeedback({
                message: verifyData.message || `Congratulations! You are officially registered for ${tournament.name}.`,
                type: 'success',
              });
              if (onRegisteredSuccess) {
                onRegisteredSuccess();
              }
              router.refresh();
            } else {
              setFeedback({
                message: verifyData.error || 'Payment verification failed or could not be completed. Please contact support.',
                type: 'error',
              });
            }
          } catch (verifyErr: any) {
            console.error('[Razorpay Checkout] Verification request error:', verifyErr);
            setFeedback({
              message: 'Network error during verification. Your payment was received; please refresh in a moment to check your registration status.',
              type: 'info',
            });
          } finally {
            isCheckoutActiveRef.current = false;
            setIsCheckoutActive(false);
            setIsRegistering(false);
          }
        },
      };

      const razorpayInstance = new window.Razorpay(options);

      razorpayInstance.on('payment.failed', (failedRes: any) => {
        console.error('[Razorpay Checkout] Payment failed event:', failedRes?.error);
        isCheckoutActiveRef.current = false;
        setIsCheckoutActive(false);
        setIsRegistering(false);
        setFeedback({
          message: failedRes?.error?.description || 'Payment failed or was declined. You may retry your checkout.',
          type: 'error',
        });
      });

      razorpayInstance.open();
    } catch (err: any) {
      console.error('[Razorpay Checkout] Unexpected error during checkout initialization:', err);
      isCheckoutActiveRef.current = false;
      setIsCheckoutActive(false);
      setIsRegistering(false);
      setFeedback({
        message: err.message || 'An unexpected error occurred launching checkout. Please try again.',
        type: 'error',
      });
    }
  };

  const handleRegisterClick = () => {
    setConfirmModalOpen(true);
  };

  const loginRedirectUrl = `/auth/login?next=${encodeURIComponent(pathname || `/tournaments/${tournament.id}`)}`;

  // Profile completeness check
  const efootballId = userProfile?.efootball_id || currentUser?.user_metadata?.efootball_id;
  const isProfileComplete = Boolean(efootballId && efootballId.trim().length > 0);

  return (
    <Card className="relative overflow-hidden bg-[#1D1DE0] border border-white/20 shadow-2xl rounded-[28px] p-6 sm:p-7 space-y-6 text-white">
      {/* Top Banner & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/15 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-[#08088F] text-[#FFFF00] font-black text-[10px] tracking-wider uppercase px-3 py-1 rounded-full">
              TOURNAMENT ENTRY
            </Badge>
            {isPaidTournament ? (
              <Badge className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] uppercase px-3 py-1 rounded-full border-0 flex items-center gap-1">
                <CreditCard className="h-3 w-3" />
                <span>₹{entryFeeRupees} ENTRY FEE</span>
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
            {isRegistrationOpen ? (isPaidTournament ? 'Join Paid Tournament' : 'Reserve Your Competitor Slot') : 'Tournament Registration'}
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
          <button onClick={() => setFeedback(null)} className="underline ml-4 hover:no-underline shrink-0 font-bold">
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
      ) : isRegistered ? (
        /* State 1: User is Already Registered */
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
      ) : !currentUser ? (
        /* State 2: Visitor is Not Logged In */
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
        /* State 3: Tournament is Full */
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
        /* State 4: Registration is Closed */
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
        /* State 5: Incomplete Profile Warning */
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
        /* State 6: Eligible to Register / Pay */
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
              {isPaidTournament && (
                <p className="text-xs text-[#FFFF00] font-black">
                  Entry Fee: ₹{entryFeeRupees} INR (Non-refundable after bracket generation)
                </p>
              )}
            </div>

            <Button
              onClick={handleRegisterClick}
              disabled={isRegistering || isCheckoutActive}
              className="bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs rounded-full h-11 px-6 shadow-xl gap-2 shrink-0 uppercase tracking-wider"
            >
              {isRegistering || isCheckoutActive ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{isPaidTournament ? 'Opening Checkout...' : 'Registering...'}</span>
                </>
              ) : (
                <>
                  {isPaidTournament ? <CreditCard className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                  <span>{isPaidTournament ? `Pay ₹${entryFeeRupees} & Enter` : 'Register for Tournament'}</span>
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
                {isPaidTournament ? <CreditCard className="h-6 w-6 text-[#1D1DE0]" /> : <Trophy className="h-6 w-6 text-[#00C853]" />}
              </div>
              <h3 className="text-xl font-black text-[#0A0D14] uppercase tracking-tight font-display">
                {isPaidTournament ? 'Confirm Tournament Entry & Payment' : 'Confirm Tournament Registration'}
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
              {isPaidTournament && (
                <div className="flex justify-between items-center border-t border-[#E2E8F0] pt-2.5 text-sm font-black text-[#0A0D14]">
                  <span>Total Amount:</span>
                  <span className="text-[#1D1DE0] font-black">₹{entryFeeRupees} INR</span>
                </div>
              )}
            </div>

            {tournament.rules_text && (
              <div className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs max-h-28 overflow-y-auto space-y-1">
                <span className="font-bold text-[#0A0D14] block text-[10px] uppercase tracking-wider">Tournament Rules:</span>
                <p className="whitespace-pre-line text-[11px] text-[#1E232E] font-medium leading-relaxed">{tournament.rules_text}</p>
              </div>
            )}

            <p className="text-[11px] text-[#334155] font-medium leading-relaxed">
              {isPaidTournament
                ? 'Clicking Proceed will open the secure Cashfree Checkout modal. Your slot will be reserved for 12 minutes while completing payment.'
                : 'By confirming, you agree to attend scheduled matches on time. Matches without attendance will be recorded as walkovers.'}
            </p>

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmModalOpen(false)}
                disabled={isRegistering || isCheckoutActive}
                className="flex-1 rounded-xl text-xs font-black h-11 border-2 border-slate-300 bg-white text-[#0A0D14] hover:bg-slate-100 hover:border-slate-400 hover:text-black transition-all shadow-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={isPaidTournament ? handlePaidCheckout : handleFreeRegistration}
                disabled={isRegistering || isCheckoutActive}
                className={`flex-1 font-black text-xs rounded-xl h-11 shadow-sm uppercase tracking-wider transition-all disabled:opacity-50 ${
                  isPaidTournament
                    ? 'bg-[#1D1DE0] hover:bg-[#1515B0] text-white shadow-md'
                    : 'bg-[#00C853] hover:bg-[#00B048] text-[#072418]'
                }`}
              >
                {isRegistering || isCheckoutActive ? (
                  <Loader2 className="h-4 w-4 animate-spin text-current" />
                ) : isPaidTournament ? (
                  `Pay ₹${entryFeeRupees} Now`
                ) : (
                  'Confirm & Join'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
