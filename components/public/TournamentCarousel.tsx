'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Users, Calendar, ArrowUpRight, Flame, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatDate } from '@/lib/utils';
import { getTournaments, TournamentWithStats } from '@/services/tournamentService';

export interface TournamentItem {
  id: string;
  title: string;
  category: string;
  status: 'ongoing' | 'upcoming' | 'completed' | 'registration' | 'draft';
  participants: number;
  maxParticipants: number;
  prizePool: string;
  startDate: string;
}

const defaultTournaments: TournamentItem[] = [
  {
    id: 't-1',
    title: 'eFootball Champions Cup 2026',
    category: 'Global Knockout',
    status: 'ongoing',
    participants: 28,
    maxParticipants: 32,
    prizePool: '$5,000',
    startDate: 'Aug 10, 2026',
  },
  {
    id: 't-2',
    title: 'Super League - Season 4',
    category: 'Round Robin League',
    status: 'upcoming',
    participants: 48,
    maxParticipants: 64,
    prizePool: '$10,000',
    startDate: 'Aug 18, 2026',
  },
  {
    id: 't-3',
    title: 'Weekend Invitational Cup',
    category: 'Single Elimination',
    status: 'upcoming',
    participants: 16,
    maxParticipants: 16,
    prizePool: '$2,500',
    startDate: 'Aug 22, 2026',
  },
];

interface TournamentCarouselProps {
  title?: string;
  subtitle?: string;
  autoPlayInterval?: number;
}

export default function TournamentCarousel({
  title = 'Featured & Upcoming Tournaments',
  subtitle = 'Auto-updating competitive fixtures and live brackets.',
  autoPlayInterval = 4000,
}: TournamentCarouselProps) {
  const [items, setItems] = useState<TournamentItem[]>(defaultTournaments);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const minSwipeDistance = 50;

  useEffect(() => {
    async function fetchLiveTournaments() {
      try {
        const liveData = await getTournaments();
        if (liveData && liveData.length > 0) {
          const mapped: TournamentItem[] = liveData.map((t: TournamentWithStats) => ({
            id: t.id,
            title: t.name,
            category: t.format.replace('_', ' + ').toUpperCase(),
            status: t.status as TournamentItem['status'],
            participants: t.participant_count,
            maxParticipants: t.max_participants,
            prizePool: 'eSports Official',
            startDate: formatDate(t.start_date),
          }));
          setItems(mapped);
        }
      } catch (err) {
        console.error('Failed to fetch live public tournaments:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchLiveTournaments();
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % (items.length || 1));
  }, [items.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % (items.length || 1));
  }, [items.length]);

  useEffect(() => {
    if (isPaused || items.length <= 1) return;
    const timer = setInterval(() => {
      handleNext();
    }, autoPlayInterval);
    return () => clearInterval(timer);
  }, [isPaused, items.length, autoPlayInterval, handleNext]);

  const onTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) {
      setIsPaused(false);
      return;
    }
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      handleNext();
    } else if (isRightSwipe) {
      handlePrev();
    }

    setIsPaused(false);
  };

  return (
    <section className="w-full space-y-6 overflow-hidden py-2">
      {/* Section Header with Navigation Controls */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="efootball" className="gap-1 py-0.5 text-[11px]">
              <Flame className="h-3 w-3 text-primary" />
              Live Tournament Feed
            </Badge>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0B3323]">
            {title}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {subtitle}
          </p>
        </div>

        {/* Carousel Prev/Next Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrev}
            disabled={items.length <= 1}
            aria-label="Previous Tournament"
            className="rounded-xl border-border hover:bg-secondary hover:text-primary touch-target"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={handleNext}
            disabled={items.length <= 1}
            aria-label="Next Tournament"
            className="rounded-xl border-border hover:bg-secondary hover:text-primary touch-target"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Carousel Track Wrapper */}
      {loading ? (
        <div className="min-h-[220px] flex items-center justify-center rounded-2xl border border-border bg-white p-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
          <span className="text-xs font-semibold text-[#0B3323]">Fetching Live Tournament Data...</span>
        </div>
      ) : (
        <div
          ref={carouselRef}
          className="relative w-full overflow-hidden rounded-2xl touch-pan-y"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="flex transition-transform duration-500 ease-out gap-4 sm:gap-6"
            style={{
              transform: `translateX(-${currentIndex * 100}%)`,
            }}
          >
            {items.map((item) => (
              <div
                key={item.id}
                className="w-[85%] sm:w-[50%] lg:w-[32%] shrink-0 transition-transform duration-300"
              >
                <Card className="h-full flex flex-col justify-between hover:border-primary/50 hover:shadow-lg transition-all group border-border bg-white">
                  <CardHeader className="space-y-3 pb-3">
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={
                          item.status === 'ongoing'
                            ? 'default'
                            : item.status === 'registration' || item.status === 'upcoming'
                            ? 'secondary'
                            : 'outline'
                        }
                        className="capitalize text-[11px] font-bold"
                      >
                        {item.status}
                      </Badge>
                      <span className="text-xs font-extrabold text-primary bg-secondary px-2.5 py-1 rounded-lg border border-primary/10">
                        {item.prizePool}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {item.category}
                      </span>
                      <CardTitle className="text-base font-extrabold text-[#0B3323] group-hover:text-primary transition-colors line-clamp-1 mt-0.5">
                        {item.title}
                      </CardTitle>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-0">
                    <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 rounded-xl bg-[#F4F8F5] border border-border/50">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span>{item.participants}/{item.maxParticipants} Players</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground justify-end">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        <span>{item.startDate}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-border/40">
                      <span className="text-xs font-semibold text-[#0B3323]">eFootball Matchday</span>
                      <Button asChild variant="ghost" size="sm" className="h-8 text-xs text-primary group-hover:translate-x-0.5 transition-transform gap-1 font-bold">
                        <Link href="/tournaments">
                          <span>View Fixtures</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination Indicators */}
      <div className="flex justify-center items-center gap-1.5 pt-2">
        {items.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            aria-label={`Go to slide ${idx + 1}`}
            className={cn(
              'h-2 rounded-full transition-all duration-300',
              idx === currentIndex
                ? 'w-6 bg-primary shadow-xs'
                : 'w-2 bg-border hover:bg-muted-foreground'
            )}
          />
        ))}
      </div>
    </section>
  );
}
