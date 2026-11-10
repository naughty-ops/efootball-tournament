'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  Trophy,
  Swords,
  User,
  LayoutDashboard,
  Compass,
  LogOut,
  ChevronDown,
  ShieldCheck,
  ExternalLink,
  Settings,
  Loader2,
  Wallet,
  Bell,
  Flame,
  LifeBuoy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

export interface PlayerDashboardHeaderProps {
  userEmail: string;
  displayName?: string;
  avatarUrl?: string | null;
  efootballId?: string;
  isVerified?: boolean;
}

const DASHBOARD_NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Home',
    mobileLabel: 'Home',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: '/dashboard/tournaments',
    label: 'Tournaments',
    mobileLabel: 'Tourneys',
    icon: Trophy,
    exact: false,
    matches: (path: string) => path.startsWith('/dashboard/tournaments'),
  },
  {
    href: '/dashboard/matches',
    label: 'Matches',
    mobileLabel: 'Matches',
    icon: Swords,
    exact: false,
    matches: (path: string) => path.startsWith('/dashboard/matches'),
  },
  {
    href: '/dashboard/wallet',
    label: 'Wallet',
    mobileLabel: 'Wallet',
    icon: Wallet,
    exact: false,
  },
  {
    href: '/dashboard/settings',
    label: 'Profile',
    mobileLabel: 'Profile',
    icon: User,
    exact: false,
    matches: (path: string) =>
      path.startsWith('/dashboard/settings') ||
      path.startsWith('/dashboard/profile') ||
      path.startsWith('/dashboard/career'),
  },
];

export default function PlayerDashboardHeader({
  userEmail,
  displayName,
  avatarUrl,
  efootballId,
  isVerified = false,
}: PlayerDashboardHeaderProps) {
  const router = useRouter();
  const rawPathname = usePathname();
  const pathname = rawPathname || '';
  const effectiveAvatarUrl = avatarUrl || '/avatars/default-avatar.svg';
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch unread notifications count for header badge
  useEffect(() => {
    let isMounted = true;
    async function loadUnreadCount() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !isMounted) return;

        const { count, error } = await supabase
          .from('player_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false);

        if (!error && typeof count === 'number' && isMounted) {
          setUnreadNotifications(count);
        }
      } catch {
        // non-blocking
      }
    }

    loadUnreadCount();
    return () => {
      isMounted = false;
    };
  }, [pathname]);

  // Clear optimistic pendingHref once route transition completes
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  // Close dropdown on outside click or Esc key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/auth/login');
      router.refresh();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isTabActive = (item: (typeof DASHBOARD_NAV_ITEMS)[0]) => {
    const targetPath = pendingHref ?? pathname ?? '';
    if (item.matches) return item.matches(targetPath);
    if (item.exact) return targetPath === item.href;
    return targetPath.startsWith(item.href);
  };

  const playerInitial = (displayName || userEmail || 'P').charAt(0).toUpperCase();
  const playerPrimaryName = displayName || userEmail.split('@')[0] || 'Competitor';

  return (
    <header className="sticky top-0 z-50 w-full px-2 sm:px-6 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] sm:pt-4 transition-all">
      {/* Centered Floating Pill Container */}
      <div className="mx-auto max-w-7xl rounded-3xl lg:rounded-full bg-gradient-to-r from-[#1616C0]/95 via-[#1A1AE8]/95 to-[#1616C0]/95 backdrop-blur-2xl border border-white/20 hover:border-white/30 shadow-[0_12px_40px_rgba(8,8,143,0.55)] p-2 sm:px-4 lg:px-6 sm:py-2 flex flex-col lg:flex-row items-center justify-between gap-2 lg:gap-3 transition-all">
        
        {/* Top/Left: Brand Logo & Mobile/Tablet Quick Bar (< lg) */}
        <div className="w-full lg:w-auto flex items-center justify-between gap-2 shrink-0">
          <Link href="/" className="flex items-center gap-2 group py-1">
            <div className="flex items-center gap-2">
              <div className="relative h-8 w-8 sm:h-9 sm:w-9 rounded-full flex items-center justify-center shadow-md group-hover:scale-105 transition-transform overflow-hidden shrink-0 border border-white/20">
                <Image
                  src="/logos/logo-mark-transparent.webp"
                  alt="eFootball Logo"
                  width={36}
                  height={36}
                  className="h-full w-full object-contain"
                  priority
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-display font-black text-white text-base sm:text-2xl tracking-tight uppercase group-hover:text-[#FFFF00] transition-colors">
                  FOOTBALL
                </span>
                <span className="hidden min-[360px]:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#FFFF00]/15 text-[#FFFF00] border border-[#FFFF00]/30 shadow-sm">
                  PLAYER
                </span>
              </div>
            </div>
          </Link>

          {/* Quick Bar (< lg): Explore & Notification Bell & Profile Avatar Dropdown Trigger */}
          <div className="flex lg:hidden items-center gap-1.5 sm:gap-2 shrink-0" ref={dropdownRef}>
            <Link
              href="/tournaments"
              className="inline-flex items-center gap-1 px-2 min-[360px]:px-2.5 py-1 rounded-full text-[11px] font-black uppercase text-[#FFFF00] bg-[#0A0A7A] border border-white/20 active:scale-95 transition-all shadow-sm"
              title="Explore Tournaments"
            >
              <Compass className="h-3 w-3" />
              <span className="hidden min-[360px]:inline">Explore</span>
            </Link>

            {/* Notification Center Quick Trigger */}
            <Link
              href="/dashboard/notifications"
              className={cn(
                'relative h-7 w-7 rounded-full border flex items-center justify-center shrink-0 active:scale-95 transition-all shadow-sm',
                pathname === '/dashboard/notifications'
                  ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00]'
                  : 'bg-[#0A0A7A] border-white/20 text-white/90 hover:text-[#FFFF00]'
              )}
              title="Notifications"
            >
              <Bell className={cn('h-3.5 w-3.5', pathname === '/dashboard/notifications' ? 'text-[#08088F]' : 'text-white/90')} />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-3.5 px-0.5 rounded-full bg-[#FF168B] text-white font-black text-[8px] flex items-center justify-center border border-[#08088F] animate-pulse">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              )}
            </Link>

            {/* Profile Dropdown Toggle Button (< xl) */}
            <button
              type="button"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className={cn(
                'flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full bg-[#0A0A7A] border text-xs font-bold text-white transition-all active:scale-95',
                isDropdownOpen ? 'border-[#FFFF00] shadow-[0_0_10px_rgba(255,255,0,0.3)]' : 'border-white/20'
              )}
              aria-label="User Profile Menu"
              aria-expanded={isDropdownOpen}
            >
              <div className="relative">
                <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-[#FFFF00] to-yellow-300 text-[#08088F] flex items-center justify-center font-black text-xs shadow-sm overflow-hidden">
                  <Image src={effectiveAvatarUrl} alt={playerPrimaryName} width={24} height={24} className="object-cover w-full h-full" />
                </div>
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-[#0A0A7A]" />
              </div>
              <ChevronDown className={cn('h-3.5 w-3.5 text-white/70 transition-transform duration-200', isDropdownOpen && 'rotate-180 text-[#FFFF00]')} />
            </button>

            {/* Dropdown Popover */}
            {isDropdownOpen && (
              <div className="absolute right-2 top-14 w-72 rounded-2xl bg-[#0B0B7C] border border-white/25 shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center gap-2.5 pb-3 border-b border-white/10">
                  <div className="relative">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-[#FFFF00] to-yellow-300 text-[#08088F] flex items-center justify-center font-black text-sm shadow-md overflow-hidden">
                      <Image src={effectiveAvatarUrl} alt={playerPrimaryName} width={36} height={36} className="object-cover w-full h-full" />
                    </div>
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0B0B7C]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-black text-sm text-white truncate">{playerPrimaryName}</span>
                      {isVerified && (
                        <span title="eFootball Verified Competitor" className="shrink-0 flex items-center">
                          <ShieldCheck className="h-3.5 w-3.5 text-[#FFFF00]" />
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-white/60 truncate block">{userEmail}</span>
                    {efootballId && (
                      <span className="inline-block mt-0.5 text-[10px] font-black uppercase text-[#FFFF00] bg-white/10 px-2 py-0.5 rounded-full border border-white/15">
                        ID: {efootballId}
                      </span>
                    )}
                  </div>
                </div>

                <div className="py-2 space-y-1">
                  <Link
                    href="/dashboard/tournaments"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Trophy className="h-3.5 w-3.5 text-[#FFFF00]" />
                    <span>Competition Hub</span>
                  </Link>
                  <Link
                    href="/dashboard/wallet"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Wallet className="h-3.5 w-3.5 text-[#FFFF00]" />
                    <span>My Wallet & Payouts</span>
                  </Link>
                  <Link
                    href="/dashboard/career"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Flame className="h-3.5 w-3.5 text-[#FFFF00]" />
                    <span>Career & Achievements</span>
                  </Link>
                  <Link
                    href="/dashboard/notifications"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Bell className="h-3.5 w-3.5 text-[#FFFF00]" />
                      <span>Notifications</span>
                    </div>
                    {unreadNotifications > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-[#FF168B] text-white text-[9px] font-black">
                        {unreadNotifications}
                      </span>
                    )}
                  </Link>
                  <Link
                    href="/dashboard/tickets"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <LifeBuoy className="h-3.5 w-3.5 text-[#FFFF00]" />
                    <span>Support Desk & Disputes</span>
                  </Link>
                  <Link
                    href="/dashboard/settings"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Settings className="h-3.5 w-3.5 text-[#FFFF00]" />
                    <span>Account Settings</span>
                  </Link>
                  <Link
                    href="/tournaments"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Compass className="h-3.5 w-3.5 text-[#FFFF00]" />
                    <span>Explore Tournaments</span>
                  </Link>
                  <Link
                    href="/"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-white/60" />
                    <span>Public Homepage</span>
                  </Link>
                </div>

                <div className="pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 hover:text-red-200 text-xs font-black transition-colors"
                  >
                    {isLoggingOut ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="h-3.5 w-3.5" />
                    )}
                    <span>{isLoggingOut ? 'Signing Out...' : 'Sign Out'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Direct 1-Tap Access Tab Bar in Complete, Flawless Pill Shape */}
        <div className="w-full lg:w-auto flex-1 flex justify-center items-center py-0.5">
          <nav
            role="navigation"
            aria-label="Dashboard Navigation"
            className="w-full max-w-lg lg:max-w-none lg:w-auto grid grid-cols-5 lg:flex items-center justify-center gap-1 sm:gap-1.5 rounded-full bg-[#0D0D96]/90 lg:bg-white/10 backdrop-blur-md p-1 sm:p-1.5 border border-white/20 shadow-inner"
          >
            {DASHBOARD_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isTabActive(item);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    if (pathname !== item.href) {
                      setPendingHref(item.href);
                    }
                  }}
                  className={cn(
                    'relative w-full lg:w-auto flex items-center justify-center gap-1.5 lg:gap-2 h-9 lg:h-10 px-1 sm:px-2.5 lg:px-3.5 xl:px-4.5 rounded-full font-black tracking-wide transition-all duration-200 active:scale-95 touch-target select-none',
                    active
                      ? 'bg-[#FFFF00] text-[#08088F] shadow-[0_2px_14px_rgba(255,255,0,0.45)]'
                      : 'text-white/80 hover:text-[#FFFF00] hover:bg-white/10'
                  )}
                >
                  {/* Icons hidden on Mobile / Tablet (Row 2), visible only on Desktop (lg+) */}
                  <Icon
                    className={cn(
                      'hidden lg:block h-4 w-4 lg:h-4.5 lg:w-4.5 shrink-0 transition-transform',
                      active ? 'text-[#08088F]' : 'text-[#D9DCFF]'
                    )}
                  />
                  <span className="hidden min-[400px]:inline text-[11px] sm:text-xs lg:text-[13px] xl:text-sm font-black whitespace-nowrap">
                    {item.label}
                  </span>
                  <span className="inline min-[400px]:hidden text-[9.5px] min-[340px]:text-[10px] font-black leading-tight tracking-tight whitespace-nowrap">
                    {item.mobileLabel}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Desktop Right: Explore Tournaments & Alerts Icon Only & User Profile Dropdown (lg+) */}
        <div className="hidden lg:flex items-center gap-2 sm:gap-2.5 shrink-0" ref={dropdownRef}>
          {/* Explore Tournaments Button */}
          <Link
            href="/tournaments"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-white/20 text-[#FFFF00] hover:bg-white/10 hover:border-[#FFFF00]/40 text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <Compass className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden xl:inline">Explore Tournaments</span>
            <span className="inline xl:hidden">Explore</span>
          </Link>

          {/* Alerts Icon Only Button (placed right near Explore Tournaments) */}
          <Link
            href="/dashboard/notifications"
            className={cn(
              'relative h-9 w-9 rounded-full border flex items-center justify-center transition-all shadow-sm active:scale-95 shrink-0 cursor-pointer',
              pathname === '/dashboard/notifications'
                ? 'bg-[#FFFF00] text-[#08088F] border-[#FFFF00] shadow-[0_0_12px_rgba(255,255,0,0.4)]'
                : 'bg-[#0A0A7A] border-white/20 text-white hover:text-[#FFFF00] hover:bg-white/10'
            )}
            title="Alerts & Notifications"
            aria-label="Alerts & Notifications"
          >
            <Bell className={cn('h-4 w-4', pathname === '/dashboard/notifications' ? 'text-[#08088F]' : 'text-[#FFFF00]')} />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[#FF168B] text-white font-black text-[9px] flex items-center justify-center border border-[#08088F] shadow-md animate-pulse">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </Link>

          {/* Interactive Player Badge with Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className={cn(
                'h-9 flex items-center gap-2 pl-1.5 pr-3 rounded-full bg-[#0A0A7A] border text-xs font-bold text-white transition-all cursor-pointer hover:bg-[#0E0EA0]',
                isDropdownOpen
                  ? 'border-[#FFFF00] ring-2 ring-[#FFFF00]/20 shadow-[0_0_12px_rgba(255,255,0,0.3)]'
                  : 'border-white/20 hover:border-white/40'
              )}
              aria-label="User Profile Menu"
              aria-expanded={isDropdownOpen}
            >
              <div className="relative">
                <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-[#FFFF00] to-yellow-300 text-[#08088F] flex items-center justify-center font-black text-xs shadow-sm overflow-hidden">
                  <Image src={effectiveAvatarUrl} alt={playerPrimaryName} width={24} height={24} className="object-cover w-full h-full" />
                </div>
                <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-[#0A0A7A]" />
              </div>
              <span className="max-w-[75px] xl:max-w-[110px] truncate text-xs font-black">{playerPrimaryName}</span>
              {isVerified && (
                <span title="eFootball Verified Competitor" className="shrink-0 flex items-center">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#FFFF00]" />
                </span>
              )}
              <ChevronDown className={cn('h-3.5 w-3.5 text-white/70 transition-transform duration-200', isDropdownOpen && 'rotate-180 text-[#FFFF00]')} />
            </button>

            {/* Desktop Profile Dropdown Popover */}
            {isDropdownOpen && (
              <div className="absolute right-0 top-12 w-80 rounded-2xl bg-[#0B0B7C]/95 backdrop-blur-2xl border border-white/25 shadow-2xl p-3.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center gap-3 pb-3 border-b border-white/15">
                  <div className="relative">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#FFFF00] to-yellow-300 text-[#08088F] flex items-center justify-center font-black text-base shadow-md overflow-hidden">
                      <Image src={effectiveAvatarUrl} alt={playerPrimaryName} width={40} height={40} className="object-cover w-full h-full" />
                    </div>
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0B0B7C]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-sm text-white truncate">{playerPrimaryName}</span>
                      {isVerified && (
                        <span title="eFootball Verified Competitor" className="shrink-0 flex items-center">
                          <ShieldCheck className="h-4 w-4 text-[#FFFF00]" />
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-white/60 truncate block">{userEmail}</span>
                    {efootballId && (
                      <div className="inline-flex items-center gap-1 mt-1 text-[10px] font-black uppercase text-[#FFFF00] bg-white/10 px-2 py-0.5 rounded-full border border-white/15">
                        <span>ID:</span>
                        <span className="tracking-wider">{efootballId}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="py-2.5 space-y-1">
                  <Link
                    href="/dashboard/tournaments"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Trophy className="h-4 w-4 text-[#FFFF00]" />
                      <span>Competition Hub</span>
                    </div>
                    <ChevronDown className="h-3 w-3 -rotate-90 text-white/40" />
                  </Link>

                  <Link
                    href="/dashboard/wallet"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Wallet className="h-4 w-4 text-[#FFFF00]" />
                      <span>My Wallet & Payouts</span>
                    </div>
                    <ChevronDown className="h-3 w-3 -rotate-90 text-white/40" />
                  </Link>

                  <Link
                    href="/dashboard/career"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Flame className="h-4 w-4 text-[#FFFF00]" />
                      <span>Career & Achievements</span>
                    </div>
                    <ChevronDown className="h-3 w-3 -rotate-90 text-white/40" />
                  </Link>

                  <Link
                    href="/dashboard/notifications"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Bell className="h-4 w-4 text-[#FFFF00]" />
                      <span>Notification Center</span>
                    </div>
                    {unreadNotifications > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-[#FF168B] text-white text-[10px] font-black">
                        {unreadNotifications}
                      </span>
                    )}
                  </Link>

                  <Link
                    href="/dashboard/tickets"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <LifeBuoy className="h-4 w-4 text-[#FFFF00]" />
                      <span>Support Desk & Disputes</span>
                    </div>
                    <ChevronDown className="h-3 w-3 -rotate-90 text-white/40" />
                  </Link>

                  <Link
                    href="/dashboard/settings"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Settings className="h-4 w-4 text-[#FFFF00]" />
                      <span>Account Settings</span>
                    </div>
                    <ChevronDown className="h-3 w-3 -rotate-90 text-white/40" />
                  </Link>

                  <Link
                    href="/tournaments"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Compass className="h-4 w-4 text-[#FFFF00]" />
                      <span>Explore Open Tournaments</span>
                    </div>
                    <ChevronDown className="h-3 w-3 -rotate-90 text-white/40" />
                  </Link>

                  <Link
                    href="/"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <ExternalLink className="h-4 w-4 text-white/60" />
                      <span>Public Platform Homepage</span>
                    </div>
                  </Link>
                </div>

                <div className="pt-2.5 border-t border-white/15">
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 hover:text-red-200 text-xs font-black transition-colors"
                  >
                    {isLoggingOut ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="h-3.5 w-3.5" />
                    )}
                    <span>{isLoggingOut ? 'Signing Out...' : 'Sign Out'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
