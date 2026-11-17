'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Bell,
  Sparkles,
  ArrowRight,
  Play,
  Flame,
  Wallet,
  Swords,
  Users,
  ShieldCheck,
  Zap,
  Eye,
  ChevronRight,
  Trophy,
  Calendar,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface VisualPreviewProps {
  sectionKey: string;
  content: Record<string, any>;
}

export function HomepageVisualPreview({ sectionKey, content }: VisualPreviewProps) {
  switch (sectionKey) {
    case 'announcements':
      return (
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase text-[#FFFF00] tracking-wider mb-2">
            Top Banner Live Preview
          </div>
          <div className="w-full rounded-full bg-[#FFFF00] text-[#08088F] px-4 sm:px-6 py-2.5 sm:py-3 shadow-xl flex items-center justify-between gap-3 font-bold text-xs sm:text-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-7 w-7 rounded-full bg-[#08088F] text-[#FFFF00] flex items-center justify-center shrink-0 shadow-md">
                <Bell className="h-4 w-4" />
              </div>
              <span className="hidden sm:inline bg-[#08088F] text-[#FFFF00] px-3 py-0.5 rounded-full text-xs font-black uppercase shrink-0">
                {content.badge_text || 'SEASON 2026'}
              </span>
              <p className="truncate font-black text-xs sm:text-sm tracking-tight">
                {content.headline || 'Announcement Headline Here...'}
              </p>
            </div>
            <span className="bg-white text-[#08088F] px-4 py-1 rounded-full text-xs font-black shrink-0 uppercase tracking-wider shadow-sm">
              {content.cta_label || 'Register Now'}
            </span>
          </div>
        </div>
      );

    case 'hero_banner':
      return (
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase text-[#FFFF00] tracking-wider mb-2">
            Hero Arena Live Preview
          </div>
          <div className="relative rounded-[28px] bg-gradient-to-br from-[#1E1EF5] via-[#2A2AFF] to-[#1212B8] p-6 border border-white/20 shadow-2xl overflow-hidden text-white">
            <div className="space-y-4 max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/10 border border-white/20 text-[10px] font-black uppercase text-[#FFFF00]">
                <Sparkles className="h-3 w-3" />
                <span>{content.tagline || 'OFFICIAL COMPETITIVE ARENA'}</span>
              </div>

              <h1 className="text-2xl sm:text-4xl font-black uppercase tracking-tight leading-none font-display">
                {content.title_main || 'THE PITCH'}{' '}
                <span className="text-[#FFFF00]">{content.title_highlight || 'IS OURS'}</span>
              </h1>

              <p className="text-xs text-[#D9DCFF] line-clamp-3 leading-relaxed font-medium">
                {content.subtitle || 'Konami eFootball tournament platform...'}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="rounded-full bg-[#FFFF00] text-[#08088F] font-black text-xs uppercase px-5 py-2 shadow-lg">
                  {content.primary_button_label || 'Join Tournaments'}
                </span>
                <span className="rounded-full bg-[#FF168B] text-white font-black text-xs uppercase px-5 py-2 shadow-lg flex items-center gap-1.5">
                  <Flame className="h-3.5 w-3.5 fill-white" />
                  <span>1 VS 1 Arena</span>
                </span>
                <span className="rounded-full border border-white/60 text-white font-black text-xs uppercase px-5 py-2 flex items-center gap-1.5">
                  <Play className="h-3.5 w-3.5 fill-white" />
                  <span>{content.secondary_button_label || 'Watch Arena'}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      );

    case 'arena_1v1':
      const tiers = Array.isArray(content.tiers) ? content.tiers : [];
      return (
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase text-[#FFFF00] tracking-wider mb-2">
            1 VS 1 Arena Live Preview
          </div>
          <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#08088F] via-[#0A0A7A] to-[#070748] border-2 border-blue-400/30 p-6 shadow-2xl text-white space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-[#FF168B] text-white font-black text-[10px] uppercase tracking-widest px-3 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                <Flame className="h-3 w-3 fill-current" />
                <span>{content.badge || '1 VS 1 ARENA'}</span>
              </span>
              <span className="bg-emerald-500/15 border border-emerald-500/30 text-[#00E676] text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                {content.pill1_text || 'Instant 24/7 Matchmaking'}
              </span>
              <span className="bg-[#FFFF00]/15 border border-[#FFFF00]/30 text-[#FFFF00] text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Wallet className="h-2.5 w-2.5" />
                <span>{content.pill2_text || 'Instant Wallet Prize Payouts'}</span>
              </span>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-black font-display uppercase tracking-tight text-white leading-tight">
                {content.title_main || 'HEAD-TO-HEAD BATTLES'}{' '}
                <span className="text-[#FFFF00]">{content.title_highlight || 'PLAY ANYTIME, WIN REAL PRIZES'}</span>
              </h2>
              <p className="text-xs text-[#D9DCFF] mt-1 max-w-lg line-clamp-2">
                {content.subtitle || 'Fast-paced 1v1 matches with instant wallet payouts...'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              {tiers.slice(0, 3).map((tier: any, i: number) => (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-[#1010C5] border border-white/15 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-black uppercase text-[#FFFF00]">
                        {tier.name || 'Tier'}
                      </span>
                      {tier.badge && (
                        <span className="text-[9px] font-bold px-1 rounded bg-white/10 text-white/80">
                          {tier.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-white/70 mt-0.5">
                      Entry: ₹{tier.entry_inr} • <span className="text-[#00E676] font-bold">Prize: ₹{tier.prize_inr}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#FFFF00]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case 'featured_tournament':
      return (
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase text-[#FFFF00] tracking-wider mb-2">
            Spotlight Tournament Live Preview
          </div>
          <div className="rounded-2xl bg-[#1010A8] border border-white/15 overflow-hidden shadow-xl max-w-sm">
            <div className="p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-[#FFFF00]">
                  {content.tag || 'FEATURED COMPETITION'}
                </span>
                <h3 className="text-base font-black text-white font-display uppercase">
                  {content.title || 'Kerala eFootball Masters'}
                </h3>
              </div>
              <Badge variant="live" className="text-[9px] py-0 px-2">
                {content.badge || 'STAGE 1'}
              </Badge>
            </div>
            <div className="w-full bg-[#FFFF00] text-[#08088F] font-black px-4 py-2 text-xs uppercase tracking-wider flex items-center justify-between">
              <span>{content.cta_label || 'Special Player List & Rules'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      );

    case 'platform_statistics':
      const stats = Array.isArray(content.stats) ? content.stats : [];
      return (
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase text-[#FFFF00] tracking-wider mb-2">
            Platform Stats Live Preview
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map((s: any, idx: number) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-[#08088F] border border-white/10 text-center space-y-1 shadow-md"
              >
                <div className="text-xl sm:text-2xl font-black text-[#FFFF00] font-display">
                  {s.value || '0'}
                </div>
                <div className="text-[10px] font-black uppercase tracking-wider text-[#D9DCFF]">
                  {s.label || 'Metric'}
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return (
        <div className="p-6 rounded-2xl bg-[#08088F] border border-white/15 text-center space-y-2">
          <span className="text-xs font-mono text-[#FFFF00] uppercase font-bold">{sectionKey}</span>
          <p className="text-xs text-[#D9DCFF]">
            Live schema preview active. Changes entered in form or JSON editor will be reflected upon saving.
          </p>
        </div>
      );
  }
}
