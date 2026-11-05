import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Trophy,
  ChevronRight,
  Play,
  Calendar,
  Users,
  Bell,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getPublicTournaments,
  getPublicLiveMatches,
} from '@/services/publicTournamentService';
import { getPublicHomepageSections } from '@/services/homepageCmsService';
import type { HomepageSection } from '@/types/database';
import type { TournamentWithStats } from '@/services/tournamentService';
import { formatDate, cn } from '@/lib/utils';
import LiveMatchesTicker from '@/components/public/LiveMatchesTicker';

// Revalidate public homepage static cache every 60 seconds (ISR)
export const revalidate = 60;

function TournamentMiniCard({ t }: { t: TournamentWithStats }) {
  const isLive = t.status === 'ongoing';
  const isCompleted = t.status === 'completed';

  return (
    <Link
      href={`/tournaments/${t.id}`}
      className="group relative flex items-center justify-between gap-4 rounded-3xl border border-white/15 bg-[#1F1FF0] p-4 sm:p-5 hover:border-[#FFFF00] hover:bg-[#2828FF] transition-all shadow-lg active:scale-[0.99] min-h-[105px]"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#08088F] text-[#FFFF00] border border-white/10 shadow-inner">
          <Trophy className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-[#D9DCFF]">
              {t.format.replace('_', ' ')}
            </span>
            {isLive && (
              <Badge variant="live" className="text-[10px] py-0 px-2">
                LIVE
              </Badge>
            )}
            {isCompleted && (
              <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] py-0 px-2 font-black">
                COMPLETED
              </Badge>
            )}
          </div>
          <h4 className="text-base sm:text-lg font-black text-white truncate group-hover:text-[#FFFF00] transition-colors font-display">
            {t.name}
          </h4>
          <p className="text-xs text-[#D9DCFF] font-semibold flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-[#FFFF00]" />
              {t.participant_count}/{t.max_participants} Players
            </span>
            {t.start_date && (
              <span>• {formatDate(t.start_date)}</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="h-9 w-9 rounded-full bg-[#FFFF00] text-[#08088F] flex items-center justify-center group-hover:scale-110 transition-transform shadow-md">
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}

function getVisibilityClass(sec?: HomepageSection) {
  if (!sec) return '';
  if (!sec.is_visible_desktop && !sec.is_visible_mobile) return 'hidden';
  if (!sec.is_visible_desktop) return 'lg:hidden';
  if (!sec.is_visible_mobile) return 'hidden lg:block';
  return '';
}

export default async function HomePage() {
  // Pre-fetch initial data on server to enable instant FCP (< 100ms) with zero client fetching waterfall
  const [liveMatches, allTournaments, sections] = await Promise.all([
    getPublicLiveMatches().catch(() => []),
    getPublicTournaments().catch(() => []),
    getPublicHomepageSections().catch(() => [] as HomepageSection[]),
  ]);

  const activeT = allTournaments.filter((t) => t.status === 'ongoing');
  const upcomingT = allTournaments.filter((t) => t.status === 'registration');
  const completedT = allTournaments.filter((t) => t.status === 'completed').slice(0, 6);

  const cmsSections: Record<string, HomepageSection> = {};
  sections.forEach((s) => {
    cmsSections[s.section_key] = s;
  });

  const isCmsLoaded = sections.length > 0;

  // CMS Section configurations & Fallbacks
  const announcementsSec = cmsSections['announcements'];
  const isAnnouncementsVisible = !isCmsLoaded || Boolean(announcementsSec);
  const announcementData = announcementsSec?.published_content || {};

  const heroSec = cmsSections['hero_banner'];
  const isHeroVisible = !isCmsLoaded || Boolean(heroSec);
  const heroData = heroSec?.published_content || {};

  const featuredTournSec = cmsSections['featured_tournament'];
  const isFeaturedTournVisible = !isCmsLoaded || Boolean(featuredTournSec);
  const featTournData = featuredTournSec?.published_content || {};

  const liveSec = cmsSections['live_matches'];
  const isLiveVisible = !isCmsLoaded || Boolean(liveSec);

  const upcomingSec = cmsSections['upcoming_tournaments'];
  const isTournamentsVisible = !isCmsLoaded || Boolean(upcomingSec);
  const tournData = upcomingSec?.published_content || {};
  const maxActiveDisplay = (tournData.max_active as number) || 5;
  const maxUpcomingDisplay = (tournData.max_upcoming as number) || 4;

  return (
    <div className="space-y-10 sm:space-y-14 pb-16 w-full">
      {/* =========================================================================
          1. TOP ANNOUNCEMENT BANNER STRIP
          ========================================================================= */}
      {isAnnouncementsVisible && (
        <div
          className={cn(
            'w-full rounded-full bg-[#FFFF00] text-[#08088F] px-4 sm:px-6 py-2.5 sm:py-3 shadow-xl flex items-center justify-between gap-3 font-bold text-xs sm:text-sm',
            getVisibilityClass(announcementsSec)
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-[#08088F] text-[#FFFF00] flex items-center justify-center shrink-0 shadow-md">
              <Bell className="h-4 w-4" />
            </div>
            <span className="hidden md:inline bg-[#08088F] text-[#FFFF00] px-3 py-1 rounded-full text-xs font-black uppercase shrink-0">
              {announcementData.badge_text || 'SEASON 2026'}
            </span>
            <p className="truncate font-black text-xs sm:text-sm tracking-tight">
              {announcementData.headline ||
                'Kerala eFootball Championship Open: Register your eFootball ID today to compete for the trophy!'}
            </p>
          </div>
          <Link
            href={announcementData.cta_url || '/tournaments?status=registration'}
            className="bg-white hover:bg-slate-100 text-[#08088F] px-4 sm:px-5 py-1.5 rounded-full text-xs font-black shrink-0 transition-transform active:scale-95 shadow-sm uppercase tracking-wider"
          >
            {announcementData.cta_label || 'Register Now'}
          </Link>
        </div>
      )}

      {/* =========================================================================
          2. HERO SECTION — "THE PITCH IS OURS"
          ========================================================================= */}
      {isHeroVisible && (
        <section
          className={cn(
            'relative rounded-[32px] sm:rounded-[40px] bg-gradient-to-br from-[#1E1EF5] via-[#2A2AFF] to-[#1212B8] p-6 sm:p-10 lg:p-12 border border-white/20 shadow-2xl overflow-hidden',
            getVisibilityClass(heroSec)
          )}
        >
          {/* Glow Accents */}
          <div className="absolute top-0 right-0 w-64 sm:w-96 h-64 sm:h-96 max-w-full bg-[#FFFF00]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-60 sm:w-80 h-60 sm:h-80 max-w-full bg-[#FF168B]/10 rounded-full blur-3xl pointer-events-none" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center relative z-10">
            {/* Left Column: Bold Headline, Copy, Action Buttons & Featured Card */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-black uppercase text-[#FFFF00] tracking-wider">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{heroData.tagline || 'OFFICIAL COMPETITIVE ARENA'}</span>
              </div>

              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white uppercase tracking-tight leading-[0.95] font-display headline-stencil">
                {heroData.title_main || 'THE PITCH'} <br />
                <span className="text-[#FFFF00]">{heroData.title_highlight || 'IS OURS'}</span>
              </h1>

              <p className="text-sm sm:text-base text-[#D9DCFF] max-w-xl leading-relaxed font-medium">
                {heroData.subtitle ||
                  'Konami eFootball official tournament platform. Elevating on-field esports realism to all-new levels as players compete in automated group stages, real-time live streaming, and high-stakes knockout brackets.'}
              </p>

              {/* Pill Action Buttons matching reference */}
              <div className="flex flex-wrap items-center gap-3.5 pt-2">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black text-sm tracking-wider uppercase px-7 py-3.5 shadow-xl hover:scale-105 active:scale-95 transition-all"
                >
                  <Link href={heroData.primary_button_url || '/tournaments'}>
                    {heroData.primary_button_label || 'Join Tournaments'}
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="rounded-full border-2 border-white/60 hover:border-white text-white font-black text-sm tracking-wider uppercase px-7 py-3.5 hover:bg-white/10 transition-all"
                >
                  <Link href={heroData.secondary_button_url || '/live'} className="flex items-center gap-2">
                    <Play className="h-4 w-4 fill-white" />
                    <span>{heroData.secondary_button_label || 'Watch Arena'}</span>
                  </Link>
                </Button>
              </div>

              {/* Embedded Special Spotlight Card */}
              {isFeaturedTournVisible && (
                <div className={cn('pt-4', getVisibilityClass(featuredTournSec))}>
                  <div className="rounded-3xl bg-[#1010A8] border border-white/15 overflow-hidden shadow-xl max-w-md group hover:border-[#FFFF00]/60 transition-all">
                    <div className="p-4 sm:p-5 flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#FFFF00]">
                          {featTournData.tag || 'FEATURED COMPETITION'}
                        </span>
                        <h3 className="text-lg font-black text-white font-display uppercase tracking-tight">
                          {featTournData.title || 'Kerala eFootball Masters'}
                        </h3>
                      </div>
                      <Badge variant="live" className="text-[10px] py-0.5 px-2.5">
                        {featTournData.badge || 'STAGE 1'}
                      </Badge>
                    </div>

                    {/* Banner Artwork Area */}
                    <div className="relative h-32 w-full overflow-hidden bg-slate-900">
                      <Image
                        src={featTournData.image || '/images/banners/efootball-championship.webp'}
                        alt={featTournData.title || 'eFootball Championship Spotlight'}
                        fill
                        sizes="(max-width: 1024px) 100vw, 500px"
                        loading="lazy"
                        className="object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1010A8] via-transparent to-transparent" />
                    </div>

                    {/* Action Pill Bar */}
                    <Link
                      href={featTournData.cta_url || '/tournaments'}
                      className="w-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] font-black px-5 py-3 text-xs sm:text-sm uppercase tracking-wider flex items-center justify-between transition-colors"
                    >
                      <span>{featTournData.cta_label || 'Special Player List & Rules'}</span>
                      <div className="h-6 w-6 rounded-full bg-[#08088F] text-[#FFFF00] flex items-center justify-center">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Layered Featured Visual & Sub-Cards */}
            <div className="lg:col-span-5 space-y-4">
              <div className="relative rounded-3xl overflow-hidden border border-white/20 bg-slate-900 shadow-2xl aspect-[4/3] group">
                <Image
                  src={heroData.stadium_image || '/images/banners/efootball-stadium.webp'}
                  alt="eFootball Live Arena Visual"
                  fill
                  sizes="(max-width: 1024px) 100vw, 500px"
                  className="object-cover group-hover:scale-105 transition-transform duration-700 opacity-85"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08088F]/90 via-black/20 to-transparent" />

                <Link
                  href={heroData.secondary_button_url || '/live'}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-20 group/play cursor-pointer"
                >
                  <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white text-[#08088F] flex items-center justify-center shadow-2xl group-hover/play:scale-110 group-hover/play:bg-[#FFFF00] transition-all">
                    <Play className="h-8 w-8 fill-current ml-1" />
                  </div>
                  <div className="text-center space-y-0.5">
                    <span className="text-[11px] font-black uppercase tracking-widest text-[#FFFF00]">
                      {heroData.stadium_subtitle || 'eFootball 2026'}
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-black text-white uppercase font-display drop-shadow-md">
                      {heroData.stadium_title || 'SEASON 3 ARENA'}
                    </h3>
                  </div>
                </Link>

                <div className="absolute top-4 left-4 z-20">
                  <span className="px-3 py-1 rounded-full bg-[#FF168B] text-white text-xs font-black uppercase tracking-wider shadow-md">
                    {heroData.stadium_badge || 'HOT TOURNAMENT'}
                  </span>
                </div>
              </div>

              {/* Sub Preview Cards */}
              <div className="grid grid-cols-2 gap-3.5">
                <Link
                  href="/tournaments"
                  className="relative rounded-2xl overflow-hidden border border-white/15 bg-[#1010C5] p-3 aspect-[16/10] flex flex-col justify-end group hover:border-[#FFFF00] transition-all shadow-md"
                >
                  <Image
                    src="/images/banner1.webp"
                    alt="Season 2 Elevate"
                    fill
                    sizes="(max-width: 768px) 50vw, 250px"
                    loading="lazy"
                    className="object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#08088F] via-[#08088F]/50 to-transparent" />
                  <div className="relative z-10 space-y-0.5">
                    <span className="text-[9px] font-black text-[#FFFF00] uppercase tracking-wider">
                      SEASON 2
                    </span>
                    <p className="text-xs font-black text-white leading-tight font-display uppercase truncate">
                      Elevate Excitement
                    </p>
                  </div>
                </Link>

                <Link
                  href="/tournaments"
                  className="relative rounded-2xl overflow-hidden border border-white/15 bg-[#1010C5] p-3 aspect-[16/10] flex flex-col justify-end group hover:border-[#FFFF00] transition-all shadow-md"
                >
                  <Image
                    src="/images/banner2.webp"
                    alt="Match Pass"
                    fill
                    sizes="(max-width: 768px) 50vw, 250px"
                    loading="lazy"
                    className="object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#08088F] via-[#08088F]/50 to-transparent" />
                  <div className="relative z-10 space-y-0.5">
                    <span className="text-[9px] font-black text-[#FFFF00] uppercase tracking-wider">
                      PRO TOURNAMENTS
                    </span>
                    <p className="text-xs font-black text-white leading-tight font-display uppercase truncate">
                      Official Match Pass
                    </p>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          3. LIVE NOW MATCHES SECTION (ISOLATED CLIENT TICKER)
          ========================================================================= */}
      {isLiveVisible && (
        <LiveMatchesTicker
          initialLiveMatches={liveMatches}
          liveSec={liveSec}
          visibilityClass={getVisibilityClass(liveSec)}
        />
      )}

      {/* =========================================================================
          4. TOURNAMENT DISCOVERY — ACTIVE & UPCOMING
          ========================================================================= */}
      {isTournamentsVisible && (
        <section className={cn('space-y-6', getVisibilityClass(upcomingSec))}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Tournaments Column */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-[#FFFF00] text-[#08088F] flex items-center justify-center font-black">
                    <Trophy className="h-4 w-4" />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white uppercase font-display tracking-tight">
                    {(tournData.active_title as string) || 'Active Tournaments'}
                  </h2>
                </div>
                <Button asChild variant="ghost" size="sm" className="text-xs text-[#FFFF00] font-black gap-1 rounded-full">
                  <Link href="/tournaments?status=ongoing">
                    All Active <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>

              {activeT.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/20 bg-[#1414C8]/60 p-8 text-center space-y-3">
                  <Trophy className="h-10 w-10 text-[#FFFF00] mx-auto opacity-70" />
                  <p className="text-sm text-[#D9DCFF] font-medium">No live active tournaments right now.</p>
                  <Button asChild size="sm" className="rounded-full bg-[#FFFF00] text-[#08088F] font-black text-xs">
                    <Link href="/tournaments">View All Tournaments</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeT.slice(0, maxActiveDisplay).map((t) => (
                    <TournamentMiniCard key={t.id} t={t} />
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming Registrations Column */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-[#FFFF00]" />
                  <h2 className="text-2xl font-black text-white uppercase font-display tracking-tight">
                    {(tournData.upcoming_title as string) || 'Upcoming'}
                  </h2>
                </div>
                <Button asChild variant="ghost" size="sm" className="text-xs text-[#FFFF00] font-black rounded-full">
                  <Link href="/tournaments?status=registration">
                    View <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>

              {upcomingT.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/20 bg-[#1414C8]/60 p-6 text-center">
                  <p className="text-xs text-[#D9DCFF]">No upcoming registrations at the moment.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingT.slice(0, maxUpcomingDisplay).map((t) => (
                    <TournamentMiniCard key={t.id} t={t} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recently Completed Tournaments / Champions */}
          {completedT.length > 0 && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-[#FFFF00]" />
                  <h2 className="text-2xl font-black text-white uppercase font-display tracking-tight">
                    {(tournData.completed_title as string) || 'Recent Champions & Completed Tournaments'}
                  </h2>
                </div>
                <Button asChild variant="ghost" size="sm" className="text-xs text-[#FFFF00] font-black rounded-full">
                  <Link href="/tournaments?status=completed">
                    Hall of Fame <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {completedT.map((t) => (
                  <TournamentMiniCard key={t.id} t={t} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          5. ANNOUNCEMENTS SECTION
          ========================================================================= */}
      {isAnnouncementsVisible && (
        <section className={cn('space-y-4', getVisibilityClass(announcementsSec))}>
          <h2 className="text-3xl sm:text-4xl font-black text-white uppercase font-display tracking-tight text-center sm:text-left">
            Announcements
          </h2>

          <div className="rounded-[32px] bg-gradient-to-r from-[#1818D4] via-[#2A2AFF] to-[#1818D4] p-6 sm:p-8 border border-white/20 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-start sm:items-center gap-4 sm:gap-6 min-w-0">
              {/* Date Box */}
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-[#08088F] text-center flex flex-col items-center justify-center p-2 border border-white/10 shrink-0">
                <span className="text-2xl sm:text-3xl font-black text-[#FFFF00] leading-none font-display">
                  12
                </span>
                <span className="text-[10px] font-black uppercase text-[#D9DCFF]">
                  DEC 2026
                </span>
              </div>

              {/* Announcement Copy */}
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge className="bg-white text-[#08088F] text-[10px] font-black uppercase">
                    PLATFORM UPDATE
                  </Badge>
                  <span className="text-xs text-[#D9DCFF] font-semibold">eFootball Platform v4.2.0</span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white font-display uppercase tracking-tight">
                  Tournament Stage Transitioning & WhatsApp Verification Activated
                </h3>
                <p className="text-xs sm:text-sm text-[#D9DCFF] leading-relaxed line-clamp-2 max-w-2xl">
                  Administrators can now automate bracket advancement from group round-robins to knockout brackets with strict WhatsApp ID matching and anti-cheat protection.
                </p>
              </div>
            </div>

            <Link
              href="/about"
              className="rounded-full bg-white hover:bg-slate-100 text-[#08088F] font-black text-xs sm:text-sm px-6 py-3 uppercase tracking-wider shrink-0 transition-transform active:scale-95 shadow-md flex items-center gap-2"
            >
              <span>Read Updates</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
