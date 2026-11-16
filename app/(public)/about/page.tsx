import React from 'react';
import Link from 'next/link';
import { Shield, Trophy, Users, Zap, Globe, ArrowRight, Flame, Sparkles } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AboutPage() {
  return (
    <div className="space-y-10 max-w-5xl mx-auto pb-16 text-white">
      {/* Hero Banner Header matching homepage */}
      <div className="relative overflow-hidden rounded-[32px] sm:rounded-[40px] bg-gradient-to-br from-[#1E1EF5] via-[#2A2AFF] to-[#1212B8] p-6 sm:p-10 lg:p-12 border border-white/20 shadow-2xl space-y-5">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#FFFF00]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-[#FF168B]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[#FFFF00] text-xs font-black uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Official Esports Platform</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black font-display uppercase tracking-tight text-white leading-[1.05]">
            COMPETITIVE FOOTBALL <br />
            <span className="text-[#FFFF00]">ELEVATED TO ESPORTS</span>
          </h1>

          <p className="text-sm sm:text-base text-[#D9DCFF] max-w-2xl leading-relaxed font-medium">
            The premier esports hub for competitive football gaming — delivering automated bracket generation, live stream viewing, transparent point tables, instant 1v1 challenges, and verified player standings.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button asChild className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-xs sm:text-sm uppercase tracking-wider px-6 py-3 shadow-xl hover:scale-105 active:scale-95 transition-all">
              <Link href="/tournaments">
                Browse Tournaments
              </Link>
            </Button>
            <Button asChild className="rounded-full bg-[#FF168B] hover:bg-[#FF168B]/90 text-white font-black text-xs sm:text-sm uppercase tracking-wider px-6 py-3 shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5">
              <Link href="/dashboard/matches?mode=1v1" className="flex items-center gap-1.5">
                <Flame className="h-4 w-4 fill-white" />
                <span>1 VS 1 Arena</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
        <Card className="bg-[#1010C5] border-white/15 text-white rounded-3xl p-2 hover:border-[#FFFF00] hover:bg-[#1414D8] transition-all shadow-xl">
          <CardHeader className="space-y-3 p-5 sm:p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#08088F] text-[#FFFF00] shadow-md border border-white/10">
              <Trophy className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-black font-display uppercase tracking-wide text-white">
              Public Tournament Portal
            </CardTitle>
            <CardDescription className="text-xs text-[#D9DCFF]/90 leading-relaxed font-medium">
              Enables competitive gaming fans and players to follow active fixtures, track real-time scores, and inspect symmetrical playoff brackets without authentication barriers.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-[#1010C5] border-white/15 text-white rounded-3xl p-2 hover:border-[#FFFF00] hover:bg-[#1414D8] transition-all shadow-xl">
          <CardHeader className="space-y-3 p-5 sm:p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#08088F] text-[#FFFF00] shadow-md border border-white/10">
              <Shield className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-black font-display uppercase tracking-wide text-white">
              Secure Administration
            </CardTitle>
            <CardDescription className="text-xs text-[#D9DCFF]/90 leading-relaxed font-medium">
              Protected administration controls for verifying match results, penalty shootouts, participant rosters, and scheduling tournament stages safely with audit logs.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-[#1010C5] border-white/15 text-white rounded-3xl p-2 hover:border-[#FFFF00] hover:bg-[#1414D8] transition-all shadow-xl">
          <CardHeader className="space-y-3 p-5 sm:p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#08088F] text-[#FFFF00] shadow-md border border-white/10">
              <Zap className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-black font-display uppercase tracking-wide text-white">
              Live WebRTC Streaming
            </CardTitle>
            <CardDescription className="text-xs text-[#D9DCFF]/90 leading-relaxed font-medium">
              Watch featured tournament championship fixtures live in high definition via integrated low-latency WebRTC broadcasts with real-time viewer engagement.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-[#1010C5] border-white/15 text-white rounded-3xl p-2 hover:border-[#FFFF00] hover:bg-[#1414D8] transition-all shadow-xl">
          <CardHeader className="space-y-3 p-5 sm:p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#08088F] text-[#FFFF00] shadow-md border border-white/10">
              <Users className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-black font-display uppercase tracking-wide text-white">
              Competitor Profiles & Wallet
            </CardTitle>
            <CardDescription className="text-xs text-[#D9DCFF]/90 leading-relaxed font-medium">
              Every participant receives an authenticated player hub to verify their in-game handle, monitor upcoming match queues, claim prizes, and track career tournament records.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Call to Action Banner */}
      <div className="p-8 sm:p-10 rounded-[32px] bg-gradient-to-r from-[#1010A8] to-[#1818D4] border border-white/20 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-2xl font-black font-display uppercase tracking-wide text-white">Ready to Compete?</h3>
          <p className="text-xs sm:text-sm text-[#D9DCFF]/90 font-medium">Explore open tournament registrations and secure your slot today.</p>
        </div>
        <Button asChild className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black uppercase tracking-wider text-xs sm:text-sm h-12 px-7 shadow-xl hover:scale-105 active:scale-95 transition-all shrink-0">
          <Link href="/tournaments" className="flex items-center gap-2">
            <span>Browse Tournaments</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
