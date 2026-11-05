'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Check,
  X,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validations';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
    mode: 'onChange',
  });

  const passwordValue = watch('password') || '';
  const confirmPasswordValue = watch('confirmPassword') || '';

  // Password Strength Evaluation
  const strength = useMemo(() => {
    const pwd = passwordValue;
    const hasMinLength = pwd.length >= 12;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);

    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (hasMinLength) score += 1;
    if (hasUpper && hasLower) score += 1;
    if (hasNumber) score += 1;
    if (hasSpecial) score += 1;

    let label = 'Very Weak';
    let color = 'bg-red-500';
    let percent = 15;

    if (score >= 5) {
      label = 'Strong';
      color = 'bg-[#00C853]';
      percent = 100;
    } else if (score >= 4) {
      label = 'Good';
      color = 'bg-blue-400';
      percent = 80;
    } else if (score >= 3) {
      label = 'Fair';
      color = 'bg-[#FFFF00]';
      percent = 50;
    } else if (score >= 2) {
      label = 'Weak';
      color = 'bg-orange-400';
      percent = 30;
    }

    return {
      score,
      label,
      color,
      percent,
      hasMinLength,
      hasUpper,
      hasLower,
      hasNumber,
      hasSpecial,
    };
  }, [passwordValue]);

  // Robust session detection supporting PKCE cookies, Supabase Auth events, and hash tokens
  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    // Check for incoming error in URL hash (e.g. #error=access_denied)
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash;
      if (hash.includes('error=') || hash.includes('error_description=')) {
        if (isMounted) {
          setErrorMessage('Password reset link is invalid or has expired. Please request a new recovery link.');
          setIsCheckingSession(false);
        }
        return;
      }
    }

    // Subscribe to auth state transitions (captures PASSWORD_RECOVERY and initial session exchange)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setHasValidSession(true);
        setSessionEmail(session?.user?.email || null);
        setIsCheckingSession(false);
        setErrorMessage(null);
      }
    });

    // Initial check: if cookies were already set by /auth/callback route handler
    async function verifyInitialSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && isMounted) {
          setHasValidSession(true);
          setSessionEmail(session.user.email || null);
          setIsCheckingSession(false);
          setErrorMessage(null);
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user && isMounted) {
          setHasValidSession(true);
          setSessionEmail(user.email || null);
          setIsCheckingSession(false);
          setErrorMessage(null);
          return;
        }
      } catch (err) {
        console.error('Session verification error:', err);
      }

      // Allow grace period for @supabase/ssr browser client to process hash fragments
      setTimeout(async () => {
        if (!isMounted) return;
        try {
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          if (retrySession && isMounted) {
            setHasValidSession(true);
            setSessionEmail(retrySession.user.email || null);
            setIsCheckingSession(false);
            setErrorMessage(null);
            return;
          }
        } catch {}

        if (isMounted) {
          setIsCheckingSession(false);
          setErrorMessage('Password reset link is invalid or has expired. Please request a new recovery link.');
        }
      }, 1200);
    }

    verifyInitialSession();

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const onSubmit = async (data: ResetPasswordInput) => {
    setErrorMessage(null);
    try {
      const supabase = createClient();

      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) {
        setErrorMessage(error.message || 'Failed to update password. Your recovery session may have expired.');
        return;
      }

      setSuccess(true);

      // Terminate the temporary recovery session so the user can cleanly log in with new credentials
      try {
        await supabase.auth.signOut();
      } catch (signOutErr) {
        console.warn('Post-reset signOut notice:', signOutErr);
      }

      setTimeout(() => {
        router.replace('/auth/login?reset=success');
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred while updating password.';
      setErrorMessage(msg);
    }
  };

  // 1. Loading State
  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#08088F] p-4 text-white">
        <div className="text-center space-y-3 bg-[#1818D4] border border-white/20 p-8 rounded-[32px] shadow-2xl max-w-sm w-full">
          <Loader2 className="h-10 w-10 animate-spin text-[#FFFF00] mx-auto" />
          <h3 className="text-base font-black font-display uppercase tracking-wider text-white">
            Verifying Recovery Link
          </h3>
          <p className="text-xs text-white/70">
            Validating security credentials and establishing session...
          </p>
        </div>
      </div>
    );
  }

  // 2. Invalid or Expired Session State
  if (!hasValidSession && errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#08088F] p-4 text-white">
        <div className="w-full max-w-md space-y-6">
          <Card className="bg-[#1818D4] border border-white/20 shadow-2xl rounded-[32px] overflow-hidden text-white p-6 sm:p-8 space-y-6 text-center">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
              <AlertCircle className="h-8 w-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-black font-display uppercase tracking-wider text-white">
                Link Invalid or Expired
              </h2>
              <p className="text-xs text-white/70 leading-relaxed">
                {errorMessage}
              </p>
            </div>

            <div className="pt-2 space-y-2.5">
              <Button asChild className="w-full bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider h-11 rounded-full shadow-lg gap-2 cursor-pointer">
                <Link href="/forgot-password">
                  <RefreshCw className="h-4 w-4" />
                  <span>Request New Reset Link</span>
                </Link>
              </Button>

              <Button asChild variant="ghost" className="w-full text-white/70 hover:text-white text-xs font-bold rounded-full h-10">
                <Link href="/auth/login">Back to Sign In</Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // 3. Active Recovery Session: New Password Form
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08088F] p-4 text-white relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 sm:w-96 h-64 sm:h-96 max-w-full bg-[#3434FF]/25 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        <Card className="bg-[#1818D4] border border-white/20 shadow-2xl rounded-[32px] overflow-hidden text-white">
          <CardHeader className="text-center space-y-3 pb-6">
            <div className="relative mx-auto h-14 w-14 rounded-2xl overflow-hidden bg-[#0A0A7A] p-1 flex items-center justify-center shadow-md border border-white/20">
              <Image
                src="/logos/logo-mark-transparent.webp"
                alt="eFootball Logo Mark"
                width={56}
                height={56}
                className="h-full w-full object-contain"
                priority
              />
            </div>
            <div>
              <CardTitle className="text-2xl font-black text-white font-display uppercase tracking-wider">
                Create New Password
              </CardTitle>
              <CardDescription className="text-xs mt-1 text-white/70">
                {sessionEmail ? (
                  <span>
                    Securing account: <strong className="text-[#FFFF00]">{sessionEmail}</strong>
                  </span>
                ) : (
                  <span>Set a secure new password for your competitor account.</span>
                )}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {success ? (
              <div className="p-6 rounded-2xl bg-[#0A0A7A] border border-[#00C853]/40 text-center space-y-3 animate-in fade-in zoom-in-95">
                <div className="mx-auto h-12 w-12 rounded-full bg-[#00C853]/20 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-[#00C853]" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-black text-white uppercase font-display">
                    Password Reset Successful!
                  </h3>
                  <p className="text-xs text-white/80">
                    Your password has been securely updated. Redirecting to sign in...
                  </p>
                </div>
              </div>
            ) : (
              <>
                {errorMessage && (
                  <div className="p-3.5 rounded-xl bg-destructive/20 border border-destructive/40 text-red-200 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  {/* New Password Input */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold uppercase tracking-wider text-white/90">
                        New Password
                      </label>
                      <span className="text-[10px] text-white/60">Min. 12 characters</span>
                    </div>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        autoComplete="new-password"
                        disabled={isSubmitting}
                        className="pr-10 bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 focus-visible:ring-[#FFFF00] rounded-xl h-11"
                        {...register('password')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide Password' : 'Show Password'}
                        className="absolute right-3 top-3 text-white/60 hover:text-white transition-colors cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-xs text-red-300 mt-1 font-medium">{errors.password.message}</p>
                    )}

                    {/* Live Password Strength Meter */}
                    {passwordValue && (
                      <div className="mt-2.5 p-3 rounded-xl bg-[#0A0A7A] border border-white/10 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-white/60 font-bold uppercase tracking-wider">
                            Strength: <span className="text-white">{strength.label}</span>
                          </span>
                          <span className="text-white/60">{strength.percent}%</span>
                        </div>

                        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full transition-all duration-300', strength.color)}
                            style={{ width: `${strength.percent}%` }}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 text-[10px] pt-1">
                          <span className={cn('flex items-center gap-1', strength.hasMinLength ? 'text-[#00E676]' : 'text-white/40')}>
                            {strength.hasMinLength ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                            <span>12+ characters</span>
                          </span>
                          <span className={cn('flex items-center gap-1', strength.hasUpper ? 'text-[#00E676]' : 'text-white/40')}>
                            {strength.hasUpper ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                            <span>Uppercase (A-Z)</span>
                          </span>
                          <span className={cn('flex items-center gap-1', strength.hasLower ? 'text-[#00E676]' : 'text-white/40')}>
                            {strength.hasLower ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                            <span>Lowercase (a-z)</span>
                          </span>
                          <span className={cn('flex items-center gap-1', strength.hasNumber ? 'text-[#00E676]' : 'text-white/40')}>
                            {strength.hasNumber ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                            <span>Number (0-9)</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password Input */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-white/90 block mb-1">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        autoComplete="new-password"
                        disabled={isSubmitting}
                        className="pr-10 bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 focus-visible:ring-[#FFFF00] rounded-xl h-11"
                        {...register('confirmPassword')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        aria-label={showConfirmPassword ? 'Hide Confirm Password' : 'Show Confirm Password'}
                        className="absolute right-3 top-3 text-white/60 hover:text-white transition-colors cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-xs text-red-300 mt-1 font-medium">{errors.confirmPassword.message}</p>
                    )}
                    {confirmPasswordValue && passwordValue && confirmPasswordValue === passwordValue && (
                      <p className="text-[11px] text-[#00E676] mt-1 font-bold flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" />
                        <span>Passwords match</span>
                      </p>
                    )}
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    className="w-full font-black h-12 gap-2 shadow-lg bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] rounded-full transition-all uppercase tracking-wider cursor-pointer"
                    disabled={isSubmitting || !hasValidSession}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" />
                        <span>Updating Password...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="h-4 w-4 text-[#08088F]" />
                        <span>Update Password</span>
                      </>
                    )}
                  </Button>
                </form>
              </>
            )}
          </CardContent>

          <CardFooter className="justify-center border-t border-white/10 pt-4 text-xs text-white/70">
            <Link href="/auth/login" className="font-bold text-[#FFFF00] hover:underline transition-colors flex items-center gap-1">
              <span>Back to Player Login</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
