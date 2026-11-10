import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ShieldCheck,
  Scale,
  ChevronLeft,
  Calendar,
  AlertTriangle,
  Award,
  DollarSign,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Terms & Conditions | eFootball Tournament Platform',
  description: 'Official rules, eligibility requirements, match guidelines, and prize distribution terms.',
};

const CLAUSES = [
  {
    num: 1,
    title: 'Eligibility & Age Requirements',
    content:
      'Participation in tournaments is open to individuals aged 13 years or older. Participants under 18 years of age must possess valid permission from a legal parent or guardian. By registering, you warrant that all personal and identity information provided is true, accurate, and belongs solely to you.',
  },
  {
    num: 2,
    title: 'Platform Purpose & Scope',
    content:
      'This platform serves as an independent esports competition hub organizing community and competitive tournaments for eFootball mobile/console players. We are not officially affiliated with Konami Digital Entertainment. All tournaments are conducted under fair-play skill gaming principles.',
  },
  {
    num: 3,
    title: 'Account Responsibility & Integrity',
    content:
      'Each player is permitted exactly one registered account. Account sharing, smurfing (using alternate lower-tier accounts), and proxy playing are strictly forbidden. Any player discovered competing under multiple accounts will face immediate disqualification and a permanent platform ban.',
  },
  {
    num: 4,
    title: 'Tournament Rules & Match Formats',
    content:
      'Tournaments are contested under published tournament formats (Single Elimination Knockout, Group Stage + Knockout, or Round Robin). Match durations, extra time rules, and penalty shootout parameters must conform strictly to the published tournament schedule and room setup guidelines.',
  },
  {
    num: 5,
    title: 'Entry Fees & Refund Policy',
    content:
      'For paid-entry tournaments, all entry fees are non-refundable once the tournament bracket is generated and the first round kickoffs begin. In the event of a tournament cancellation initiated by administrators prior to completion, players will receive a full 100% refund of their entry fee via manual payment transfer.',
  },
  {
    num: 6,
    title: 'Prize Distribution Policy (24-Hour SLA)',
    content:
      'All tournament prize distributions are processed manually outside the platform via direct Bank Transfer (NEFT/IMPS) or Unified Payments Interface (UPI). We commit to a strict 24-hour SLA from the conclusion and official verification of the tournament final. Players must have saved valid payment details in their Profile to receive payouts.',
  },
  {
    num: 7,
    title: 'Match Scheduling & Forfeit Policy',
    content:
      'Players are given a mandatory 10-minute check-in grace period from the official match scheduled start time. Failure to enter the live game room, respond to the opponent, or check in within 10 minutes grants the active opponent the right to submit a formal "No-Show Walkover Claim". Forfeits are verified by administrators.',
  },
  {
    num: 8,
    title: 'Match Result Reporting & Verification',
    content:
      'Both players are required to submit their final match scores within 30 minutes of match completion via the Match Desk. If both players report matching scores, the result is automatically verified. If conflicting scores are submitted, the match transitions to "DISPUTED" status and evidence review is triggered.',
  },
  {
    num: 9,
    title: 'Fair Play & Anti-Cheating Policy',
    content:
      'We maintain a strict zero-tolerance policy regarding intentional network tampering (lag-switching), unauthorized modifications, exploiting software glitches, or intentional match disconnections. Verified cheating results in immediate forfeiture of all prizes, removal from active brackets, and blacklisting.',
  },
  {
    num: 10,
    title: 'Match Disputes & Administrative Decisions',
    content:
      'In the event of a match dispute, both competitors must upload clear, unedited full-screen screenshot proof displaying final scores and match statistics. Official tournament administrator rulings are authoritative, binding, and final once ticket review concludes.',
  },
  {
    num: 11,
    title: 'Content & Screenshot Rights',
    content:
      'By submitting match screenshots, video recordings, and game clips, participants grant the platform a perpetual, non-exclusive right to utilize such media for dispute verification, administrative recordkeeping, highlights, and community broadcast showcases.',
  },
  {
    num: 12,
    title: 'Code of Conduct & Community Standards',
    content:
      'Players must treat opponents, stream moderators, and tournament administrators with respect. Abusive language, hate speech, harassment, threatening behavior in match chats, or spamming opponents via WhatsApp will result in penalties, match disqualification, or account suspension.',
  },
  {
    num: 13,
    title: 'Platform Liability & Service Availability',
    content:
      'The platform is not liable for match disruptions, lag, or disconnections arising from eFootball game server outages, local internet provider dropouts, or mobile device hardware failures. In extreme widespread server outages, administrators reserve the right to reschedule affected fixtures.',
  },
  {
    num: 14,
    title: 'Account Suspension & Termination',
    content:
      'Tournament administrators reserve the right to suspend, terminate, or restrict account access for repeated rule breaches, toxicity, falsification of eFootball ID credentials, fraudulent payment claims, or abusive dispute filings. All pending prize allocations are forfeited upon account termination for cause.',
  },
  {
    num: 15,
    title: 'Amendments & Updates to Terms',
    content:
      'The platform reserves the right to amend or update these terms and conditions at any time. When substantial amendments are published, active players will receive notice via the Notification Center and may be prompted to review and reaffirm acceptance upon their next login.',
  },
];

export default function TermsAndConditionsPage() {
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
            Version 1.0 • Active
          </Badge>
        </div>

        {/* Hero Header */}
        <div className="space-y-3 border-b border-white/10 pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#05053B] border border-white/10 text-[#FFFF00] text-xs font-black uppercase tracking-wider">
            <Scale className="w-3.5 h-3.5" />
            <span>Official Esports Tournament Regulations</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black font-display uppercase tracking-wider text-white">
            Terms & Conditions
          </h1>
          <p className="text-xs sm:text-sm text-white/70 max-w-2xl leading-relaxed">
            Please read these official platform terms, match conduct regulations, and prize distribution rules carefully before competing in tournaments.
          </p>
          <div className="flex items-center gap-4 text-[11px] text-white/50 pt-2">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#FFFF00]" />
              Effective Date: November 10, 2026
            </span>
            <span>•</span>
            <span className="text-[#00C853] font-bold">15 Comprehensive Clauses</span>
          </div>
        </div>

        {/* Clauses List */}
        <div className="space-y-4">
          {CLAUSES.map((clause) => (
            <Card
              key={clause.num}
              className="bg-[#1818D4] border border-white/20 rounded-2xl p-6 text-white shadow-lg space-y-3 transition-all hover:border-[#FFFF00]/40"
            >
              <div className="flex items-start gap-4">
                <span className="w-8 h-8 rounded-xl bg-[#05053B] border border-white/10 flex items-center justify-center font-black text-xs text-[#FFFF00] shrink-0 font-display">
                  {clause.num < 10 ? `0${clause.num}` : clause.num}
                </span>
                <div className="space-y-1.5">
                  <h2 className="text-base font-black uppercase tracking-wider text-white font-display">
                    {clause.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-white/80 leading-relaxed font-normal">
                    {clause.content}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Legal Sign-off Footer */}
        <Card className="bg-[#05053B] border border-white/10 rounded-2xl p-6 text-center space-y-3">
          <ShieldCheck className="w-8 h-8 text-[#00C853] mx-auto" />
          <h3 className="text-sm font-black uppercase tracking-wider text-white font-display">
            Commitment to Fair Esports Competition
          </h3>
          <p className="text-xs text-white/60 max-w-lg mx-auto leading-relaxed">
            All players registered on this platform agree to abide by these regulations without exception. For legal questions or rule clarifications, contact platform administration at support.
          </p>
          <div className="pt-2 flex items-center justify-center gap-4 text-xs font-black uppercase tracking-wider">
            <Link href="/privacy" className="text-[#FFFF00] hover:underline">
              Privacy Policy
            </Link>
            <span className="text-white/30">•</span>
            <Link href="/contact" className="text-white/70 hover:text-white hover:underline">
              Contact Admin
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
