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
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
    <div className="min-h-screen bg-[#08088F] text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation & Back */}
        <div className="flex items-center justify-between">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-xs text-white/70 hover:text-white rounded-full cursor-pointer"
          >
            <Link href="/dashboard/settings">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Settings & Policies
            </Link>
          </Button>

          <Badge className="bg-[#FFFF00] text-[#08088F] font-black uppercase tracking-wider text-[10px] px-3 py-1">
            Privacy Standards • Active
          </Badge>
        </div>

        {/* Hero Header */}
        <div className="space-y-3 border-b border-white/10 pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#05053B] border border-white/10 text-[#FFFF00] text-xs font-black uppercase tracking-wider">
            <Lock className="w-3.5 h-3.5" />
            <span>Player Privacy & Data Protection</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black font-display uppercase tracking-wider text-white">
            Privacy Policy
          </h1>
          <p className="text-xs sm:text-sm text-white/70 max-w-2xl leading-relaxed">
            We are dedicated to safeguarding your personal data, identity, and financial payout details through modern encryption, strict access controls, and transparent practices.
          </p>
          <div className="flex items-center gap-4 text-[11px] text-white/50 pt-2">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#FFFF00]" />
              Last Updated: November 10, 2026
            </span>
            <span>•</span>
            <span className="text-[#00C853] font-bold">Encrypted at Rest</span>
          </div>
        </div>

        {/* Policy Sections */}
        <div className="space-y-4">
          {SECTIONS.map((sec, idx) => {
            const Icon = sec.icon;
            return (
              <Card
                key={idx}
                className="bg-[#1818D4] border border-white/20 rounded-2xl p-6 text-white shadow-lg space-y-3 transition-all hover:border-[#FFFF00]/40"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#05053B] border border-white/10 flex items-center justify-center text-[#FFFF00] shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-base font-black uppercase tracking-wider text-white font-display">
                      {sec.title}
                    </h2>
                    <p className="text-xs sm:text-sm text-white/80 leading-relaxed font-normal">
                      {sec.content}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        <Card className="bg-[#05053B] border border-white/10 rounded-2xl p-6 text-center space-y-3">
          <CheckCircle2 className="w-8 h-8 text-[#00C853] mx-auto" />
          <h3 className="text-sm font-black uppercase tracking-wider text-white font-display">
            Questions Regarding Your Data?
          </h3>
          <p className="text-xs text-white/60 max-w-lg mx-auto leading-relaxed">
            If you have questions about how your data is handled or wish to submit a data erasure request, submit a ticket to the Platform Data Protection Officer.
          </p>
          <div className="pt-2 flex items-center justify-center gap-4 text-xs font-black uppercase tracking-wider">
            <Link href="/terms" className="text-[#FFFF00] hover:underline">
              Terms & Conditions
            </Link>
            <span className="text-white/30">•</span>
            <Link href="/contact" className="text-white/70 hover:text-white hover:underline">
              Submit Inquiry
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
