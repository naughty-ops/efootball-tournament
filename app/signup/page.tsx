'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, UserPlus, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { signupSchema, type SignupInput } from '@/lib/validations';
import { checkEfootballIdAvailabilityAction } from '@/app/actions/verificationActions';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string>('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      efootballId: '',
      whatsappNumber: '',
    },
  });

  const onSubmit = async (data: SignupInput) => {
    setErrorMessage(null);
    try {
      // 1. Verify eFootball ID availability before signup
      const checkResult = await checkEfootballIdAvailabilityAction(data.efootballId);
      if (!checkResult.available) {
        setErrorMessage(checkResult.message || 'The specified eFootball ID is invalid or already registered.');
        return;
      }

      const normalizedEfootballId = checkResult.normalizedId;
      const supabase = createClient();

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const emailRedirectTo = `${origin}/auth/callback`;

      const { error } = await supabase.auth.signUp({
        email: data.email.trim().toLowerCase(),
        password: data.password,
        options: {
          emailRedirectTo,
          data: {
            full_name: data.fullName.trim(),
            efootball_id: normalizedEfootballId,
            efootball_id_verified: true,
            efootball_verification_status: 'verified',
            whatsapp_number: data.whatsappNumber.trim(),
            whatsapp_verification_status: 'not_submitted',
          },
        },
      });

      if (error) {
        // Generic safe error message to prevent account enumeration
        if (error.message.includes('User already registered') || error.message.includes('already registered')) {
          setErrorMessage('Unable to register with this email. If you already have an account, please sign in or use password reset.');
        } else {
          setErrorMessage(error.message);
        }
        return;
      }

      setRegisteredEmail(data.email.trim());
      setSignupSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during signup.';
      setErrorMessage(msg);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08088F] p-4 py-8 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 sm:w-96 h-64 sm:h-96 max-w-full bg-[#3434FF]/25 rounded-full blur-3xl pointer-events-none" />
      <div className="w-full max-w-lg space-y-6 relative z-10">
        {/* Back Link */}
        <Button asChild variant="ghost" size="sm" className="gap-2 text-[#D9DCFF] hover:text-white hover:bg-white/10 rounded-full font-bold">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Public Website</span>
          </Link>
        </Button>

        {/* Signup Card */}
        <Card className="bg-[#1818D4] border-white/20 text-white rounded-[32px] shadow-2xl overflow-hidden">
          <CardHeader className="text-center space-y-3 pb-5">
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
              <CardTitle className="text-2xl font-black font-display uppercase tracking-wider text-white">Create Player Account</CardTitle>
              <CardDescription className="text-xs mt-1 text-[#D9DCFF]/80">
                Join the official eFootball tournament platform. Compete, track standings, and climb the ranks.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {signupSuccess ? (
              <div className="p-6 rounded-[28px] bg-[#1010C5] border border-[#FFFF00]/40 text-center space-y-4 animate-in fade-in zoom-in-95 text-white">
                <div className="mx-auto h-14 w-14 rounded-full bg-[#3434FF] flex items-center justify-center text-[#FFFF00] shadow-md">
                  <CheckCircle2 className="h-8 w-8 text-[#FFFF00]" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-black font-display uppercase text-white">Check Your Email</h3>
                  <p className="text-xs text-[#D9DCFF]/90 leading-relaxed font-medium">
                    We sent a verification link to <span className="font-bold text-[#FFFF00]">{registeredEmail}</span>.
                    Please click the link in your email to verify your account before logging in.
                  </p>
                </div>
                <div className="pt-2">
                  <Button asChild className="w-full font-black uppercase rounded-full bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] h-11">
                    <Link href="/auth/login">Proceed to Player Login</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Error Banner */}
                {errorMessage && (
                  <div className="p-3.5 rounded-2xl bg-[#FF168B]/15 border border-[#FF168B]/30 text-white text-xs font-bold flex items-start gap-2.5 animate-in fade-in">
                    <AlertCircle className="h-4 w-4 text-[#FF168B] shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  {/* Full Name */}
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-[#D9DCFF] block mb-1">
                      Full Name <span className="text-[#FF168B]">*</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      autoComplete="name"
                      disabled={isSubmitting}
                      className="bg-[#0A0A7A] border-white/20 text-white placeholder:text-[#D9DCFF]/40 rounded-2xl"
                      {...register('fullName')}
                    />
                    {errors.fullName && (
                      <p className="text-xs text-[#FF168B] mt-1 font-bold">{errors.fullName.message}</p>
                    )}
                  </div>

                  {/* Gmail Address */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-black uppercase tracking-wider text-[#D9DCFF]">
                        Gmail Address <span className="text-[#FF168B]">*</span>
                      </label>
                      <span className="text-[10px] text-[#FFFF00] font-mono">@gmail.com only</span>
                    </div>
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

                  {/* Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-black uppercase tracking-wider text-[#D9DCFF]">
                        Password <span className="text-[#FF168B]">*</span>
                      </label>
                      <span className="text-[10px] text-[#D9DCFF]/70">Min. 12 characters</span>
                    </div>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        autoComplete="new-password"
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
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-xs text-[#FF168B] mt-1 font-bold">{errors.password.message}</p>
                    )}
                  </div>

                  {/* eFootball ID */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-black uppercase tracking-wider text-[#D9DCFF]">
                        eFootball ID <span className="text-[#FF168B]">*</span>
                      </label>
                      <span className="text-[10px] text-[#FFFF00] font-mono">Format: ABCD-123-456-789</span>
                    </div>
                    <Input
                      type="text"
                      placeholder="ABCD-123-456-789"
                      autoComplete="off"
                      disabled={isSubmitting}
                      className="bg-[#0A0A7A] border-white/20 text-white placeholder:text-[#D9DCFF]/40 rounded-2xl font-mono uppercase tracking-wider"
                      {...register('efootballId', {
                        onChange: (e) => {
                          e.target.value = e.target.value.toUpperCase();
                        },
                      })}
                    />
                    <p className="text-[10px] text-[#D9DCFF]/70 mt-1">
                      4 uppercase letters, then 9 digits (e.g. <span className="text-[#FFFF00] font-mono">ABCD-123-456-789</span>)
                    </p>
                    {errors.efootballId && (
                      <p className="text-xs text-[#FF168B] mt-1 font-bold">{errors.efootballId.message}</p>
                    )}
                  </div>

                  {/* WhatsApp Number */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-black uppercase tracking-wider text-[#D9DCFF]">
                        WhatsApp Number <span className="text-[#FF168B]">*</span>
                      </label>
                      <span className="text-[10px] text-[#FFFF00] font-mono">Include country code</span>
                    </div>
                    <Input
                      type="tel"
                      placeholder="+919876543210"
                      autoComplete="tel"
                      disabled={isSubmitting}
                      className="bg-[#0A0A7A] border-white/20 text-white placeholder:text-[#D9DCFF]/40 rounded-2xl"
                      {...register('whatsappNumber')}
                    />
                    {errors.whatsappNumber && (
                      <p className="text-xs text-[#FF168B] mt-1 font-bold">{errors.whatsappNumber.message}</p>
                    )}
                  </div>

                  {/* Security Notice */}
                  <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-white/20 text-[11px] text-[#D9DCFF] flex items-start gap-2.5">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-[#FFFF00] mt-0.5" />
                    <span>Your WhatsApp number & email are strictly confidential and will never be shown on public match or tournament pages.</span>
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    className="w-full font-black uppercase tracking-wider h-12 gap-2 bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] rounded-full shadow-[0_0_20px_rgba(255,255,0,0.35)]"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" />
                        <span>Creating Account...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 text-[#08088F]" />
                        <span>Create Account</span>
                      </>
                    )}
                  </Button>
                </form>
              </>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-2 border-t border-white/15 pt-4 text-xs text-center text-[#D9DCFF]/70">
            <div>
              Already have a player account?{' '}
              <Link href="/auth/login" className="font-bold text-[#FFFF00] hover:underline transition-colors">
                Sign in
              </Link>
            </div>
            <div className="text-[11px]">
              By signing up, you agree to official tournament fair play rules.
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
