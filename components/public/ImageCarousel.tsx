'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Flame, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getHomeBanners } from '@/services/bannerService';

export interface CarouselSlide {
  id: string;
  image: string;
  title: string;
  subtitle: string;
  badgeText: string;
  actionText: string;
  actionHref: string;
}

export default function ImageCarousel({ slides: propSlides }: { slides?: CarouselSlide[] }) {
  const [slides, setSlides] = useState<CarouselSlide[]>(() => {
    if (propSlides && propSlides.length > 0) return propSlides;
    return getHomeBanners();
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const reloadBanners = useCallback(() => {
    if (propSlides && propSlides.length > 0) {
      setSlides(propSlides);
    } else {
      setSlides(getHomeBanners());
    }
  }, [propSlides]);

  useEffect(() => {
    const handleUpdate = () => reloadBanners();
    window.addEventListener('efootball_banners_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('efootball_banners_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [reloadBanners]);

  const minSwipeDistance = 40;

  const nextSlide = useCallback(() => {
    if (slides.length === 0) return;
    setCurrentIndex((prevIndex) => (prevIndex + 1) % slides.length);
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    if (slides.length === 0) return;
    setCurrentIndex((prevIndex) => (prevIndex - 1 + slides.length) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (isPaused || slides.length === 0) return;
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide, slides.length]);

  if (slides.length === 0) return null;

  const activeIndex = Math.min(currentIndex, slides.length - 1);

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
    if (distance > minSwipeDistance) {
      nextSlide();
    } else if (distance < -minSwipeDistance) {
      prevSlide();
    }
    setIsPaused(false);
  };

  return (
    <section
      className="relative w-full overflow-hidden rounded-2xl sm:rounded-3xl bg-slate-950 shadow-xl border border-primary/20"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Slides Container */}
      <div className="relative h-[280px] min-h-[280px] sm:h-[360px] md:h-[420px] w-full">
        {slides.map((slide, idx) => {
          const isActive = idx === activeIndex;
          return (
            <div
              key={slide.id || idx}
              className={cn(
                'absolute inset-0 transition-opacity duration-700 ease-in-out',
                isActive ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
              )}
            >
              {/* Image */}
              <Image
                src={slide.image || '/images/banner1.jpg'}
                alt={slide.title}
                fill
                priority={idx === 0}
                className="object-cover object-center transform scale-105 transition-transform duration-10000"
                unoptimized={slide.image?.startsWith('http')}
              />

              {/* Gradient Overlays for High Contrast */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B3323] via-[#0B3323]/60 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0B3323]/90 via-[#0B3323]/40 to-transparent" />

              {/* Slide Overlay Content */}
              <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 md:p-12 max-w-2xl space-y-2.5 sm:space-y-4">
                {slide.badgeText && (
                  <Badge variant="efootball" className="bg-[#00C853] text-white border-none shadow-md shadow-[#00C853]/30 text-[11px] py-0.5">
                    <Flame className="h-3 w-3 mr-1" />
                    {slide.badgeText}
                  </Badge>
                )}

                <h2 className="text-xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-white leading-snug drop-shadow-sm">
                  {slide.title}
                </h2>

                {slide.subtitle && (
                  <p className="text-xs sm:text-sm md:text-base text-emerald-100/90 font-normal line-clamp-2 leading-relaxed max-w-xl">
                    {slide.subtitle}
                  </p>
                )}

                {slide.actionText && (
                  <div className="pt-1.5">
                    <Button asChild size="sm" className="bg-[#00E676] text-[#0B3323] hover:bg-white font-bold gap-2 shadow-lg shadow-emerald-500/20 text-xs sm:text-sm h-9 px-4">
                      <a href={slide.actionHref || '/tournaments'}>
                        <span>{slide.actionText}</span>
                        <Play className="h-3.5 w-3.5 fill-current" />
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation Arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={prevSlide}
            aria-label="Previous Slide"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-black/40 text-white backdrop-blur-md flex items-center justify-center hover:bg-[#00C853] hover:text-white transition-all border border-white/20 touch-target"
          >
            <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>

          <button
            onClick={nextSlide}
            aria-label="Next Slide"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-black/40 text-white backdrop-blur-md flex items-center justify-center hover:bg-[#00C853] hover:text-white transition-all border border-white/20 touch-target"
          >
            <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>

          {/* Indicator Dots */}
          <div className="absolute bottom-3 right-4 sm:bottom-6 sm:right-8 z-20 flex items-center gap-1.5">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  idx === activeIndex
                    ? 'w-6 bg-[#00E676] shadow-sm shadow-[#00E676]'
                    : 'w-2 bg-white/40 hover:bg-white/70'
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
