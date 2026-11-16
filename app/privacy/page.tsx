import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  Shield,
  Lock,
  ChevronLeft,
  Calendar,
  Database,
  Eye,
  Key,
  UserCheck,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import PublicHeader from '@/components/public/PublicHeader';
import PublicFooter from '@/components/public/PublicFooter';
import { ThemeSideAngles, ThemeAmbientGlow } from '@/components/shared/ThemeDecorations';

export const metadata: Metadata = {
  title: 'Privacy Policy | eFootball Tournament Platform',
  description: 'How we collect, protect, encrypt, and handle your player identity and payout data.',
};

const SECTIONS = [
  {
    icon: Database,
    title: '1. Information We Collect',
    content:
      'We collect the minimal data required to provide competitive tournament matchmaking and prize disbursements: your email address, display name, in-game eFootball ID, WhatsApp phone number (for match coordination), and optional payment details (Bank Account number, IFSC code, and UPI ID) saved in your Profile for prize payouts.',
  },
  {
    icon: Eye,
    title: '2. How We Use Your Information',
    content:
      'Your information is strictly used to: (a) authenticate your account and ensure one-player-one-account integrity; (b) verify match readiness and facilitate room code coordination via WhatsApp; (c) verify player skill ratings and maintain career stats; and (d) disburse manual prize money to verified bank accounts or UPI IDs following tournament completion.',
  },
  {
    icon: Lock,
    title: '3. Data Security & Encryption at Rest',
    content:
      'Sensitive banking details and financial identifiers are encrypted at rest within our Supabase PostgreSQL infrastructure using industry-grade cryptography. Bank account numbers are permanently masked on client interfaces (showing only terminal digits), and sensitive fields are protected by strict Row Level Security (RLS) policies.',
  },
  {
    icon: Key,
    title: '4. Third-Party Sharing & Marketing',
    content:
      'We never sell, rent, or trade your personal information or contact details to third-party advertisers or external marketing brokers. Data is accessible solely to authorized platform administrators strictly for tournament verification and manual prize fulfillment.',
  },
  {
    icon: UserCheck,
    title: '5. Your Rights & Data Control',
    content:
      'You maintain full control over your personal information. You can edit your display name, eFootball ID, and payment methods at any time via Settings Center. You also possess the right to request an export of your career match logs or request complete deletion of your account and associated records.',
  },
  {
    icon: Shield,
    title: '6. Cookies & Local Session Storage',
    content:
      'We utilize secure HTTP-only session cookies and local storage tokens solely to maintain authenticated sessions and manage UI state. We do not deploy invasive cross-site tracking cookies.',
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#08088F] text-white w-full relative overflow-x-hidden">
      {/* Stadium Ambient Lighting Atmosphere */}
      <ThemeAmbientGlow />

      {/* Decorative Yellow Angles matching public home */}
      <ThemeSideAngles />

      {/* Centered Pill Public Header Navigation */}
      <PublicHeader />

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative z-20 app-view-transition space-y-8">
        {/* Navigation & Back */}
        <div className="flex items-center justify-between">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-9 px-4 text-xs text-[#D9DCFF] hover:text-white hover:bg-white/10 rounded-full font-bold cursor-pointer"
          >
            <Link href="/">
              <ChevronLeft className="h-4 w-4 mr-1 text-[#FFFF00]" />
              Back to Home
            </Link>
          </Button>

          <Badge className="bg-[#FFFF00] text-[#08088F] font-black uppercase tracking-wider text-[11px] px-3.5 py-1 rounded-full shadow-md">
            Privacy Standards • Active
          </Badge>
        </div>

        {/* Hero Header */}
        <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#1E1EF5] via-[#2A2AFF] to-[#1212B8] p-6 sm:p-10 border border-white/20 shadow-2xl space-y-4">
          <div className="absolute top-0 right-0 w-72 h-72 bg-[#FFFF00]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[#FFFF00] text-xs font-black uppercase tracking-wider">
            <Lock className="w-3.5 h-3.5" />
            <span>Player Privacy & Data Protection</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black font-display uppercase tracking-tight text-white leading-tight">
            Privacy Policy
          </h1>
          <p className="text-xs sm:text-sm text-[#D9DCFF] max-w-2xl leading-relaxed font-medium">
            We are dedicated to safeguarding your personal data, gamer identity, and financial payout details through modern encryption, strict access controls, and transparent practices.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#D9DCFF]/80 pt-2 font-medium">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#FFFF00]" />
              Last Updated: November 2026
            </span>
            <span>•</span>
            <span className="text-[#00E676] font-bold">256-Bit Cryptographic Storage</span>
          </div>
        </div>

        {/* Policy Sections */}
        <div className="space-y-4">
          {SECTIONS.map((sec, idx) => {
            const Icon = sec.icon;
            return (
              <Card
                key={idx}
                className="bg-[#1010C5] border border-white/15 rounded-3xl p-5 sm:p-6 text-white shadow-xl space-y-3 transition-all hover:border-[#FFFF00]/60 hover:bg-[#1414D8]"
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-[#08088F] border border-white/15 flex items-center justify-center text-[#FFFF00] shrink-0 shadow-inner">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <h2 className="text-base sm:text-lg font-black uppercase tracking-wide text-white font-display">
                      {sec.title}
                    </h2>
                    <p className="text-xs sm:text-sm text-[#D9DCFF] leading-relaxed font-normal">
                      {sec.content}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Bottom Support Callout Card */}
        <Card className="bg-[#1010C5] border border-white/20 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-xl">
          <div className="h-12 w-12 rounded-2xl bg-[#08088F] text-[#00E676] border border-white/15 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-black uppercase tracking-wider text-white font-display">
            Questions Regarding Your Data?
          </h3>
          <p className="text-xs sm:text-sm text-[#D9DCFF] max-w-lg mx-auto leading-relaxed">
            If you have questions about how your data is handled or wish to submit a data erasure request, submit a ticket to the Platform Data Protection Officer.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Button asChild className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs uppercase tracking-wider px-6 py-2.5 shadow-lg">
              <Link href="/terms">
                Terms & Conditions
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full border-2 border-white/60 hover:border-white text-white font-black text-xs uppercase tracking-wider px-6 py-2.5 hover:bg-white/10">
              <Link href="/contact">
                Contact Desk
              </Link>
            </Button>
          </div>
        </Card>
      </main>

      {/* eFootball Gaming Public Footer */}
      <PublicFooter />
    </div>
  );
}
