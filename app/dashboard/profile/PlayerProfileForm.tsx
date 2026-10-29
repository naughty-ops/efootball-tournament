'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Gamepad2,
  Phone,
  User,
  Mail,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  ShieldCheck,
  KeyRound,
  LogOut,
  Send,
  Lock,
  Calendar,
  MessageCircle,
  Edit3,
  Save,
  X,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isValidEfootballId, normalizeEfootballId } from '@/lib/validations';
import { requestWhatsAppVerificationAction } from '@/app/actions/verificationActions';
import { updatePlayerProfileAction } from '@/app/actions/playerActions';
import { createClient } from '@/lib/supabase/client';
import type { Profile, WhatsAppVerificationStatus } from '@/types/database';

const ADMIN_WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_ADMIN_WHATSAPP_NUMBER || '+919207516227';

interface PlayerProfileViewProps {
  initialProfile: Profile | null;
  userEmail: string;
  isEmailVerified: boolean;
  userCreatedAt: string;
}

export default function PlayerProfileForm({
  initialProfile,
  userEmail,
  isEmailVerified,
  userCreatedAt,
}: PlayerProfileViewProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [isRequestingWhatsApp, setIsRequestingWhatsApp] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Profile Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const displayName = profile?.display_name || userEmail.split('@')[0] || 'Player';
  const efootballId = profile?.efootball_id || 'Not Set';
  const whatsappNumber = profile?.whatsapp_number || 'Not Set';

  // Form input states for editing
  const [editName, setEditName] = useState(displayName);
  const [editEfootballId, setEditEfootballId] = useState(efootballId === 'Not Set' ? '' : efootballId);
  const [editWhatsapp, setEditWhatsapp] = useState(whatsappNumber === 'Not Set' ? '' : whatsappNumber);

  // Format-only verification rule for eFootball ID
  const isEfootballFormatValid = isValidEfootballId(efootballId);
  const isEfootballVerified = isEfootballFormatValid || profile?.efootball_id_verified === true || profile?.efootball_verification_status === 'verified';

  // Live validation for edit input
  const isEditIdValid = isValidEfootballId(normalizeEfootballId(editEfootballId));

  // Derive WhatsApp verification status
  const whatsappStatus: WhatsAppVerificationStatus =
    (profile?.whatsapp_verification_status as WhatsAppVerificationStatus) ||
    (profile?.whatsapp_verified ? 'verified' : 'not_submitted');
  const isWhatsappVerified = profile?.whatsapp_verified === true || whatsappStatus === 'verified';

  // Cancel edit mode and revert inputs
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName(displayName);
    setEditEfootballId(efootballId === 'Not Set' ? '' : efootballId);
    setEditWhatsapp(whatsappNumber === 'Not Set' ? '' : whatsappNumber);
  };

  // Save profile changes (eFootball ID, WhatsApp number, Full Name)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    const normId = normalizeEfootballId(editEfootballId);
    if (!isValidEfootballId(normId)) {
      setFeedback({
        message: 'eFootball ID must match format ABCD-123-456-789 (4 uppercase letters, then 9 digits in groups of 3).',
        type: 'error',
      });
      setIsSaving(false);
      return;
    }

    if (!editWhatsapp.trim()) {
      setFeedback({
        message: 'WhatsApp number is required.',
        type: 'error',
      });
      setIsSaving(false);
      return;
    }

    try {
      const res = await updatePlayerProfileAction({
        fullName: editName,
        efootballId: normId,
        whatsappNumber: editWhatsapp,
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
        setIsEditing(false);
        setFeedback({
          message: 'Profile details saved successfully! eFootball ID verified by format.',
          type: 'success',
        });
      } else {
        setFeedback({
          message: res.message || 'Failed to save profile changes.',
          type: 'error',
        });
      }
    } catch {
      setFeedback({ message: 'Network error occurred while saving profile.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Send WhatsApp verification greeting to administrator
  const handleSendWhatsAppGreeting = async () => {
    setIsRequestingWhatsApp(true);
    setFeedback(null);

    const sanitizedAdmin = ADMIN_WHATSAPP_NUMBER.replace(/\D/g, '');
    const greetingText = `Hello Admin! I am verifying my WhatsApp number for the eFootball Tournament Platform.

👤 Player Name: ${displayName}
🎮 eFootball ID: ${efootballId} (Format Verified)
📧 Registered Email: ${userEmail}
📱 My WhatsApp: ${whatsappNumber}`;

    const waUrl = `https://wa.me/${sanitizedAdmin}?text=${encodeURIComponent(greetingText)}`;

    // Open WhatsApp directly in a new window/tab
    if (typeof window !== 'undefined') {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }

    try {
      const res = await requestWhatsAppVerificationAction();
      if (res.success) {
        setProfile((prev) => (prev ? { ...prev, whatsapp_verification_status: 'pending' } : prev));
        setFeedback({
          message: `WhatsApp greeting message opened! Please press Send in WhatsApp to contact the administrator (${ADMIN_WHATSAPP_NUMBER}).`,
          type: 'success',
        });
      } else {
        setFeedback({
          message: `WhatsApp opened! Message: ${res.message}`,
          type: 'success',
        });
      }
    } catch {
      setFeedback({
        message: `WhatsApp greeting opened! Please deliver the message to the administrator (${ADMIN_WHATSAPP_NUMBER}).`,
        type: 'success',
      });
    } finally {
      setIsRequestingWhatsApp(false);
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
    <div className="space-y-8 max-w-4xl text-white">
      {/* Feedback Notification Banner */}
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

      {/* 1. Header Identity Overview Card */}
      <Card className="bg-[#1818D4] border border-white/20 shadow-2xl rounded-[32px] p-4 sm:p-8 text-white relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {/* Player Avatar Initial */}
            <div className="h-14 w-14 sm:h-20 sm:w-20 rounded-full bg-[#0A0A7A] border-2 border-[#FFFF00] flex items-center justify-center text-2xl sm:text-3xl font-black text-[#FFFF00] shadow-[0_0_20px_rgba(255,255,0,0.25)] shrink-0 font-display">
              {displayName.charAt(0).toUpperCase()}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black text-white font-display uppercase tracking-wider truncate">
                  {displayName}
                </h2>
                <Badge className="bg-[#0A0A7A] text-[#FFFF00] border border-white/20 text-[10px] font-black uppercase tracking-wider">
                  Official Competitor
                </Badge>
              </div>

              <p className="text-xs text-white/70 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                <span className="truncate max-w-[170px] sm:max-w-none">{userEmail}</span>
                <span className="text-white/40 hidden sm:inline">•</span>
                <span className="text-[11px] sm:text-xs">Member since {userCreatedAt ? new Date(userCreatedAt).getFullYear() : '2026'}</span>
              </p>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[11px] font-mono font-bold text-[#FFFF00] px-3 py-0.5 rounded-full bg-[#0A0A7A] border border-white/10 uppercase">
                  ID: {efootballId}
                </span>
                <span className="text-[11px] font-mono font-bold text-white/90 px-3 py-0.5 rounded-full bg-[#0A0A7A] border border-white/10">
                  {whatsappNumber}
                </span>
              </div>
            </div>
          </div>

          {/* Action Row: Edit Profile Toggle / Verification Status */}
          <div className="shrink-0 flex items-center gap-3 flex-wrap">
            {!isEditing ? (
              <Button
                onClick={() => setIsEditing(true)}
                variant="outline"
                className="bg-[#0A0A7A] hover:bg-[#1010C5] text-[#FFFF00] border border-[#FFFF00]/40 font-black text-xs px-4 py-2 rounded-full gap-2 uppercase tracking-wider shadow cursor-pointer"
              >
                <Edit3 className="h-4 w-4 text-[#FFFF00]" />
                <span>Edit Profile</span>
              </Button>
            ) : null}

            {isEfootballVerified && isWhatsappVerified ? (
              <Badge className="bg-[#00C853] text-[#08088F] font-black text-xs px-4 py-2 border-0 rounded-full gap-1.5 uppercase tracking-wider shadow-md">
                <ShieldCheck className="h-4 w-4" />
                FULLY VERIFIED
              </Badge>
            ) : isEfootballVerified ? (
              <Badge variant="outline" className="border-[#00C853] bg-[#00C853]/15 text-[#00E676] font-black text-xs px-4 py-2 rounded-full gap-1.5 uppercase tracking-wider">
                <CheckCircle2 className="h-4 w-4 text-[#00E676]" />
                ID VERIFIED
              </Badge>
            ) : (
              <Badge variant="outline" className="border-[#FFFF00] bg-[#FFFF00]/15 text-[#FFFF00] font-black text-xs px-4 py-2 rounded-full gap-1.5 uppercase tracking-wider">
                <Clock className="h-4 w-4 text-[#FFFF00]" />
                PENDING VERIFICATION
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Editing Mode Sticky Actions Banner */}
      {isEditing && (
        <div className="p-4 rounded-2xl bg-[#0A0A7A] border-2 border-[#FFFF00] flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-2">
            <Edit3 className="h-5 w-5 text-[#FFFF00]" />
            <div>
              <h4 className="font-bold text-sm text-white uppercase tracking-wider">Editing Profile Details</h4>
              <p className="text-xs text-white/70">Modify your WhatsApp number, eFootball ID handle, or display name below and click Save.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancelEdit}
              disabled={isSaving}
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-full px-4 h-10 text-xs font-black uppercase cursor-pointer"
            >
              <X className="h-4 w-4 mr-1" />
              <span>Cancel</span>
            </Button>
            <Button
              type="button"
              onClick={handleSaveProfile}
              disabled={isSaving}
              className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs rounded-full px-6 h-10 gap-2 shadow-lg uppercase tracking-wider cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 text-[#08088F]" />
                  <span>Save Changes</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* 2. Personal Information Card */}
      <Card className="bg-[#1818D4] border border-white/20 shadow-xl rounded-[32px] p-4 sm:p-8 text-white space-y-6">
        <div className="border-b border-white/10 pb-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm sm:text-base font-black text-white font-display uppercase tracking-wider flex items-center gap-2">
              <User className="h-4 w-4 text-[#FFFF00]" />
              <span>Account Information</span>
            </h3>
            <p className="text-xs text-white/70 mt-1">
              Your registered competitor credentials and primary sign-in email.
            </p>
          </div>

          {isEditing ? (
            <Badge className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] uppercase tracking-wider">
              Editing Mode
            </Badge>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsEditing(true)}
              className="text-[#FFFF00] hover:text-[#FFFF00] hover:bg-[#FFFF00]/10 text-xs font-black uppercase tracking-wider rounded-full h-8 px-3 gap-1"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Edit Details</span>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Display Name Input / View */}
          <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/15 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">
              Full Name / Display Name
            </span>
            {isEditing ? (
              <Input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. Cristiano Player"
                className="h-10 text-xs bg-[#1818D4] border-white/30 text-white rounded-xl font-bold mt-1 focus-visible:ring-[#FFFF00]"
              />
            ) : (
              <div className="text-sm font-black text-white truncate py-1">{displayName}</div>
            )}
            <span className="text-[10px] text-white/50 block">In-game player identity</span>
          </div>

          {/* Registered Gmail (Fixed) */}
          <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/15 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">
                Registered Gmail
              </span>
              <span className="text-[10px] font-black text-[#00C853]">
                {isEmailVerified ? 'Confirmed' : 'Pending'}
              </span>
            </div>
            <div className="text-sm font-black text-white truncate py-1">{userEmail}</div>
            <span className="text-[10px] text-white/50 block">Primary sign-in account</span>
          </div>

          {/* Account Created Date */}
          <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/15 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-white/60 block">
              Registration Date
            </span>
            <div className="text-sm font-black text-white truncate py-1">
              {userCreatedAt ? new Date(userCreatedAt).toLocaleDateString() : 'Active'}
            </div>
            <span className="text-[10px] text-white/50 block">Platform member</span>
          </div>
        </div>
      </Card>

      {/* 3. eFootball ID Verification Card */}
      <Card className="bg-[#1818D4] border border-white/20 shadow-xl rounded-[32px] p-4 sm:p-8 text-white space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-sm sm:text-base font-black text-white font-display uppercase tracking-wider flex items-center gap-2">
              <Gamepad2 className="h-5 w-5 text-[#FFFF00]" />
              <span>eFootball ID Verification</span>
            </h3>
            <p className="text-xs text-white/70 mt-1">
              Your Konami in-game user ID handle. Verified directly by format structure.
            </p>
          </div>

          <div>
            {isEfootballVerified ? (
              <Badge className="bg-[#00C853] text-[#08088F] font-black text-xs px-3.5 py-1.5 border-0 rounded-full gap-1.5 uppercase tracking-wider shadow-md">
                <CheckCircle2 className="h-3.5 w-3.5" />
                FORMAT VERIFIED
              </Badge>
            ) : (
              <Badge variant="destructive" className="font-black text-xs px-3.5 py-1.5 rounded-full gap-1.5 uppercase tracking-wider shadow-md">
                <AlertCircle className="h-3.5 w-3.5" />
                INVALID FORMAT
              </Badge>
            )}
          </div>
        </div>

        {/* eFootball ID Details / Edit Field */}
        <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/15 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/70">
              Registered In-Game Handle (eid)
            </span>
            <span className="text-[10px] text-[#00E676] font-mono font-bold">
              ✓ Verified by Format (ABCD-123-456-789)
            </span>
          </div>

          {isEditing ? (
            <div className="space-y-1.5">
              <Input
                type="text"
                value={editEfootballId}
                onChange={(e) => setEditEfootballId(e.target.value.toUpperCase())}
                placeholder="ABCD-123-456-789"
                className="font-mono text-lg font-black bg-[#1818D4] border-white/30 text-[#FFFF00] rounded-xl tracking-wider focus-visible:ring-[#FFFF00]"
              />
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/60">Pattern: 4 uppercase letters, then 9 digits in groups of 3</span>
                {isEditIdValid ? (
                  <span className="text-[#00E676] font-bold">✓ Valid Konami Format</span>
                ) : (
                  <span className="text-red-400 font-bold">Requires ABCD-123-456-789</span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xl sm:text-2xl font-mono font-black text-[#FFFF00] tracking-wider py-1">
              {efootballId}
            </div>
          )}

          <p className="text-[11px] text-white/60 pt-1 border-t border-white/10">
            eFootball ID is verified directly via official Konami format specification. Permanently registered to your tournament brackets and matches.
          </p>
        </div>
      </Card>

      {/* 4. WhatsApp Number Verification Card */}
      <Card className="bg-[#1818D4] border border-white/20 shadow-xl rounded-[32px] p-4 sm:p-8 text-white space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-sm sm:text-base font-black text-white font-display uppercase tracking-wider flex items-center gap-2">
              <Phone className="h-5 w-5 text-[#FFFF00]" />
              <span>WhatsApp Verification</span>
            </h3>
            <p className="text-xs text-white/70 mt-1">
              Verify your contact by sending a greeting message to our tournament administrator on WhatsApp.
            </p>
          </div>

          <div>
            {isWhatsappVerified ? (
              <Badge className="bg-[#00C853] text-[#08088F] font-black text-xs px-3.5 py-1.5 border-0 rounded-full gap-1.5 uppercase tracking-wider shadow-md">
                <CheckCircle2 className="h-3.5 w-3.5" />
                VERIFIED WHATSAPP
              </Badge>
            ) : whatsappStatus === 'pending' ? (
              <Badge variant="outline" className="border-[#FFFF00] bg-[#FFFF00]/15 text-[#FFFF00] font-black text-xs px-3.5 py-1.5 rounded-full gap-1.5 uppercase tracking-wider">
                <Clock className="h-3.5 w-3.5 text-[#FFFF00]" />
                GREETING SENT • PENDING REVIEW
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-[#0A0A7A] text-white/70 border-white/20 text-xs px-3.5 py-1.5 rounded-full uppercase tracking-wider">
                NOT VERIFIED
              </Badge>
            )}
          </div>
        </div>

        {/* Registered WhatsApp Display / Edit Field */}
        <div className="p-4 rounded-2xl bg-[#0A0A7A] border border-white/15 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/70">
              Registered WhatsApp Contact (Number)
            </span>
            <span className="text-[10px] text-white/60 font-mono">E.164 Format</span>
          </div>

          {isEditing ? (
            <div className="space-y-1.5">
              <Input
                type="tel"
                value={editWhatsapp}
                onChange={(e) => setEditWhatsapp(e.target.value)}
                placeholder="+919207516227"
                className="font-mono text-base font-bold bg-[#1818D4] border-white/30 text-white rounded-xl focus-visible:ring-[#FFFF00]"
              />
              <span className="text-[11px] text-white/60 block">Include country code with plus prefix (e.g. +919876543210)</span>
            </div>
          ) : (
            <div className="text-xl sm:text-2xl font-mono font-black text-white tracking-wider py-1">
              {whatsappNumber}
            </div>
          )}

          {/* Rejection Notice if rejected */}
          {whatsappStatus === 'rejected' && profile?.whatsapp_rejection_reason && (
            <div className="p-3 rounded-xl bg-destructive/20 border border-destructive/40 text-red-200 text-xs space-y-1">
              <span className="font-bold block text-red-300">Rejection Reason:</span>
              <p>{profile.whatsapp_rejection_reason}</p>
            </div>
          )}

          {/* Action Row */}
          <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-[11px] text-white/60 max-w-md">
              {isWhatsappVerified
                ? 'Your WhatsApp contact is verified by the administrator and ready for official fixtures.'
                : whatsappStatus === 'pending'
                ? `Greeting message opened! Please ensure the message is sent to admin (${ADMIN_WHATSAPP_NUMBER}) on WhatsApp.`
                : `Send a quick verification greeting to our administrator on WhatsApp (${ADMIN_WHATSAPP_NUMBER}) to confirm your contact.`}
            </p>

            <div className="flex items-center gap-2">
              {isWhatsappVerified ? (
                <div className="inline-flex items-center gap-1.5 text-xs font-black text-[#00C853] uppercase tracking-wider bg-[#00C853]/15 px-4 py-2 rounded-full border border-[#00C853]/30">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Officially Verified</span>
                </div>
              ) : (
                <Button
                  onClick={handleSendWhatsAppGreeting}
                  disabled={isRequestingWhatsApp || isEditing}
                  size="sm"
                  className="w-full sm:w-auto bg-[#25D366] hover:bg-[#20BD5A] text-white font-black text-xs rounded-full px-5 h-auto min-h-10 py-2.5 gap-2 shadow-lg uppercase tracking-wider cursor-pointer disabled:opacity-50 text-center justify-center whitespace-normal"
                >
                  {isRequestingWhatsApp ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white shrink-0" />
                  ) : (
                    <MessageCircle className="h-4 w-4 text-white shrink-0" />
                  )}
                  <span>
                    {whatsappStatus === 'pending'
                      ? 'Re-send WhatsApp Greeting'
                      : 'Send Verification Message to Admin'}
                  </span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Account Security & Sign Out Actions */}
      <Card className="bg-[#1818D4] border border-white/20 shadow-xl rounded-[32px] p-4 sm:p-6 text-white space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-white uppercase tracking-wider">Account Credentials</h4>
              <p className="text-xs text-white/60">Manage your sign-in password and active dashboard session.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-white/20 text-white hover:bg-white/10 rounded-full h-10 px-5 text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              <Link href="/forgot-password">
                <KeyRound className="h-3.5 w-3.5 mr-1 text-[#FFFF00]" />
                <span>Reset Password</span>
              </Link>
            </Button>

            <Button
              onClick={handleSignOut}
              disabled={isSigningOut}
              variant="outline"
              size="sm"
              className="border-red-400/40 text-red-300 hover:bg-red-500/20 rounded-full h-10 px-5 text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              {isSigningOut ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  <span>Signing out...</span>
                </>
              ) : (
                <>
                  <LogOut className="h-3.5 w-3.5 mr-1" />
                  <span>Sign Out</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
