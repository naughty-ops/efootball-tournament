'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validations';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    async function verifyRecoverySession() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          // If no active session established via recovery link
          setErrorMessage('Password reset link is invalid or has expired. Please request a new recovery link.');
        }
      } catch (err) {
        console.error('Session check error:', err);
        setErrorMessage('Failed to verify password recovery session.');
      } finally {
        setIsCheckingSession(false);
      }
    }

    verifyRecoverySession();
  }, []);

  const onSubmit = async (data: ResetPasswordInput) => {
    setErrorMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/auth/login?reset=success');
      }, 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password.';
      setErrorMessage(msg);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#08088F]">
        <div className="flex flex-col items-center gap-3 text-white">
          <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00]" />
          <span className="text-xs font-semibold tracking-wider uppercase">Verifying Recovery Link...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08088F] p-4 text-white">
      <div className="w-full max-w-md space-y-6">
        <Card className="bg-[#1818D4] border border-white/20 shadow-2xl rounded-[32px] overflow-hidden text-white">
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
              <CardTitle className="text-2xl font-black text-white font-display uppercase tracking-wider">Create New Password</CardTitle>
              <CardDescription className="text-xs mt-1 text-white/70">
                Set a strong new password for your eFootball platform account.
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
                  <h3 className="text-base font-black text-white uppercase font-display">Password Reset Successful!</h3>
                  <p className="text-xs text-white/80">
                    Your password has been securely updated. Redirecting to login...
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
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-white/90">
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
                        className="pr-10 bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 focus:border-[#FFFF00] focus:ring-[#FFFF00]/20 rounded-xl"
                        {...register('password')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide Password' : 'Show Password'}
                        className="absolute right-3 top-2.5 text-white/60 hover:text-white transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-xs text-red-300 mt-1 font-medium">{errors.password.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-white/90 block mb-1">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        autoComplete="new-password"
                        disabled={isSubmitting}
                        className="pr-10 bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 focus:border-[#FFFF00] focus:ring-[#FFFF00]/20 rounded-xl"
                        {...register('confirmPassword')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        aria-label={showConfirmPassword ? 'Hide Confirm Password' : 'Show Confirm Password'}
                        className="absolute right-3 top-2.5 text-white/60 hover:text-white transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-xs text-red-300 mt-1 font-medium">{errors.confirmPassword.message}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full font-black h-11 gap-2 shadow-lg bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] rounded-full transition-all uppercase tracking-wider cursor-pointer"
                    disabled={isSubmitting}
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
            <Link href="/auth/login" className="font-bold text-[#FFFF00] hover:underline transition-colors">
              Back to Player Login
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
