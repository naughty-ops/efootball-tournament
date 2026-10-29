'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Lock, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { loginSchema, LoginInput } from '@/lib/validations';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  // Check if admin is already logged in
  useEffect(() => {
    async function checkActiveSession() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          if (user.email?.toLowerCase().trim() === 'ye.agrajj@gmail.com') {
            router.replace('/admin/dashboard');
          } else {
            router.replace('/dashboard');
          }
          return;
        }
      } catch (err) {
        console.error('Session check error:', err);
      } finally {
        setIsCheckingSession(false);
      }
    }

    checkActiveSession();
  }, [router]);

  const onSubmit = async (data: LoginInput) => {
    setErrorMessage(null);
    try {
      const supabase = createClient();
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErrorMessage('Invalid email or password. Please check your credentials.');
        } else if (error.message.includes('Email not confirmed')) {
          setErrorMessage('Email address is not confirmed yet.');
        } else {
          setErrorMessage(error.message);
        }
        return;
      }

      if (authData.user?.email?.toLowerCase().trim() === 'ye.agrajj@gmail.com') {
        router.replace('/admin/dashboard');
      } else {
        router.replace('/dashboard');
      }
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during login.';
      setErrorMessage(msg);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#08088F] text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00]" />
          <span className="text-xs font-black font-display uppercase tracking-widest text-[#D9DCFF]">Verifying Session...</span>
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

        {/* Login Card */}
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
              <CardTitle className="text-2xl font-black font-display uppercase tracking-wider text-white">Admin Portal</CardTitle>
              <CardDescription className="text-xs mt-1 text-[#D9DCFF]/80">
                Enter your credentials to access tournament management controls.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Error Message Banner */}
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
                  placeholder="admin@efootball.com"
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
                <label className="text-xs font-black uppercase tracking-wider text-[#D9DCFF] block mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
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
                    <Lock className="h-4 w-4" />
                    <span>Sign In to Admin Panel</span>
                  </>
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="justify-center border-t border-white/15 pt-4 text-xs text-[#D9DCFF]/70 font-medium">
            Protected Admin Route • eFootball Tournament System
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
