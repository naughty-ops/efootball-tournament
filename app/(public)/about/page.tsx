import React from 'react';
import Link from 'next/link';
import { Shield, Trophy, Users, Zap, Globe, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AboutPage() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12 text-white">
      {/* Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFFF00] text-[#08088F] text-[11px] font-black uppercase tracking-widest">
          ⚡ Official Platform
        </div>
        <h1 className="text-3xl sm:text-5xl font-black font-display tracking-wider uppercase text-white">
          About eFootball Platform
        </h1>
        <p className="text-sm sm:text-base text-[#D9DCFF]/90 max-w-2xl font-medium leading-relaxed">
          The premier esports hub for competitive football gaming — providing real-time bracket generation, live stream viewing, transparent point tables, and verified player standings.
        </p>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
        <Card className="bg-[#1818D4] border-white/20 text-white rounded-[28px] p-2 hover:border-[#FFFF00] transition-all shadow-xl">
          <CardHeader className="space-y-3 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0A0A7A] text-[#FFFF00] shadow-md">
              <Trophy className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-black font-display uppercase tracking-wide text-white">
              Public Tournament Portal
            </CardTitle>
            <CardDescription className="text-xs text-[#D9DCFF]/80 leading-relaxed font-medium">
              Enables competitive gaming fans and players to follow active fixtures, track real-time scores, and inspect symmetrical playoff brackets without authentication barriers.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-[#1818D4] border-white/20 text-white rounded-[28px] p-2 hover:border-[#FFFF00] transition-all shadow-xl">
          <CardHeader className="space-y-3 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0A0A7A] text-[#FFFF00] shadow-md">
              <Shield className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-black font-display uppercase tracking-wide text-white">
              Secure Administration
            </CardTitle>
            <CardDescription className="text-xs text-[#D9DCFF]/80 leading-relaxed font-medium">
              Protected administration controls for verifying match results, penalty shootouts, participant rosters, and scheduling tournament stages safely with audit logs.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-[#1818D4] border-white/20 text-white rounded-[28px] p-2 hover:border-[#FFFF00] transition-all shadow-xl">
          <CardHeader className="space-y-3 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0A0A7A] text-[#FFFF00] shadow-md">
              <Zap className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-black font-display uppercase tracking-wide text-white">
              Live WebRTC Streaming
            </CardTitle>
            <CardDescription className="text-xs text-[#D9DCFF]/80 leading-relaxed font-medium">
              Watch featured tournament championship fixtures live in high definition via integrated low-latency WebRTC broadcasts with real-time viewer engagement.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-[#1818D4] border-white/20 text-white rounded-[28px] p-2 hover:border-[#FFFF00] transition-all shadow-xl">
          <CardHeader className="space-y-3 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0A0A7A] text-[#FFFF00] shadow-md">
              <Users className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-black font-display uppercase tracking-wide text-white">
              Competitor Profiles
            </CardTitle>
            <CardDescription className="text-xs text-[#D9DCFF]/80 leading-relaxed font-medium">
              Every participant receives an authenticated player hub to verify their in-game handle, monitor upcoming match queues, and track career tournament records.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Call to Action Banner */}
      <div className="p-8 rounded-[32px] bg-[#1010C5] border border-white/20 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-xl font-black font-display uppercase tracking-wide text-white">Ready to Compete?</h3>
          <p className="text-xs text-[#D9DCFF]/80 font-medium">Explore open tournament registrations and secure your slot today.</p>
        </div>
        <Button asChild className="bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] font-black uppercase tracking-wider rounded-full h-11 px-6 shadow-lg shrink-0">
          <Link href="/tournaments" className="flex items-center gap-2">
            <span>Browse Tournaments</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
