'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Mail, Loader2, AlertCircle, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [targetEmail, setTargetEmail] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  // Countdown timer for 60s rate limit cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  const sendResetEmail = async (email: string) => {
    setErrorMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    const supabase = createClient();

    const origin =
      typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL || 'https://efootball-tournament-cyan.vercel.app';

    const redirectTo = `${origin}/auth/callback?type=recovery&next=/auth/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo,
    });

    if (error) {
      // 1. Check for Rate Limit (429 or over_email_send_rate_limit)
      const isRateLimit =
        error.status === 429 ||
        (error as any).code === 'over_email_send_rate_limit' ||
        error.message?.toLowerCase().includes('rate limit') ||
        error.message?.toLowerCase().includes('seconds');

      if (isRateLimit) {
        setCooldownSeconds(60);
        setErrorMessage(
          'For security purposes, you can only request a password reset email once every 60 seconds. Please wait before trying again.'
        );
        return;
      }

      // 2. Prevent Email Enumeration:
      // If error is related to user not found, shield it and display success screen anyway
      const isUserNotFound =
        error.message?.toLowerCase().includes('user not found') ||
        error.message?.toLowerCase().includes('invalid user');

      if (isUserNotFound) {
        setTargetEmail(cleanEmail);
        setSubmitted(true);
        setCooldownSeconds(60);
        return;
      }

      // Hard error (e.g. network failure or config issue)
      setErrorMessage(error.message || 'Unable to send recovery email. Please check your network connection.');
      return;
    }

    setTargetEmail(cleanEmail);
    setSubmitted(true);
    setCooldownSeconds(60);
  };

  const onSubmit = async (data: ForgotPasswordInput) => {
    await sendResetEmail(data.email);
  };

  const handleResend = async () => {
    if (cooldownSeconds > 0 || isSubmitting) return;
    const email = targetEmail || getValues('email');
    if (email) {
      await sendResetEmail(email);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08088F] p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 sm:w-96 h-64 sm:h-96 max-w-full bg-[#3434FF]/25 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Back to Login Button */}
        <Button asChild variant="ghost" size="sm" className="gap-2 text-[#D9DCFF] hover:text-white hover:bg-white/10 rounded-full font-bold">
          <Link href="/auth/login">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Login</span>
          </Link>
        </Button>

        {/* Forgot Password Card */}
        <Card className="bg-[#1818D4] border-white/20 text-white rounded-[32px] shadow-2xl overflow-hidden">
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
              <CardTitle className="text-2xl font-black font-display uppercase tracking-wider text-white">
                Reset Password
              </CardTitle>
              <CardDescription className="text-xs mt-1 text-[#D9DCFF]/80">
                Enter your registered email and we will send you a secure password recovery link.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {submitted ? (
              <div className="p-6 rounded-[28px] bg-[#0A0A7A] border border-[#FFFF00]/40 text-center space-y-4 animate-in fade-in zoom-in-95 text-white">
                <div className="mx-auto h-12 w-12 rounded-full bg-[#00C853]/20 border border-[#00C853]/30 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-[#00E676]" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-base font-black font-display uppercase text-white">
                    Recovery Link Sent
                  </h3>
                  <p className="text-xs text-[#D9DCFF]/90 leading-relaxed font-medium">
                    If an account is registered with <span className="font-bold text-[#FFFF00]">{targetEmail}</span>,
                    a password recovery email has been sent.
                  </p>
                  <p className="text-[11px] text-[#D9DCFF]/60 pt-1">
                    Check your inbox and spam/junk folder. The link remains valid for 1 hour.
                  </p>
                </div>

                <div className="pt-2 space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResend}
                    disabled={cooldownSeconds > 0 || isSubmitting}
                    className="w-full text-xs rounded-full border-white/20 text-white hover:bg-white/10 h-10 gap-2 cursor-pointer font-bold"
                  >
                    {cooldownSeconds > 0 ? (
                      <>
                        <Clock className="h-3.5 w-3.5 text-[#FFFF00]" />
                        <span>Resend available in {cooldownSeconds}s</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Resend Recovery Email</span>
                      </>
                    )}
                  </Button>

                  <Button asChild className="w-full bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] text-xs font-black uppercase tracking-wider rounded-full h-10 shadow">
                    <Link href="/auth/login">Return to Sign In</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {errorMessage && (
                  <div className="p-3.5 rounded-2xl bg-[#FF168B]/15 border border-[#FF168B]/30 text-white text-xs font-bold flex items-start gap-2.5 animate-in fade-in">
                    <AlertCircle className="h-4 w-4 text-[#FF168B] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span>{errorMessage}</span>
                      {cooldownSeconds > 0 && (
                        <span className="block text-[11px] text-[#FFFF00]">
                          Cooldown: {cooldownSeconds} seconds remaining.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-[#D9DCFF] block mb-1.5">
                      Email Address
                    </label>
                    <Input
                      type="email"
                      placeholder="player@gmail.com"
                      autoComplete="email"
                      disabled={isSubmitting || cooldownSeconds > 0}
                      className="bg-[#0A0A7A] border-white/20 text-white placeholder:text-[#D9DCFF]/40 rounded-2xl h-11 focus-visible:ring-[#FFFF00]"
                      {...register('email')}
                    />
                    {errors.email && (
                      <p className="text-xs text-[#FF168B] mt-1 font-bold">{errors.email.message}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full font-black uppercase tracking-wider h-12 gap-2 bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] rounded-full shadow-[0_0_20px_rgba(255,255,0,0.35)] cursor-pointer disabled:opacity-60"
                    disabled={isSubmitting || cooldownSeconds > 0}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" />
                        <span>Sending Link...</span>
                      </>
                    ) : cooldownSeconds > 0 ? (
                      <>
                        <Clock className="h-4 w-4 text-[#08088F]" />
                        <span>Wait {cooldownSeconds}s</span>
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 text-[#08088F]" />
                        <span>Send Recovery Link</span>
                      </>
                    )}
                  </Button>
                </form>
              </>
            )}
          </CardContent>

          <CardFooter className="justify-center border-t border-white/15 pt-4 text-xs text-[#D9DCFF]/70">
            Remember your password?{' '}
            <Link href="/auth/login" className="font-bold text-[#FFFF00] hover:underline ml-1">
              Sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
