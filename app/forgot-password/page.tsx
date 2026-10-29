'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Mail, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [targetEmail, setTargetEmail] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordInput) => {
    setErrorMessage(null);
    try {
      const supabase = createClient();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const redirectTo = `${origin}/auth/callback?type=recovery&next=/auth/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(data.email.trim(), {
        redirectTo,
      });

      if (error) {
        // Even if rate limited or error, show a safe message unless it's a hard error
        setErrorMessage(error.message);
        return;
      }

      setTargetEmail(data.email.trim());
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setErrorMessage(msg);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08088F] p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 sm:w-96 h-64 sm:h-96 max-w-full bg-[#3434FF]/25 rounded-full blur-3xl pointer-events-none" />
      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Back to Login */}
        <Button asChild variant="ghost" size="sm" className="gap-2 text-[#D9DCFF] hover:text-white hover:bg-white/10 rounded-full font-bold">
          <Link href="/auth/login">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Login</span>
          </Link>
        </Button>

        {/* Card */}
        <Card className="bg-[#1818D4] border-white/20 text-white rounded-[32px] shadow-2xl overflow-hidden">
          <CardHeader className="text-center space-y-3 pb-6">
            <div className="relative mx-auto h-14 w-14 rounded-2xl overflow-hidden bg-[#0A0A7A] p-1 flex items-center justify-center shadow-md border border-white/20">
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
              <CardTitle className="text-2xl font-black font-display uppercase tracking-wider text-white">Reset Password</CardTitle>
              <CardDescription className="text-xs mt-1 text-[#D9DCFF]/80">
                Enter your registered email and we will send you a password recovery link.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {submitted ? (
              <div className="p-6 rounded-[28px] bg-[#1010C5] border border-[#FFFF00]/40 text-center space-y-4 animate-in fade-in zoom-in-95 text-white">
                <div className="mx-auto h-12 w-12 rounded-full bg-[#3434FF] flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-[#FFFF00]" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-black font-display uppercase text-white">Recovery Link Sent</h3>
                  <p className="text-xs text-[#D9DCFF]/90 leading-relaxed font-medium">
                    If an account exists for <span className="font-bold text-[#FFFF00]">{targetEmail}</span>,
                    you will receive an email shortly with instructions to reset your password.
                  </p>
                </div>
                <div className="pt-2">
                  <Button asChild variant="outline" className="w-full text-xs rounded-full border-white/20 text-white hover:bg-[#FFFF00] hover:text-[#08088F]">
                    <Link href="/auth/login">Return to Sign In</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {errorMessage && (
                  <div className="p-3.5 rounded-2xl bg-[#FF168B]/15 border border-[#FF168B]/30 text-white text-xs font-bold flex items-start gap-2.5 animate-in fade-in">
                    <AlertCircle className="h-4 w-4 text-[#FF168B] shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
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
                      disabled={isSubmitting}
                      className="bg-[#0A0A7A] border-white/20 text-white placeholder:text-[#D9DCFF]/40 rounded-2xl"
                      {...register('email')}
                    />
                    {errors.email && (
                      <p className="text-xs text-[#FF168B] mt-1 font-bold">{errors.email.message}</p>
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
                        <span>Sending Link...</span>
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
