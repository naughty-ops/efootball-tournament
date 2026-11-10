'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  User,
  Gamepad2,
  Phone,
  ShieldCheck,
  KeyRound,
  MessageCircle,
  LifeBuoy,
  FileText,
  ExternalLink,
  Edit3,
  Save,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  LogOut,
  Mail,
  Calendar,
  Send,
  HelpCircle,
  Flame,
  Trophy,
  ArrowRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { isValidEfootballId, normalizeEfootballId } from '@/lib/validations';
import { updatePlayerProfileAction } from '@/app/actions/playerActions';
import { requestWhatsAppVerificationAction } from '@/app/actions/verificationActions';
import { createClient } from '@/lib/supabase/client';
import AvatarPickerModal from '@/components/avatar/AvatarPickerModal';
import PaymentDetailsManager from '@/components/wallet/PaymentDetailsManager';
import ChangePasswordModal from './ChangePasswordModal';
import { DEFAULT_AVATAR_URL } from '@/lib/avatar/constants';
import type { Profile, WhatsAppVerificationStatus } from '@/types/database';
import type { PlayerPaymentMethod } from '@/types/wallet';
import type { UnifiedTicket } from '@/types/tickets';

const ADMIN_WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_ADMIN_WHATSAPP_NUMBER || '+919207516227';

interface PlayerSettingsClientViewProps {
  initialProfile: Profile | null;
  userEmail: string;
  isEmailVerified: boolean;
  userCreatedAt: string;
  paymentMethods: PlayerPaymentMethod[];
  tickets: UnifiedTicket[];
}

export default function PlayerSettingsClientView({
  initialProfile,
  userEmail,
  isEmailVerified,
  userCreatedAt,
  paymentMethods,
  tickets,
}: PlayerSettingsClientViewProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Edit Personal Information state
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const displayName = profile?.display_name || userEmail.split('@')[0] || 'Player';
  const efootballId = profile?.efootball_id || 'Not Set';
  const whatsappNumber = profile?.whatsapp_number || 'Not Set';
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile?.avatar_url || null);
  const [avatarId, setAvatarId] = useState<string | null>(initialProfile?.avatar_id || null);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isRequestingWhatsApp, setIsRequestingWhatsApp] = useState(false);

  // Form inputs
  const [editName, setEditName] = useState(displayName);
  const [editEfootballId, setEditEfootballId] = useState(efootballId === 'Not Set' ? '' : efootballId);
  const [editWhatsapp, setEditWhatsapp] = useState(whatsappNumber === 'Not Set' ? '' : whatsappNumber);

  // eFootball format validation
  const isEfootballFormatValid = isValidEfootballId(efootballId);
  const isEfootballVerified = isEfootballFormatValid || profile?.efootball_id_verified === true;
  const isEditIdValid = isValidEfootballId(normalizeEfootballId(editEfootballId));

  // WhatsApp verification status
  const whatsappStatus: WhatsAppVerificationStatus =
    (profile?.whatsapp_verification_status as WhatsAppVerificationStatus) ||
    (profile?.whatsapp_verified ? 'verified' : 'not_submitted');
  const isWhatsappVerified = profile?.whatsapp_verified === true || whatsappStatus === 'verified';

  // Support stats
  const openTickets = tickets.filter(
    (t) => t.status === 'open' || t.status === 'pending_review' || t.status === 'waiting_for_player' || t.status === 'under_investigation'
  );

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingInfo(true);
    setFeedback(null);

    const normId = normalizeEfootballId(editEfootballId);
    if (!isValidEfootballId(normId)) {
      setFeedback({
        message: 'eFootball ID must match format ABCD-123-456-789 (4 uppercase letters, then 9 digits in groups of 3).',
        type: 'error',
      });
      setIsSavingInfo(false);
      return;
    }

    if (!editWhatsapp.trim()) {
      setFeedback({
        message: 'WhatsApp number is required.',
        type: 'error',
      });
      setIsSavingInfo(false);
      return;
    }

    try {
      const res = await updatePlayerProfileAction({
        fullName: editName,
        efootballId: normId,
        whatsappNumber: editWhatsapp,
        avatarUrl,
        avatarId,
      });

      if (res.success && res.data?.profile) {
        setProfile((prev) => ({
          ...(prev || {}),
          id: prev?.id || '',
          email: prev?.email || userEmail,
          display_name: res.data!.profile.display_name,
          efootball_id: res.data!.profile.efootball_id,
          efootball_id_verified: res.data!.profile.efootball_id_verified,
          efootball_verification_status: res.data!.profile.efootball_verification_status,
          whatsapp_number: res.data!.profile.whatsapp_number,
          whatsapp_verified: res.data!.profile.whatsapp_verified,
          whatsapp_verification_status: res.data!.profile.whatsapp_verification_status,
          whatsapp_rejection_reason: null,
          created_at: prev?.created_at || userCreatedAt,
          updated_at: new Date().toISOString(),
        } as Profile));
        setIsEditingInfo(false);
        setFeedback({ message: 'Personal profile details saved successfully!', type: 'success' });
      } else {
        setFeedback({ message: res.message || 'Failed to save changes.', type: 'error' });
      }
    } catch {
      setFeedback({ message: 'Network error occurred while saving profile.', type: 'error' });
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleSendWhatsAppGreeting = async () => {
    if (profile?.account_status === 'suspended') {
      setFeedback({ message: 'Account is suspended. Verification is disabled.', type: 'error' });
      return;
    }

    setIsRequestingWhatsApp(true);
    setFeedback(null);

    const sanitizedAdmin = ADMIN_WHATSAPP_NUMBER.replace(/\D/g, '');
    const shortId = profile?.id ? profile.id.slice(0, 8).toUpperCase() : 'USER';
    const refCode = `REF-WA-${shortId}-${Date.now().toString(36).toUpperCase()}`;

    const greetingText = `Hello Admin! I am verifying my WhatsApp number for the eFootball Tournament Platform.

📋 Verification Ref: ${refCode}
👤 Player Name: ${displayName}
🎮 eFootball ID: ${efootballId}
📧 Registered Email: ${userEmail}
📱 My WhatsApp: ${whatsappNumber}`;

    const waUrl = `https://wa.me/${sanitizedAdmin}?text=${encodeURIComponent(greetingText)}`;
    if (typeof window !== 'undefined') {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }

    try {
      const res = await requestWhatsAppVerificationAction(refCode);
      if (res.success) {
        setProfile((prev) => (prev ? { ...prev, whatsapp_verification_status: 'pending', whatsapp_rejection_reason: null } : prev));
        setFeedback({
          message: `WhatsApp opened with Ref ${refCode}! Please press Send in WhatsApp to contact admin (${ADMIN_WHATSAPP_NUMBER}).`,
          type: 'success',
        });
      }
    } catch {
      // non-blocking
    } finally {
      setIsRequestingWhatsApp(false);
    }
  };

  const handleDirectContactAdmin = () => {
    const sanitizedAdmin = ADMIN_WHATSAPP_NUMBER.replace(/\D/g, '');
    const shortId = profile?.id ? profile.id.slice(0, 8).toUpperCase() : 'USER';
    const msg = `Hello Admin! I need direct support regarding my eFootball Tournament Platform account.

👤 Player Name: ${displayName}
🎮 eFootball ID: ${efootballId}
📧 Registered Email: ${userEmail}
🆔 Account Ref: ACC-${shortId}`;

    const waUrl = `https://wa.me/${sanitizedAdmin}?text=${encodeURIComponent(msg)}`;
    if (typeof window !== 'undefined') {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/auth/login');
      router.refresh();
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto text-white">
      {/* Suspension Alert Banner */}
      {profile?.account_status === 'suspended' && (
        <div className="p-4 rounded-2xl text-xs font-black bg-red-600/25 border-2 border-red-500 text-red-200 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold uppercase tracking-wider text-white">Account Suspended</h4>
            <p>
              Your account has been placed under administrative suspension.
              {profile.suspension_reason ? ` Reason: "${profile.suspension_reason}".` : ''}
              {' '}Tournament registrations and match actions are disabled. Please contact admin below to resolve.
            </p>
          </div>
        </div>
      )}

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={cn(
            'p-4 rounded-2xl text-xs font-black flex items-center justify-between border uppercase tracking-wider animate-in fade-in',
            feedback.type === 'success'
              ? 'bg-[#00C853]/20 text-[#00C853] border-[#00C853]/40'
              : 'bg-red-500/20 text-red-300 border-red-500/40'
          )}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="underline ml-4 hover:no-underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* 1. SECTION: Personal Information */}
      <Card className="bg-[#1818D4] border border-white/20 shadow-2xl rounded-[32px] p-5 sm:p-8 text-white space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-wider text-white">1. Personal Information</h2>
              <p className="text-xs text-white/70">Your registered competitor identity and official avatar</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditingInfo ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditingInfo(true)}
                className="bg-[#0A0A7A] hover:bg-[#1010C5] text-[#FFFF00] border border-[#FFFF00]/40 font-black text-xs px-4 py-2 rounded-full gap-2 uppercase tracking-wider shadow cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit Profile</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditingInfo(false);
                  setEditName(displayName);
                  setEditEfootballId(efootballId === 'Not Set' ? '' : efootballId);
                  setEditWhatsapp(whatsappNumber === 'Not Set' ? '' : whatsappNumber);
                }}
                className="rounded-full text-xs font-black uppercase text-white/70 hover:text-white"
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            )}
          </div>
        </div>

        {/* Identity & Avatar Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#0A0A7A] border border-white/15">
          <div className="flex items-center gap-4">
            <div
              onClick={() => setIsAvatarModalOpen(true)}
              className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-[#050550] border-2 border-[#FFFF00] flex items-center justify-center overflow-hidden cursor-pointer hover:scale-105 transition-transform shrink-0 shadow-lg"
              title="Click to choose official avatar"
            >
              <Image
                src={avatarUrl || DEFAULT_AVATAR_URL}
                alt={displayName}
                width={80}
                height={80}
                className="object-cover w-full h-full"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-black uppercase tracking-wider text-white">{displayName}</h3>
                <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] font-black uppercase">Official</Badge>
              </div>
              <p className="text-xs text-white/70">{userEmail}</p>
              <p className="text-[11px] text-white/50 mt-1">Member since {userCreatedAt ? new Date(userCreatedAt).toLocaleDateString() : '2026'}</p>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => setIsAvatarModalOpen(true)}
            size="sm"
            className="rounded-full bg-[#0A0A7A] hover:bg-[#1010C5] text-[#FFFF00] border border-white/20 text-xs font-black uppercase tracking-wider gap-1.5 h-10 px-4 shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Choose Avatar</span>
          </Button>
        </div>

        {/* Form Inputs / Display */}
        {isEditingInfo ? (
          <form onSubmit={handleSaveProfile} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-white/70">Full Name</label>
                <Input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Cristiano Player"
                  required
                  className="h-11 bg-[#0A0A7A] border-white/20 text-white rounded-xl focus-visible:ring-[#FFFF00]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-white/70">
                  Registered WhatsApp (E.164)
                </label>
                <Input
                  type="tel"
                  value={editWhatsapp}
                  onChange={(e) => setEditWhatsapp(e.target.value)}
                  placeholder="+919207516227"
                  required
                  className="h-11 font-mono bg-[#0A0A7A] border-white/20 text-white rounded-xl focus-visible:ring-[#FFFF00]"
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-white/70">
                  eFootball ID (Konami Format: ABCD-123-456-789)
                </label>
                <Input
                  type="text"
                  value={editEfootballId}
                  onChange={(e) => setEditEfootballId(e.target.value.toUpperCase())}
                  placeholder="ABCD-123-456-789"
                  required
                  className="h-11 font-mono font-black text-lg text-[#FFFF00] bg-[#0A0A7A] border-white/20 rounded-xl focus-visible:ring-[#FFFF00]"
                />
                <span className={cn('text-[11px] font-bold block', isEditIdValid ? 'text-[#00E676]' : 'text-red-400')}>
                  {isEditIdValid ? '✓ Valid Konami handle format' : 'Requires ABCD-123-456-789 format'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="submit"
                disabled={isSavingInfo}
                className="rounded-full bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider px-6 h-11 shadow-lg"
              >
                {isSavingInfo ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-1.5" />
                    Save Details
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">eFootball ID</span>
              <span className="text-sm font-mono font-black text-[#FFFF00] tracking-wider block">{efootballId}</span>
              <span className="text-[10px] text-white/50 block">In-game competitor handle</span>
            </div>
            <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">WhatsApp Number</span>
              <span className="text-sm font-mono font-black text-white tracking-wider block">{whatsappNumber}</span>
              <span className="text-[10px] text-white/50 block">Fixture coordination</span>
            </div>
            <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">Account Status</span>
              <span className={cn('text-sm font-black uppercase tracking-wider block', profile?.account_status === 'suspended' ? 'text-red-400' : 'text-[#00C853]')}>
                {profile?.account_status || 'Active'}
              </span>
              <span className="text-[10px] text-white/50 block">Platform standing</span>
            </div>
          </div>
        )}
      </Card>

      {/* 2. SECTION: Career & Achievements (Esports Performance Hub) */}
      <Card className="bg-gradient-to-r from-[#1818D4] via-[#1010C5] to-[#1818D4] border-2 border-[#FFFF00]/40 shadow-2xl rounded-[32px] p-5 sm:p-8 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#FFFF00]/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-[#05053B] border border-[#FFFF00]/50 flex items-center justify-center text-[#FFFF00] shadow-md shadow-[#FFFF00]/20 shrink-0 mt-0.5">
              <Flame className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black uppercase tracking-wider text-white font-display">
                  2. Career & Achievements
                </h2>
                <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] font-black uppercase tracking-wider rounded-full px-2">
                  Esports Profile
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-white/80 max-w-xl leading-relaxed">
                Explore your lifetime match statistics, win rate %, competitive tier, recent form guide, head-to-head records against opponents, and unlocked milestone trophies.
              </p>
            </div>
          </div>

          <Button
            asChild
            className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-full h-11 px-6 shadow-lg gap-2 shrink-0 cursor-pointer self-start sm:self-auto"
          >
            <Link href="/dashboard/career">
              <Trophy className="h-4 w-4 text-[#08088F]" />
              <span>View Full Career</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </Card>

      {/* 3. SECTION: Player Verification */}
      <Card className="bg-[#1818D4] border border-white/20 shadow-2xl rounded-[32px] p-5 sm:p-8 text-white space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-wider text-white">3. Player Verification</h2>
              <p className="text-xs text-white/70">Verify your in-game identity and administrator communication channel</p>
            </div>
          </div>

          <div>
            {isEfootballVerified && isWhatsappVerified ? (
              <Badge className="bg-[#00C853] text-[#08088F] font-black text-xs px-3.5 py-1.5 border-0 rounded-full gap-1.5 uppercase tracking-wider shadow-md">
                <CheckCircle2 className="h-3.5 w-3.5" />
                FULLY VERIFIED
              </Badge>
            ) : isEfootballVerified ? (
              <Badge variant="outline" className="border-[#00C853] bg-[#00C853]/15 text-[#00E676] font-black text-xs px-3.5 py-1.5 rounded-full gap-1.5 uppercase tracking-wider">
                <CheckCircle2 className="h-3.5 w-3.5" />
                ID FORMAT VERIFIED
              </Badge>
            ) : (
              <Badge variant="outline" className="border-[#FFFF00] bg-[#FFFF00]/15 text-[#FFFF00] font-black text-xs px-3.5 py-1.5 rounded-full gap-1.5 uppercase tracking-wider">
                <Clock className="h-3.5 w-3.5" />
                PENDING VERIFICATION
              </Badge>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/15 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-white block">WhatsApp Channel Verification</span>
              <p className="text-[11px] text-white/70 max-w-xl">
                Send a pre-formatted verification greeting to the tournament administrator on WhatsApp to confirm your match communication contact.
              </p>
            </div>

            <Button
              onClick={handleSendWhatsAppGreeting}
              disabled={isRequestingWhatsApp || isWhatsappVerified}
              className={cn(
                'rounded-full font-black text-xs uppercase tracking-wider px-5 h-10 gap-2 shrink-0 cursor-pointer shadow-md',
                isWhatsappVerified
                  ? 'bg-[#00C853]/20 text-[#00E676] border border-[#00C853]/40'
                  : 'bg-[#25D366] hover:bg-[#20BD5A] text-white'
              )}
            >
              {isRequestingWhatsApp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageCircle className="h-4 w-4" />
              )}
              <span>{isWhatsappVerified ? 'WhatsApp Verified' : 'Verify via WhatsApp'}</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* 3. SECTION: Payment & Payout Details */}
      <div id="payment-details">
        <PaymentDetailsManager paymentMethods={paymentMethods} />
      </div>

      {/* 4. SECTION: Security & Credentials */}
      <Card className="bg-[#1818D4] border border-white/20 shadow-2xl rounded-[32px] p-5 sm:p-8 text-white space-y-5">
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <div className="h-10 w-10 rounded-2xl bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wider text-white">4. Account Security</h2>
            <p className="text-xs text-white/70">Manage your sign-in password and active dashboard session</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/15 flex flex-col justify-between space-y-3">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-white block">In-Session Password</span>
              <p className="text-[11px] text-white/60 mt-1">Change your account password directly while signed in.</p>
            </div>
            <Button
              onClick={() => setIsPasswordModalOpen(true)}
              className="rounded-full bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider h-10 w-full"
            >
              Change Password
            </Button>
          </div>

          <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/15 flex flex-col justify-between space-y-3">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-white block">Email Recovery</span>
              <p className="text-[11px] text-white/60 mt-1">Request a password recovery link to your registered email.</p>
            </div>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-white/20 text-white hover:bg-white/10 font-black text-xs uppercase tracking-wider h-10 w-full"
            >
              <Link href="/forgot-password">
                Forgot Password Link
              </Link>
            </Button>
          </div>

          <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/15 flex flex-col justify-between space-y-3">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-white block">Dashboard Session</span>
              <p className="text-[11px] text-white/60 mt-1">Terminate your active session and sign out securely.</p>
            </div>
            <Button
              onClick={handleSignOut}
              disabled={isSigningOut}
              variant="outline"
              className="rounded-full border-red-400/40 text-red-300 hover:bg-red-500/20 font-black text-xs uppercase tracking-wider h-10 w-full"
            >
              {isSigningOut ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <LogOut className="h-4 w-4 mr-1" />}
              <span>Sign Out</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* 5. SECTION: Support Desk & Tickets */}
      <Card className="bg-[#1818D4] border border-white/20 shadow-2xl rounded-[32px] p-5 sm:p-8 text-white space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-wider text-white">5. Support Desk & Disputes</h2>
              <p className="text-xs text-white/70">Official support tickets, match dispute claims, and inquiries</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              className="rounded-full bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider px-5 h-10 shadow-md gap-1.5"
            >
              <Link href="/dashboard/tickets">
                <span>View My Tickets ({tickets.length})</span>
              </Link>
            </Button>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-black uppercase tracking-wider text-white block">
              Active Inquiries: {openTickets.length} open
            </span>
            <p className="text-[11px] text-white/70">
              Need assistance with match scheduling, scores, or payments? File a support ticket with operations.
            </p>
          </div>

          <Button
            asChild
            variant="outline"
            className="rounded-full border-white/20 text-white hover:bg-white/10 text-xs font-black uppercase tracking-wider px-4 h-10 shrink-0"
          >
            <Link href="/contact">
              Submit Inquiry
            </Link>
          </Button>
        </div>
      </Card>

      {/* 6. SECTION: Contact Admin (Dedicated & Prominent) */}
      <Card className="bg-gradient-to-r from-[#1818D4] via-[#1A1AE8] to-[#1818D4] border-2 border-[#FFFF00] shadow-2xl rounded-[32px] p-5 sm:p-8 text-white space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-[#25D366] text-white flex items-center justify-center shadow-lg shrink-0">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-[#FFFF00]">Direct Emergency Channel</span>
                <span className="h-2 w-2 rounded-full bg-[#00C853] animate-ping" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-wider text-white">Contact Tournament Admin</h2>
              <p className="text-xs text-white/80 max-w-xl">
                Connect directly with the head administrator on WhatsApp for match emergencies, dispute escalations, or platform inquiries.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            <Button
              onClick={handleDirectContactAdmin}
              className="rounded-full bg-[#25D366] hover:bg-[#20BD5A] text-white font-black text-xs uppercase tracking-wider px-6 h-11 gap-2 shadow-xl cursor-pointer"
            >
              <MessageCircle className="h-4 w-4" />
              <span>Open Admin WhatsApp</span>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-white/30 text-white hover:bg-white/10 font-black text-xs uppercase tracking-wider px-4 h-11"
            >
              <Link href="/contact">
                Support Ticket Fallback
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      {/* 7. SECTION: Legal and Policies */}
      <Card className="bg-[#1818D4] border border-white/20 shadow-2xl rounded-[32px] p-5 sm:p-8 text-white space-y-4">
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <div className="h-10 w-10 rounded-2xl bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wider text-white">7. Legal & Platform Policies</h2>
            <p className="text-xs text-white/70">Official platform terms of service and player data protection policies</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/terms"
            className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/15 hover:border-[#FFFF00] transition-colors flex items-center justify-between group"
          >
            <div className="space-y-0.5">
              <span className="text-sm font-black uppercase tracking-wider text-white group-hover:text-[#FFFF00] transition-colors">
                Terms & Conditions
              </span>
              <p className="text-[11px] text-white/60">Tournament competition rules, eligibility, and fair play guidelines.</p>
            </div>
            <ExternalLink className="h-4 w-4 text-white/60 group-hover:text-[#FFFF00] transition-colors shrink-0" />
          </Link>

          <Link
            href="/privacy"
            className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/15 hover:border-[#FFFF00] transition-colors flex items-center justify-between group"
          >
            <div className="space-y-0.5">
              <span className="text-sm font-black uppercase tracking-wider text-white group-hover:text-[#FFFF00] transition-colors">
                Privacy Policy
              </span>
              <p className="text-[11px] text-white/60">How your gamer tag, financial credentials, and match evidence are handled.</p>
            </div>
            <ExternalLink className="h-4 w-4 text-white/60 group-hover:text-[#FFFF00] transition-colors shrink-0" />
          </Link>
        </div>
      </Card>

      {/* 8. SECTION: Account Metadata */}
      <div className="p-4 rounded-2xl bg-[#0A0A7A]/60 border border-white/10 text-[11px] text-white/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span>Competitor UID: <strong className="text-white/80 font-mono">{profile?.id || 'AUTH-SESSION'}</strong></span>
        <span>eFootball Esports Tournament Operating Environment • 2026</span>
      </div>

      {/* In-Session Password Change Modal */}
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={(msg) => setFeedback({ message: msg, type: 'success' })}
      />

      {/* Official Avatar Picker Modal */}
      <AvatarPickerModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        currentAvatarId={avatarId}
        currentAvatarUrl={avatarUrl}
        onAvatarSelected={(newUrl, newId) => {
          setAvatarUrl(newUrl);
          setAvatarId(newId);
          setFeedback({ message: 'Avatar updated successfully!', type: 'success' });
          router.refresh();
        }}
      />
    </div>
  );
}
