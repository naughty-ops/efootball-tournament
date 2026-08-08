'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ExternalLink, Menu, LogOut, User as UserIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
    <header className="h-16 border-b border-border bg-white/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Left: Mobile Toggle & Search */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden text-[#0B3323] hover:bg-secondary rounded-xl touch-target"
          aria-label="Open Sidebar"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tournaments, players..."
            className="pl-9 h-9 bg-secondary/50 border-border focus-visible:ring-primary/40 text-xs"
          />
        </div>
      </div>

      {/* Top Right Controls */}
      <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
        <Button asChild variant="ghost" size="sm" className="hidden sm:flex gap-1.5 text-xs text-muted-foreground hover:text-primary">
          <Link href="/" target="_blank">
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Public Site</span>
          </Link>
        </Button>

        {/* User Profile Email Indicator */}
        <div className="flex items-center gap-2 pl-2 border-l border-border/80">
          <Badge variant="efootball" className="gap-1.5 py-1 px-2.5 text-[11px] font-semibold">
            <UserIcon className="h-3.5 w-3.5 text-primary" />
            <span className="max-w-[140px] truncate text-[#0B3323]">
              {adminEmail || 'Admin Session'}
            </span>
          </Badge>
        </div>

        {/* Logout Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="h-8 text-xs gap-1.5 border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
}
