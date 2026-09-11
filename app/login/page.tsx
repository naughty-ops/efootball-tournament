'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Shield, ArrowLeft, Lock, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
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
          router.replace('/admin/dashboard');
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
      const { error } = await supabase.auth.signInWithPassword({
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

      router.replace('/admin/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during login.';
      setErrorMessage(msg);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F8F5]">
        <div className="flex flex-col items-center gap-3 text-[#0B3323]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs font-semibold">Verifying Admin Session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F4F8F5] via-white to-[#E8F5E9] p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Back Link */}
        <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Public Website</span>
          </Link>
        </Button>

        {/* Login Card */}
        <Card className="border-border shadow-xl shadow-primary/5">
          <CardHeader className="text-center space-y-3 pb-6">
            <div className="relative mx-auto h-14 w-14 rounded-2xl overflow-hidden bg-[#0B3323] border border-[#0B3323]/20 shadow-md p-1 flex items-center justify-center">
              <Image
                src="/logos/logo.png"
                alt="eFootball Logo"
                width={56}
                height={56}
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <CardTitle className="text-2xl font-extrabold text-[#0B3323]">Admin Portal</CardTitle>
              <CardDescription className="text-xs mt-1">
                Enter your credentials to access tournament management controls.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Error Message Banner */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#0B3323] block mb-1.5">
                  Email Address
                </label>
                <Input
                  type="email"
                  placeholder="admin@efootball.com"
                  autoComplete="email"
                  disabled={isSubmitting}
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-destructive mt-1 font-medium">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-[#0B3323] block mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    className="pr-10"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide Password' : 'Show Password'}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-[#0B3323] transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive mt-1 font-medium">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full font-bold h-11 gap-2 shadow-md shadow-primary/20"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
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

          <CardFooter className="justify-center border-t border-border/50 pt-4 text-xs text-muted-foreground">
            Protected Admin Route • eFootball Tournament System
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
