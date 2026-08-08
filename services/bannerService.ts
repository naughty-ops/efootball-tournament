'use client';

import { createClient } from '@/lib/supabase/client';
import { CarouselSlide } from '@/components/public/ImageCarousel';

const BANNERS_STORAGE_KEY = 'efootball_home_banners_v1';
const SITE_SETTING_KEY = 'home_banners';

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
    id: 'slide-2',
    image: '/images/banner2.jpg',
    title: 'Super League Season 4 Kickoff',
    subtitle: 'High-stakes competitive eFootball matches starting this weekend.',
    badgeText: 'Upcoming League',
    actionText: 'Explore Schedule',
    actionHref: '/tournaments',
  },
  {
    id: 'slide-3',
    image: '/images/banner3.jpg',
    title: 'Global Community Leaderboard',
    subtitle: 'Track real-time player rankings, match standings, and match highlights.',
    badgeText: 'Official Rankings',
    actionText: 'Check Standings',
    actionHref: '/tournaments',
  },
];

export async function fetchHomeBannersFromDB(): Promise<CarouselSlide[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', SITE_SETTING_KEY)
      .maybeSingle();

    const row = data as unknown as { value: CarouselSlide[] } | null;

    if (!error && row?.value && Array.isArray(row.value) && row.value.length > 0) {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(BANNERS_STORAGE_KEY, JSON.stringify(row.value));
        } catch { /* silent */ }
      }
      return row.value;
    }
  } catch (e) {
    console.warn('Could not fetch home banners from DB:', e);
  }
  return getHomeBanners();
}

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

export async function saveHomeBanners(slides: CarouselSlide[]): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(BANNERS_STORAGE_KEY, JSON.stringify(slides));
      window.dispatchEvent(new Event('efootball_banners_updated'));
    } catch (e) {
      console.error('Failed to save home banners locally:', e);
    }
  }

  try {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('site_settings') as any).upsert({
      key: SITE_SETTING_KEY,
      value: slides,
      updated_at: new Date().toISOString(),
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('efootball_banners_updated'));
    }
  } catch (err) {
    console.warn('Could not save home banners to Supabase DB:', err);
  }
}

export async function resetHomeBanners(): Promise<CarouselSlide[]> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(BANNERS_STORAGE_KEY);
    } catch { /* silent */ }
  }

  try {
    const supabase = createClient();
    await supabase.from('site_settings').delete().eq('key', SITE_SETTING_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('efootball_banners_updated'));
    }
  } catch (err) {
    console.warn('Could not reset home banners in Supabase DB:', err);
  }

  return DEFAULT_HOME_BANNERS;
}
