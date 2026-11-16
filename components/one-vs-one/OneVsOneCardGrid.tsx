'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

export default function OneVsOneCardGrid({
  cards,
  isEligible: initialEligible,
  onMatchInitiated,
}: OneVsOneCardGridProps) {
  const router = useRouter();
  const [isEligible, setIsEligible] = useState(initialEligible);
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Periodic background refresh for live active match counts on cards
  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, 12000);
    return () => clearInterval(timer);
  }, [router]);

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

  const totalActiveMatches = cards.reduce((sum, c) => sum + (c.active_matches_count || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/15 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black font-display uppercase tracking-wider text-white flex items-center gap-2">
            <Flame className="h-5 w-5 text-[#FF168B]" />
            <span>Select Challenge Tier</span>
          </h2>
          <p className="text-xs text-white/70 mt-0.5">
            Choose an entry card to enter the arena. Opponent matchmaking occurs automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#FFFF00] bg-[#FFFF00]/10 border border-[#FFFF00]/30 px-3.5 py-1.5 rounded-full w-fit shadow-sm shadow-yellow-500/10">
            <Swords className="h-3.5 w-3.5 text-[#00E676]" />
            <span>Instant Matchmaking</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#00E676] bg-[#00E676]/15 border border-[#00E676]/30 px-3.5 py-1.5 rounded-full w-fit shadow-sm shadow-[#00E676]/10">
            <Wallet className="h-3.5 w-3.5" />
            <span>Wallet Integrated</span>
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

      {/* Grid of Dynamic Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {cards.map((card, idx) => {
          const isLoading = loadingCardId === card.id;
          const activeCount = card.active_matches_count ?? 0;
          const profitMultiplier = card.entry_amount > 0 
            ? Math.round(((card.advertised_payout - card.entry_amount) / card.entry_amount) * 100) 
            : 0;

          // Theme accent customization per tier
          const isHot = card.entry_amount === 15 || idx === 1;
          const isHighStakes = card.entry_amount >= 25 || idx === 2;

          return (
            <Card
              key={card.id}
              className={`relative overflow-hidden rounded-[28px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border transition-all duration-300 shadow-xl group flex flex-col justify-between p-6 sm:p-7 text-white hover:-translate-y-1.5 ${
                isHot
                  ? 'border-[#FF168B]/40 hover:border-[#FF168B] shadow-pink-500/10 hover:shadow-pink-500/25'
                  : isHighStakes
                  ? 'border-[#FFFF00]/40 hover:border-[#FFFF00] shadow-yellow-500/10 hover:shadow-yellow-500/25'
                  : 'border-white/15 hover:border-[#3434FF] shadow-black/25'
              }`}
            >
              {/* Top ambient glow */}
              <div
                className={`absolute top-0 right-0 w-36 h-36 rounded-full blur-2xl pointer-events-none transition-all duration-500 ${
                  isHot
                    ? 'bg-[#FF168B]/15 group-hover:bg-[#FF168B]/30'
                    : isHighStakes
                    ? 'bg-[#FFFF00]/15 group-hover:bg-[#FFFF00]/30'
                    : 'bg-[#3434FF]/20 group-hover:bg-[#3434FF]/35'
                }`}
              />

              <div className="space-y-5 relative z-10">
                {/* Header Tag with Name and Eye Icon Number */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-sm ${
                        isHot
                          ? 'bg-[#FF168B] text-white shadow-pink-500/30'
                          : isHighStakes
                          ? 'bg-[#FFFF00] text-[#08088F] shadow-yellow-500/30 font-display'
                          : 'bg-white/10 text-white/90 border border-white/20'
                      }`}
                    >
                      {card.name}
                    </span>
                    {isHot && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-[#FF168B] bg-[#FF168B]/15 border border-[#FF168B]/30 px-2 py-0.5 rounded-full">
                        HOT
                      </span>
                    )}
                    {isHighStakes && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-[#FFFF00] bg-[#FFFF00]/15 border border-[#FFFF00]/30 px-2 py-0.5 rounded-full">
                        HIGH RETURN
                      </span>
                    )}
                  </div>

                  {/* Eye Counter */}
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/15 text-white/90 shadow-sm"
                    title={`${activeCount} Live Duels`}
                  >
                    <Eye className="h-3.5 w-3.5 text-[#00E676]" />
                    <span className="text-xs font-black font-mono text-[#FFFF00]">{activeCount}</span>
                  </div>
                </div>

                {/* Entry & Payout Breakdown */}
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10 group-hover:border-white/20 transition-colors">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider block">Entry Fee</span>
                      <span className="text-xl font-black font-display text-[#FFFF00]">
                        ₹{card.entry_amount.toFixed(0)}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-white/10 text-white/70">
                      Single Match
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
                  Best of 1 friendly duel. Host creates private eFootball room. Verified score triggers instant payout.
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

      {/* 3-Step Arena Guide Banner */}
      <div className="rounded-[28px] bg-gradient-to-r from-[#07074A] via-[#05053B] to-[#07074A] border border-white/15 p-6 sm:p-7 text-white shadow-xl space-y-4">
        <div className="flex items-center justify-between">
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
              <span className="h-5 w-5 rounded-full bg-[#FFFF00] text-[#08088F] flex items-center justify-center text-[10px]">1</span>
              <span>Select Stake & Queue</span>
            </div>
            <p className="text-white/70 leading-relaxed">
              Pick your entry tier. Entry fee is safely escrowed in platform wallet while you are paired with an opponent.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
            <div className="flex items-center gap-2 text-[#FF168B] font-black uppercase tracking-wider">
              <span className="h-5 w-5 rounded-full bg-[#FF168B] text-white flex items-center justify-center text-[10px]">2</span>
              <span>Join In-Game Room</span>
            </div>
            <p className="text-white/70 leading-relaxed">
              Player 1 shares the 8-digit eFootball Room ID & Password. Both players ready up and kick off in the eFootball app.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
            <div className="flex items-center gap-2 text-[#00E676] font-black uppercase tracking-wider">
              <span className="h-5 w-5 rounded-full bg-[#00E676] text-[#08088F] flex items-center justify-center text-[10px]">3</span>
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
