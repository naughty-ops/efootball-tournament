'use client';

import { CarouselSlide } from '@/components/public/ImageCarousel';

const BANNERS_STORAGE_KEY = 'efootball_home_banners_v1';

export const DEFAULT_HOME_BANNERS: CarouselSlide[] = [
  {
    id: 'slide-1',
    image: '/images/banner1.jpg',
    title: 'eFootball World Championship 2026',
    subtitle: 'Compete with top players worldwide for the ultimate prize pool and glory.',
    badgeText: 'Live Championship',
    actionText: 'View Brackets',
    actionHref: '/tournaments',
  },
  {
    id: 'slide-[#slide-2]',
    image: '/images/banner2.jpg',
    title: 'Super League Season 4 Kickoff',
    subtitle: 'High-stakes competitive eFootball matches starting this weekend.',
    badgeText: 'Upcoming League',
    actionText: 'Explore Schedule',
    actionHref: '/tournaments',
  },
  {
    id: 'slide-[#slide-3]',
    image: '/images/banner3.jpg',
    title: 'Global Community Leaderboard',
    subtitle: 'Track real-time player rankings, match standings, and match highlights.',
    badgeText: 'Official Rankings',
    actionText: 'Check Standings',
    actionHref: '/tournaments',
  },
];

export function getHomeBanners(): CarouselSlide[] {
  if (typeof window === 'undefined') return DEFAULT_HOME_BANNERS;
  try {
    const stored = localStorage.getItem(BANNERS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to read home banners from storage:', e);
  }
  return DEFAULT_HOME_BANNERS;
}

export function saveHomeBanners(slides: CarouselSlide[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BANNERS_STORAGE_KEY, JSON.stringify(slides));
    window.dispatchEvent(new Event('efootball_banners_updated'));
  } catch (e) {
    console.error('Failed to save home banners:', e);
  }
}

export function resetHomeBanners(): CarouselSlide[] {
  if (typeof window === 'undefined') return DEFAULT_HOME_BANNERS;
  try {
    localStorage.removeItem(BANNERS_STORAGE_KEY);
    window.dispatchEvent(new Event('efootball_banners_updated'));
  } catch (e) {
    console.error('Failed to reset home banners:', e);
  }
  return DEFAULT_HOME_BANNERS;
}
