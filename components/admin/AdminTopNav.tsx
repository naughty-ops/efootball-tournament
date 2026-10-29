'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ExternalLink, Menu, LogOut, User as UserIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface AdminTopNavProps {
  onMenuClick?: () => void;
}

export default function AdminTopNav({ onMenuClick }: AdminTopNavProps) {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    async function fetchUser() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          setAdminEmail(user.email);
        }
      } catch (err) {
        console.error('Error fetching admin profile:', err);
      }
    }

    fetchUser();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="h-16 border-b border-white/15 bg-[#1010C5] text-white px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-md">
      {/* Left: Mobile Toggle & Search */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 max-w-md">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden text-white hover:bg-white/10 rounded-full touch-target shrink-0"
          aria-label="Open Sidebar"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="relative w-full min-w-0 max-w-[160px] sm:max-w-xs">
          <Search className="absolute left-3 top-3 h-4 w-4 text-[#D9DCFF]/60 shrink-0" />
          <Input
            placeholder="Search..."
            className="pl-9 pr-2 h-9 sm:h-10 bg-[#0A0A7A] border-white/20 text-white placeholder:text-[#D9DCFF]/40 rounded-full focus-visible:ring-[#FFFF00]/40 text-xs w-full"
          />
        </div>
      </div>

      {/* Top Right Controls */}
      <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
        <Button asChild variant="ghost" size="sm" className="hidden sm:flex gap-1.5 text-xs text-[#D9DCFF] hover:text-white hover:bg-white/10 rounded-full font-bold">
          <Link href="/" target="_blank">
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Public Site</span>
          </Link>
        </Button>

        {/* User Profile Email Indicator */}
        <div className="flex items-center gap-1.5 pl-1.5 sm:pl-2 border-l border-white/15">
          <div className="flex items-center gap-1.5 py-1 px-2 sm:px-3 rounded-full bg-[#0A0A7A] border border-white/20 text-[11px] font-bold text-white">
            <UserIcon className="h-3.5 w-3.5 text-[#FFFF00] shrink-0" />
            <span className="hidden sm:inline max-w-[140px] truncate">
              {adminEmail || 'Admin Session'}
            </span>
            <span className="inline sm:hidden text-[10px] uppercase font-black text-[#FFFF00]">
              Admin
            </span>
          </div>
        </div>

        {/* Logout Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="h-8 text-xs px-2 sm:px-3 gap-1.5 border-white/20 bg-[#08088F] text-[#D9DCFF] hover:bg-white/10 hover:text-white rounded-full font-bold shrink-0"
          title="Sign Out"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
}
