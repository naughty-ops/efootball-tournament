'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Trophy,
  Users,
  Swords,
  Settings,
  LogOut,
  X,
  GitBranch,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navItems = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Tournaments', href: '/admin/tournaments', icon: Trophy },
  { label: 'Participants', href: '/admin/participants', icon: Users },
  { label: 'Brackets', href: '/admin/brackets', icon: GitBranch },
  { label: 'Matches', href: '/admin/matches', icon: Swords },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function AdminSidebar({ isOpen = false, onClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    if (onClose) onClose();
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/login');
      router.refresh();
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'w-64 border-r border-border bg-white flex flex-col justify-between h-screen fixed lg:sticky top-0 left-0 z-50 transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="p-5 flex flex-col gap-6">
          {/* Admin Brand Header */}
          <div className="flex items-center justify-between px-1">
            <Link href="/admin/dashboard" onClick={onClose} className="flex items-center gap-2.5">
              <div className="relative h-10 w-10 rounded-xl overflow-hidden bg-[#0B3323] p-0.5 flex items-center justify-center shrink-0 shadow-sm border border-[#0B3323]/20">
                <Image
                  src="/logos/logo-mark-transparent.png"
                  alt="eFootball Admin Mark"
                  width={40}
                  height={40}
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-[#0B3323] leading-none">Admin Panel</h2>
                <span className="text-[10px] text-muted-foreground font-semibold">Tournament Control</span>
              </div>
            </Link>

            {/* Mobile Close Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="lg:hidden text-muted-foreground hover:text-primary rounded-xl"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 touch-target',
                    isActive
                      ? 'bg-primary text-white shadow-sm shadow-primary/30 font-semibold'
                      : 'text-muted-foreground hover:bg-secondary hover:text-[#0B3323]'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Admin Sidebar Footer */}
        <div className="p-4 border-t border-border">
          <Button
            variant="outline"
            onClick={handleSignOut}
            disabled={isLoggingOut}
            className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
          >
            <LogOut className="h-4 w-4" />
            <span>{isLoggingOut ? 'Signing Out...' : 'Sign Out'}</span>
          </Button>
        </div>
      </aside>
    </>
  );
}
