'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import PublicNav from './PublicNav';
import { Badge } from '@/components/ui/badge';
import { User, LogIn, UserPlus, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function PublicHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (isMounted) {
        setUser(user);
        setIsLoaded(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setUser(session?.user ?? null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
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

  const isDashboardActive = pathname.startsWith('/dashboard');

  return (
    <header className="sticky top-0 z-50 w-full px-2 sm:px-6 pt-2 sm:pt-4 transition-all">
      {/* Centered Pill Container */}
      <div className="mx-auto max-w-6xl rounded-3xl sm:rounded-full bg-[#1A1AE8]/95 sm:bg-[#2020EE]/95 backdrop-blur-xl border border-white/20 shadow-2xl p-2 sm:px-6 sm:py-2.5 flex flex-col md:flex-row items-center justify-between gap-2 sm:gap-4 transition-all">
        
        {/* Top bar on mobile / Left area on desktop */}
        <div className="w-full md:w-auto flex items-center justify-between gap-2 shrink-0">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2 group py-1">
            <div className="flex items-center gap-2">
              <div className="relative h-8 w-8 sm:h-9 sm:w-9 rounded-full flex items-center justify-center shadow-md group-hover:scale-105 transition-transform overflow-hidden shrink-0">
                <Image
                  src="/logos/logo-mark-transparent.png"
                  alt="eFootball Logo"
                  width={36}
                  height={36}
                  className="h-full w-full object-contain"
                  priority
                />
              </div>
              <span className="font-display font-black text-white text-base sm:text-2xl tracking-tight uppercase group-hover:text-[#FFFF00] transition-colors">
                FOOTBALL
              </span>
            </div>
          </Link>

          {/* Mobile Right: Auth & Live Action Controls (Visible on mobile < md) */}
          <div className="flex md:hidden items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Live Badge on mobile */}
            <Link href="/live">
              <Badge
                variant="live"
                className="gap-1 py-0.5 px-2 text-[9px] min-[360px]:text-[10px] min-[360px]:py-1 min-[360px]:px-2.5 font-black shadow-md cursor-pointer shrink-0"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                </span>
                <span>LIVE</span>
              </Badge>
            </Link>

            {isLoaded && user ? (
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <Link
                  href="/dashboard"
                  className={`inline-flex items-center gap-1 sm:gap-1.5 px-2.5 min-[360px]:px-3 py-1 rounded-full text-[11px] min-[360px]:text-xs font-black transition-all shadow-md active:scale-95 shrink-0 ${
                    isDashboardActive
                      ? 'bg-[#FFFF00] text-[#08088F]'
                      : 'bg-white text-[#08088F] hover:bg-slate-100'
                  }`}
                >
                  <User className="h-3 w-3 min-[360px]:h-3.5 min-[360px]:w-3.5 text-[#3434FF]" />
                  <span className="inline min-[360px]:hidden">DASH</span>
                  <span className="hidden min-[360px]:inline">DASHBOARD</span>
                </Link>

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isLoggingOut}
                  title="Sign Out"
                  className="p-1 sm:p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 shrink-0">
                <Link
                  href="/auth/login"
                  className="inline-flex items-center gap-1 px-2 min-[360px]:px-2.5 py-1 rounded-full border border-white/40 text-white hover:bg-white/10 text-[11px] min-[360px]:text-xs font-bold transition-all shrink-0"
                >
                  <LogIn className="h-3 w-3 text-[#FFFF00]" />
                  <span className="inline min-[360px]:hidden">Login</span>
                  <span className="hidden min-[360px]:inline">Sign In</span>
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-1 px-2.5 min-[360px]:px-3 py-1 rounded-full bg-[#FFFF00] text-[#08088F] text-[11px] min-[360px]:text-xs font-black transition-all shadow-md shrink-0"
                >
                  <UserPlus className="h-3 w-3" />
                  <span>JOIN</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Center: Public Navigation Bar (ALWAYS VISIBLE on all screens - NO hamburger menu) */}
        <div className="w-full md:w-auto flex-1 flex justify-center items-center overflow-x-auto no-scrollbar py-0.5">
          <PublicNav />
        </div>

        {/* Right: Desktop Auth & Live Action Controls (Visible on md+) */}
        <div className="hidden md:flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Live eSports Pill */}
          <Link href="/live">
            <Badge
              variant="live"
              className="gap-1.5 py-1 px-3 text-xs font-black shadow-md cursor-pointer hover:scale-105 transition-transform"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              <span>LIVE</span>
            </Badge>
          </Link>

          {isLoaded && user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-black transition-all shadow-md active:scale-95 ${
                  isDashboardActive
                    ? 'bg-[#FFFF00] text-[#08088F] shadow-[0_0_15px_rgba(255,255,0,0.35)]'
                    : 'bg-white hover:bg-slate-100 text-[#08088F]'
                }`}
              >
                <User className="h-4 w-4 text-[#3434FF]" />
                <span>DASHBOARD</span>
              </Link>

              <button
                type="button"
                onClick={handleSignOut}
                disabled={isLoggingOut}
                title="Sign Out"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-white/30 text-white/80 hover:text-white hover:bg-white/10 text-xs font-bold transition-all cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full border border-white/40 text-white hover:bg-white/10 text-xs sm:text-sm font-bold transition-all active:scale-95"
              >
                <LogIn className="h-3.5 w-3.5 text-[#FFFF00] shrink-0" />
                <span>Sign In</span>
              </Link>

              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-1.5 sm:py-2 rounded-full bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] text-xs sm:text-sm font-black transition-all shadow-md active:scale-95"
              >
                <UserPlus className="h-3.5 w-3.5 shrink-0" />
                <span>JOIN</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
