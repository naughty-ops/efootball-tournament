'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Eye,
  Trophy,
  Loader2,
  ArrowRight,
  Flame,
  Wallet,
  Swords,
  ShieldCheck,
  Gamepad2,
  Sparkles,
  Zap,
  ChevronLeft,
  ChevronRight,
  Crown,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { OneVsOneCard } from '@/types/oneVsOne';
import OneVsOneEligibilityModal from './OneVsOneEligibilityModal';
import { joinOrCreateMatchAction } from '@/app/actions/oneVsOneActions';

interface OneVsOneCardGridProps {
  cards: OneVsOneCard[];
  isEligible: boolean;
  onMatchInitiated: (data: {
    matchId: string;
    matchCode?: string;
    status?: string;
    cardId: string;
  }) => void;
}

interface TierTheme {
  badge: string;
  badgeClass: string;
  glowClass: string;
  borderClass: string;
  icon: React.ElementType;
}

function getTierTheme(entry: number, idx: number): TierTheme {
  if (entry <= 10) {
    return {
      badge: 'STARTER',
      badgeClass: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40',
      glowClass: 'bg-cyan-500/15 group-hover:bg-cyan-500/30',
      borderClass: 'border-cyan-500/30 hover:border-cyan-400 shadow-cyan-500/10 hover:shadow-cyan-500/20',
      icon: Gamepad2,
    };
  }
  if (entry === 15) {
    return {
      badge: 'MOST POPULAR',
      badgeClass: 'bg-[#FF168B] text-white shadow-pink-500/40 font-black',
      glowClass: 'bg-[#FF168B]/25 group-hover:bg-[#FF168B]/40',
      borderClass: 'border-[#FF168B]/50 hover:border-[#FF168B] shadow-pink-500/20 hover:shadow-pink-500/30',
      icon: Flame,
    };
  }
  if (entry === 20) {
    return {
      badge: 'FAST FILL',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
      glowClass: 'bg-emerald-500/15 group-hover:bg-emerald-500/30',
      borderClass: 'border-emerald-500/30 hover:border-emerald-400 shadow-emerald-500/10 hover:shadow-emerald-500/20',
      icon: Zap,
    };
  }
  if (entry === 25) {
    return {
      badge: 'HIGH RETURN',
      badgeClass: 'bg-[#FFFF00] text-[#08088F] shadow-yellow-500/40 font-black',
      glowClass: 'bg-[#FFFF00]/20 group-hover:bg-[#FFFF00]/35',
      borderClass: 'border-[#FFFF00]/50 hover:border-[#FFFF00] shadow-yellow-500/20 hover:shadow-yellow-500/30',
      icon: Trophy,
    };
  }
  if (entry === 30) {
    return {
      badge: 'PRO DUEL',
      badgeClass: 'bg-indigo-500/25 text-indigo-200 border border-indigo-400/50',
      glowClass: 'bg-indigo-500/20 group-hover:bg-indigo-500/35',
      borderClass: 'border-indigo-500/40 hover:border-indigo-400 shadow-indigo-500/15 hover:shadow-indigo-500/25',
      icon: Swords,
    };
  }
  if (entry === 40) {
    return {
      badge: 'HIGH STAKES',
      badgeClass: 'bg-orange-500/25 text-orange-200 border border-orange-400/50',
      glowClass: 'bg-orange-500/20 group-hover:bg-orange-500/35',
      borderClass: 'border-orange-500/40 hover:border-orange-400 shadow-orange-500/15 hover:shadow-orange-500/25',
      icon: Flame,
    };
  }
  if (entry === 50) {
    return {
      badge: 'LEGENDARY',
      badgeClass: 'bg-amber-500/30 text-amber-300 border border-amber-400/60 font-black',
      glowClass: 'bg-amber-500/25 group-hover:bg-amber-500/40',
      borderClass: 'border-amber-400/50 hover:border-amber-300 shadow-amber-500/20 hover:shadow-amber-500/30',
      icon: Sparkles,
    };
  }
  if (entry === 60) {
    return {
      badge: 'ELITE WARRIOR',
      badgeClass: 'bg-teal-500/25 text-teal-200 border border-teal-400/50',
      glowClass: 'bg-teal-500/20 group-hover:bg-teal-500/35',
      borderClass: 'border-teal-500/40 hover:border-teal-400 shadow-teal-500/15 hover:shadow-teal-500/25',
      icon: ShieldCheck,
    };
  }
  if (entry === 75) {
    return {
      badge: 'GRANDMASTER',
      badgeClass: 'bg-purple-500/30 text-purple-200 border border-purple-400/60 font-black',
      glowClass: 'bg-purple-500/25 group-hover:bg-purple-500/40',
      borderClass: 'border-purple-400/50 hover:border-purple-300 shadow-purple-500/20 hover:shadow-purple-500/30',
      icon: Crown,
    };
  }
  // 100+
  return {
    badge: 'ULTIMATE TITAN',
    badgeClass: 'bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 text-[#08088F] font-black shadow-lg shadow-yellow-500/40 border border-yellow-200',
    glowClass: 'bg-gradient-to-br from-yellow-400/30 via-pink-500/25 to-purple-600/30 group-hover:opacity-100',
    borderClass: 'border-yellow-400/70 hover:border-yellow-300 ring-1 ring-yellow-400/30 shadow-yellow-500/25 hover:shadow-yellow-500/40',
    icon: Sparkles,
  };
}

export default function OneVsOneCardGrid({
  cards,
  isEligible: initialEligible,
  onMatchInitiated,
}: OneVsOneCardGridProps) {
  const [isEligible, setIsEligible] = useState(initialEligible);
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Horizontal scroll container ref & controls
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, cards]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollAmount = Math.max(el.clientWidth * 0.75, 320);
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const handleCardClick = async (cardId: string) => {
    if (!isEligible) {
      setPendingCardId(cardId);
      setShowEligibilityModal(true);
      return;
    }

    await executeJoin(cardId);
  };

  const executeJoin = async (cardId: string) => {
    setLoadingCardId(cardId);
    setErrorMsg(null);

    const res = await joinOrCreateMatchAction(cardId);
    setLoadingCardId(null);

    if (!res.success || !res.data) {
      setErrorMsg(res.error || 'Failed to enter match queue. Please try again.');
      return;
    }

    onMatchInitiated({
      matchId: res.data.matchId,
      matchCode: res.data.matchCode,
      status: res.data.status,
      cardId,
    });
  };

  const handleEligibilityConfirmed = () => {
    setIsEligible(true);
    setShowEligibilityModal(false);
    if (pendingCardId) {
      const cardToJoin = pendingCardId;
      setPendingCardId(null);
      executeJoin(cardToJoin);
    }
  };

  const minEntry = cards.length > 0 ? Math.min(...cards.map((c) => c.entry_amount)) : 10;
  const maxEntry = cards.length > 0 ? Math.max(...cards.map((c) => c.entry_amount)) : 100;

  return (
    <div className="space-y-6">
      {/* Header with Title and Scroll Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/15 pb-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-black font-display uppercase tracking-wider text-white flex items-center gap-2">
              <Flame className="h-5 w-5 text-[#FF168B]" />
              <span>Select Challenge Tier</span>
            </h2>
            <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#FFFF00]/15 text-[#FFFF00] border border-[#FFFF00]/30 shadow-sm">
              {cards.length} Tiers • ₹{minEntry.toFixed(0)} to ₹{maxEntry.toFixed(0)}
            </span>
          </div>
          <p className="text-xs text-white/70 mt-1">
            Choose an entry card to enter the arena. Opponent matchmaking occurs automatically. Swipe or use arrows to view all tiers up to ₹{maxEntry.toFixed(0)}.
          </p>
        </div>

        {/* Action Indicators & Scroll Navigation Buttons */}
        <div className="flex items-center gap-2 flex-wrap justify-between sm:justify-end">
          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#FFFF00] bg-[#FFFF00]/10 border border-[#FFFF00]/30 px-3 py-1.5 rounded-full shadow-sm">
              <Swords className="h-3.5 w-3.5 text-[#00E676]" />
              <span>Instant Matchmaking</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#00E676] bg-[#00E676]/15 border border-[#00E676]/30 px-3 py-1.5 rounded-full shadow-sm">
              <Wallet className="h-3.5 w-3.5" />
              <span>Wallet Integrated</span>
            </div>
          </div>

          {/* Desktop & Mobile Scroll Buttons */}
          <div className="flex items-center gap-1.5 ml-auto sm:ml-0 bg-white/5 border border-white/10 rounded-full p-1 shadow-inner">
            <button
              onClick={() => handleScroll('left')}
              disabled={!canScrollLeft}
              aria-label="Scroll challenge tiers left"
              className={`p-2 rounded-full transition-all duration-200 flex items-center justify-center ${
                canScrollLeft
                  ? 'bg-white/15 hover:bg-white/25 text-white active:scale-95 cursor-pointer shadow-sm'
                  : 'text-white/25 cursor-not-allowed'
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[10px] font-bold text-white/50 px-1 font-mono uppercase tracking-wider select-none">
              Tiers
            </span>
            <button
              onClick={() => handleScroll('right')}
              disabled={!canScrollRight}
              aria-label="Scroll challenge tiers right"
              className={`p-2 rounded-full transition-all duration-200 flex items-center justify-center ${
                canScrollRight
                  ? 'bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] active:scale-95 cursor-pointer shadow-md shadow-yellow-500/20'
                  : 'text-white/25 cursor-not-allowed'
              }`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/30 text-xs text-red-400 font-bold animate-in fade-in flex items-center justify-between gap-3 shadow-lg">
          <span>{errorMsg}</span>
          {errorMsg.toLowerCase().includes('insufficient') && (
            <Link
              href="/dashboard/wallet"
              className="px-4 py-1.5 rounded-full bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs shrink-0 transition-colors uppercase tracking-wider shadow-md shadow-yellow-500/20"
            >
              Add Money
            </Link>
          )}
        </div>
      )}

      {/* Horizontally Scrollable Cards Container with Snap */}
      <div className="relative group/scroll-area">
        {/* Left Fade Indicator Mask (Desktop hint) */}
        {canScrollLeft && (
          <div className="hidden sm:block absolute left-0 top-0 bottom-4 w-12 bg-gradient-to-r from-[#050530] to-transparent z-20 pointer-events-none rounded-l-[28px]" />
        )}

        {/* Right Fade Indicator Mask (Desktop hint) */}
        {canScrollRight && (
          <div className="hidden sm:block absolute right-0 top-0 bottom-4 w-12 bg-gradient-to-l from-[#050530] to-transparent z-20 pointer-events-none rounded-r-[28px]" />
        )}

        {/* The Scrollable Row */}
        <div
          ref={scrollContainerRef}
          className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 pt-1 px-1 snap-x snap-mandatory scroll-smooth no-scrollbar items-stretch"
          tabIndex={0}
          role="region"
          aria-label="Challenge Tiers carousel"
        >
          {cards.map((card, idx) => {
            const isLoading = loadingCardId === card.id;
            const activeCount = card.active_matches_count ?? 0;
            const profitMultiplier =
              card.entry_amount > 0
                ? Math.round(((card.advertised_payout - card.entry_amount) / card.entry_amount) * 100)
                : 0;

            const theme = getTierTheme(card.entry_amount, idx);
            const TierIcon = theme.icon;

            return (
              <Card
                key={card.id}
                className={`w-[290px] sm:w-[325px] md:w-[340px] shrink-0 snap-start relative overflow-hidden rounded-[28px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border transition-all duration-300 shadow-xl group flex flex-col justify-between p-6 sm:p-7 text-white hover:-translate-y-1.5 ${theme.borderClass}`}
              >
                {/* Ambient glow accent */}
                <div
                  className={`absolute top-0 right-0 w-36 h-36 rounded-full blur-2xl pointer-events-none transition-all duration-500 ${theme.glowClass}`}
                />

                <div className="space-y-5 relative z-10">
                  {/* Header Tag with Name and Live Match Counter */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white/10 text-white/95 border border-white/20 shadow-sm font-display">
                        {card.name}
                      </span>
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${theme.badgeClass}`}>
                        {theme.badge}
                      </span>
                    </div>

                    {/* Active Match Eye Counter */}
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/15 text-white/90 shadow-sm shrink-0"
                      title={`${activeCount} Live Duels`}
                    >
                      <Eye className="h-3.5 w-3.5 text-[#00E676]" />
                      <span className="text-xs font-black font-mono text-[#FFFF00]">
                        {activeCount}
                      </span>
                    </div>
                  </div>

                  {/* Entry & Payout Breakdown */}
                  <div className="space-y-2.5 pt-2">
                    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10 group-hover:border-white/20 transition-colors">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider block">
                          Entry Fee
                        </span>
                        <span className="text-xl font-black font-display text-[#FFFF00]">
                          ₹{card.entry_amount.toFixed(0)}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-white/10 text-white/70 flex items-center gap-1">
                        <TierIcon className="h-3 w-3" />
                        <span>Best of 1</span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#00E676]/15 border border-[#00E676]/35 shadow-sm shadow-[#00E676]/15">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-[10px] font-black text-[#00E676] uppercase tracking-wider">
                          <Trophy className="h-3.5 w-3.5" />
                          <span>Winner Payout</span>
                        </div>
                        <span className="text-2xl font-black font-display text-[#00E676]">
                          ₹{card.advertised_payout.toFixed(0)}
                        </span>
                      </div>
                      {profitMultiplier > 0 && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/40">
                          +{profitMultiplier}% Profit
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-white/65 leading-relaxed">
                    Head-to-head friendly duel. Host creates room code in eFootball. Score verification unlocks instant wallet reward.
                  </p>
                </div>

                {/* Action Button */}
                <div className="pt-6 relative z-10">
                  <Button
                    onClick={() => handleCardClick(card.id)}
                    disabled={isLoading}
                    className="w-full rounded-full text-xs font-black uppercase tracking-wider h-11 bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] shadow-lg shadow-yellow-500/25 active:scale-95 transition-all duration-200 gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" />
                        <span>Entering Arena...</span>
                      </>
                    ) : (
                      <>
                        <Swords className="h-4 w-4" />
                        <span>Enter Matchmaking</span>
                        <ArrowRight className="h-4 w-4 ml-auto" />
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Bottom Swipe Guidance Hint for Mobile */}
        <div className="flex items-center justify-center gap-2 pt-2 text-[11px] text-white/50 sm:hidden">
          <ChevronLeft className="h-3.5 w-3.5 animate-pulse" />
          <span>Swipe horizontally to explore all tiers up to ₹{maxEntry.toFixed(0)}</span>
          <ChevronRight className="h-3.5 w-3.5 animate-pulse" />
        </div>
      </div>

      {/* 3-Step Arena Guide Banner */}
      <div className="rounded-[28px] bg-gradient-to-r from-[#07074A] via-[#05053B] to-[#07074A] border border-white/15 p-6 sm:p-7 text-white shadow-xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#FFFF00]" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white font-display">
              How 1 VS 1 Challenge Arena Works
            </h3>
          </div>
          <span className="text-[11px] font-bold text-[#00E676] flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>100% Anti-Cheat Protected</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
            <div className="flex items-center gap-2 text-[#FFFF00] font-black uppercase tracking-wider">
              <span className="h-5 w-5 rounded-full bg-[#FFFF00] text-[#08088F] flex items-center justify-center text-[10px]">
                1
              </span>
              <span>Select Stake & Queue</span>
            </div>
            <p className="text-white/70 leading-relaxed">
              Pick your entry tier (₹10 up to ₹100). Entry fee is safely escrowed in platform wallet while you are paired with an opponent.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
            <div className="flex items-center gap-2 text-[#FF168B] font-black uppercase tracking-wider">
              <span className="h-5 w-5 rounded-full bg-[#FF168B] text-white flex items-center justify-center text-[10px]">
                2
              </span>
              <span>Join In-Game Room</span>
            </div>
            <p className="text-white/70 leading-relaxed">
              Player 1 shares the 8-digit eFootball Room ID & Password. Both players ready up and kick off in the eFootball app.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
            <div className="flex items-center gap-2 text-[#00E676] font-black uppercase tracking-wider">
              <span className="h-5 w-5 rounded-full bg-[#00E676] text-[#08088F] flex items-center justify-center text-[10px]">
                3
              </span>
              <span>Instant Winner Settlement</span>
            </div>
            <p className="text-white/70 leading-relaxed">
              Submit final scores. Verified results trigger immediate automated wallet prize credits with full ledger verification.
            </p>
          </div>
        </div>
      </div>

      <OneVsOneEligibilityModal
        isOpen={showEligibilityModal}
        onClose={() => {
          setShowEligibilityModal(false);
          setPendingCardId(null);
        }}
        onConfirmed={handleEligibilityConfirmed}
      />
    </div>
  );
}
