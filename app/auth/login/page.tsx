'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, LogIn, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { loginSchema, type LoginInput } from '@/lib/validations';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function PlayerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const nextParam = searchParams.get('next');
  const verifiedParam = searchParams.get('verified');
  const resetParam = searchParams.get('reset');
  const errorParam = searchParams.get('error');

  const querySuccessNotice =
    verifiedParam === 'true'
      ? 'Email verified successfully! You can now sign in to your player dashboard.'
      : resetParam === 'success'
      ? 'Password reset successfully. Sign in with your new password.'
      : null;

  const queryErrorMessage =
    errorParam === 'unauthorized'
      ? 'Please sign in to access your player dashboard.'
      : errorParam === 'verification_failed'
      ? 'Verification link is invalid or has expired. Please request a new one.'
      : null;

  const displayedError = customError || queryErrorMessage;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Check if player is already logged in
  useEffect(() => {
    async function checkActiveSession() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          if (user.email?.toLowerCase().trim() === 'ye.agrajj@gmail.com') {
            router.replace('/admin/dashboard');
            return;
          }
          const target = (nextParam && !nextParam.startsWith('/admin') && nextParam.startsWith('/'))
            ? nextParam
            : '/dashboard';
          router.replace(target);
          return;
        }
      } catch (err) {
        console.error('Player session check error:', err);
      } finally {
        setIsCheckingSession(false);
      }
    }

    checkActiveSession();
  }, [router]);

  const onSubmit = async (data: LoginInput) => {
    setCustomError(null);
    try {
      const supabase = createClient();
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email.trim().toLowerCase(),
        password: data.password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setCustomError('Invalid email or password. Please check your credentials.');
        } else if (error.message.includes('Email not confirmed')) {
          setCustomError('Please verify your email address before signing in. Check your inbox for the confirmation link.');
        } else {
          setCustomError(error.message);
        }
        return;
      }

      const user = authData.user;
      if (!user) {
        setCustomError('Failed to establish session.');
        return;
      }

      if (user.email?.toLowerCase().trim() === 'ye.agrajj@gmail.com') {
        router.replace('/admin/dashboard');
        router.refresh();
        return;
      }

      // Safe redirect: always redirect player to /dashboard (or safe relative next url if not /admin)
      const target = (nextParam && !nextParam.startsWith('/admin') && nextParam.startsWith('/'))
        ? nextParam
        : '/dashboard';

      router.replace(target);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during login.';
      setCustomError(msg);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#08088F] text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00]" />
          <span className="text-xs font-black font-display uppercase tracking-widest text-[#D9DCFF]">Verifying Player Session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08088F] p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 sm:w-96 h-64 sm:h-96 max-w-full bg-[#3434FF]/25 rounded-full blur-3xl pointer-events-none" />
      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Back Link */}
        <Button asChild variant="ghost" size="sm" className="gap-2 text-[#D9DCFF] hover:text-white hover:bg-white/10 rounded-full font-bold">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Public Website</span>
          </Link>
        </Button>

        {/* Player Login Card */}
        <Card className="bg-[#1818D4] border-white/20 text-white rounded-[32px] shadow-2xl overflow-hidden">
          <CardHeader className="text-center space-y-3 pb-6">
            <div className="relative mx-auto h-14 w-14 rounded-2xl overflow-hidden bg-[#0A0A7A] p-1 flex items-center justify-center shadow-lg border border-white/20">
              <Image
                src="/logos/logo-mark-transparent.png"
                alt="eFootball Logo Mark"
                width={56}
                height={56}
                className="h-full w-full object-contain"
                priority
              />
            </div>
            <div>
              <CardTitle className="text-2xl font-black font-display uppercase tracking-wider text-white">Player Login</CardTitle>
              <CardDescription className="text-xs mt-1 text-[#D9DCFF]/80">
                Sign in to your player account to view your dashboard and tournament profile.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Success Notification Banner */}
            {querySuccessNotice && (
              <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-[#FFFF00]/40 text-white text-xs font-bold flex items-start gap-2.5 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#FFFF00]" />
                <span>{querySuccessNotice}</span>
              </div>
            )}

            {/* Error Message Banner */}
            {displayedError && (
              <div className="p-3.5 rounded-2xl bg-[#FF168B]/15 border border-[#FF168B]/30 text-white text-xs font-bold flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="h-4 w-4 text-[#FF168B] shrink-0 mt-0.5" />
                <span>{displayedError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-[#D9DCFF] block mb-1.5">
                  Gmail Address
                </label>
                <Input
                  type="email"
                  placeholder="player@gmail.com"
                  autoComplete="email"
                  disabled={isSubmitting}
                  className="bg-[#0A0A7A] border-white/20 text-white placeholder:text-[#D9DCFF]/40 rounded-2xl"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-[#FF168B] mt-1 font-bold">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-[#D9DCFF]">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-[11px] font-bold text-[#FFFF00] hover:underline transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    className="pr-10 bg-[#0A0A7A] border-white/20 text-white placeholder:text-[#D9DCFF]/40 rounded-2xl"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide Password' : 'Show Password'}
                    className="absolute right-3.5 top-3 text-[#D9DCFF]/60 hover:text-white transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-[#FF168B] mt-1 font-bold">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full font-black uppercase tracking-wider h-12 gap-2 bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] rounded-full shadow-[0_0_20px_rgba(255,255,0,0.35)]"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 text-[#08088F]" />
                    <span>Sign In to Dashboard</span>
                  </>
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-2.5 justify-center border-t border-white/15 pt-4 text-xs text-[#D9DCFF]/70 text-center">
            <div>
              Don&apos;t have a player account yet?{' '}
              <Link href="/signup" className="font-bold text-[#FFFF00] hover:underline transition-colors ml-1">
                Sign Up
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default function PlayerLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#08088F]">
          <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00]" />
        </div>
      }
    >
      <PlayerLoginForm />
    </Suspense>
  );
}
