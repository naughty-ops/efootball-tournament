'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Trophy, Shield, Gamepad2, Radio, Heart } from 'lucide-react';

export default function PublicFooter() {
  return (
    <footer className="w-full bg-[#050566] border-t border-white/15 text-white mt-16 sm:mt-24 relative overflow-hidden">
      {/* Decorative Top Yellow Bar */}
      <div className="w-full h-1 bg-[#FFFF00]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12 pb-12 border-b border-white/10">
          {/* Brand Info */}
          <div className="md:col-span-1 space-y-4">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="relative h-9 w-9 rounded-full flex items-center justify-center shadow-md overflow-hidden shrink-0">
                <Image
                  src="/logos/logo-mark-transparent.png"
                  alt="eFootball Logo"
                  width={36}
                  height={36}
                  className="h-full w-full object-contain"
                />
              </div>
              <span className="font-display font-black text-2xl tracking-tight uppercase text-white">
                FOOTBALL
              </span>
            </Link>
            <p className="text-xs sm:text-sm text-[#D9DCFF] leading-relaxed">
              Official eFootball esports tournament platform. Compete in group stages, league brackets, and live streamed championship knockout finals.
            </p>
            <div className="flex items-center gap-2 text-xs text-[#FFFF00] font-black">
              <span className="h-2 w-2 rounded-full bg-[#FFFF00] animate-ping" />
              <span>SEASON 2026 LIVE COMPETITIONS</span>
            </div>
          </div>

          {/* Quick Navigation */}
          <div className="space-y-3">
            <h4 className="text-sm font-black uppercase tracking-wider text-[#FFFF00] font-display">
              Tournaments
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm text-[#D9DCFF]">
              <li>
                <Link href="/tournaments?status=ongoing" className="hover:text-white transition-colors">
                  Active Tournaments
                </Link>
              </li>
              <li>
                <Link href="/tournaments?status=registration" className="hover:text-white transition-colors">
                  Open Registrations
                </Link>
              </li>
              <li>
                <Link href="/tournaments?status=completed" className="hover:text-white transition-colors">
                  Past Champions & Hall of Fame
                </Link>
              </li>
              <li>
                <Link href="/tournaments" className="hover:text-white transition-colors">
                  All Tournament Brackets
                </Link>
              </li>
            </ul>
          </div>

          {/* Live & Media */}
          <div className="space-y-3">
            <h4 className="text-sm font-black uppercase tracking-wider text-[#FFFF00] font-display">
              Live & Matches
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm text-[#D9DCFF]">
              <li>
                <Link href="/live" className="hover:text-white transition-colors flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FF168B]" />
                  <span>Live Match Streaming</span>
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-white transition-colors">
                  Player Dashboard
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-white transition-colors">
                  Tournament Rules & Scoring
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white transition-colors">
                  Support & WhatsApp Help
                </Link>
              </li>
            </ul>
          </div>

          {/* Fair Play & Verification */}
          <div className="space-y-3">
            <h4 className="text-sm font-black uppercase tracking-wider text-[#FFFF00] font-display">
              Fair Play & Security
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm text-[#D9DCFF]">
              <li className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#FFFF00] shrink-0" />
                <span>Verified eFootball User IDs</span>
              </li>
              <li className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-[#FFFF00] shrink-0" />
                <span>Official Bracket Transitioning</span>
              </li>
              <li className="flex items-center gap-2">
                <Gamepad2 className="h-4 w-4 text-[#FFFF00] shrink-0" />
                <span>Mobile & Console Compatible</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Legal Disclaimer & Copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#D9DCFF]/70 text-center sm:text-left">
          <p>
            © {new Date().getFullYear()} eFootball Tournament Platform. All rights reserved.
          </p>
          <p className="text-[11px] max-w-xl text-[#D9DCFF]/50 leading-relaxed">
            eFootball™ is a registered trademark of Konami Digital Entertainment Inc. This is an independent esports community competition management platform.
          </p>
        </div>
      </div>
    </footer>
  );
}
