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
  Globe,
  ImageIcon,
  Sparkles,
  Ticket,
  Landmark,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Tournament Operations',
    items: [
      { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
      { label: 'Tickets', href: '/admin/tickets', icon: Ticket },
      { label: 'Tournaments', href: '/admin/tournaments', icon: Trophy },
      { label: 'Participants', href: '/admin/participants', icon: Users },
      { label: 'Brackets', href: '/admin/brackets', icon: GitBranch },
      { label: 'Matches', href: '/admin/matches', icon: Swords },
      { label: 'Prize Payouts', href: '/admin/payouts', icon: Landmark },
    ],
  },
  {
    title: 'Website Management',
    items: [
      { label: 'Homepage Control', href: '/admin/cms/homepage', icon: Globe },
      { label: 'Media Assets', href: '/admin/media', icon: ImageIcon },
      { label: 'Avatar Library', href: '/admin/avatars', icon: Sparkles },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { label: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  unresolvedTicketCount?: number;
  hasUrgentTickets?: boolean;
}

export default function AdminSidebar({
  isOpen = false,
  onClose,
  unresolvedTicketCount = 0,
  hasUrgentTickets = false,
}: AdminSidebarProps) {
  const rawPathname = usePathname();
  const pathname = rawPathname || '';
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
          'w-64 border-r border-white/15 bg-[#08088F] flex flex-col justify-between h-screen fixed lg:sticky top-0 left-0 z-50 transition-transform duration-300 ease-in-out text-white',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="p-5 flex flex-col gap-6">
          {/* Admin Brand Header */}
          <div className="flex items-center justify-between px-1">
            <Link href="/admin/dashboard" onClick={onClose} className="flex items-center gap-2.5">
              <div className="relative h-10 w-10 rounded-xl overflow-hidden bg-[#0A0A7A] p-0.5 flex items-center justify-center shrink-0 shadow-md border border-white/20">
                <Image
                  src="/logos/logo-mark-transparent.webp"
                  alt="eFootball Admin Mark"
                  width={40}
                  height={40}
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <h2 className="text-base font-black font-display uppercase tracking-wider text-white leading-none">Admin Panel</h2>
                <span className="text-[10px] text-[#FFFF00] font-black uppercase tracking-wider">Tournament Control</span>
              </div>
            </Link>

            {/* Mobile Close Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="lg:hidden text-white/80 hover:text-white hover:bg-white/10 rounded-xl"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation Sections */}
          <nav className="flex flex-col gap-4 overflow-y-auto pr-1">
            {navSections.map((section, idx) => (
              <div key={section.title || idx} className="space-y-1.5">
                {section.title && (
                  <p className="px-4 text-[10px] font-black uppercase tracking-widest text-[#FFFF00]/70">
                    {section.title}
                  </p>
                )}
                <div className="flex flex-col gap-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    const isTicketsNav = item.href === '/admin/tickets';

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-150 touch-target relative',
                          isActive
                            ? 'bg-[#FFFF00] text-[#08088F] shadow-[0_0_15px_rgba(255,255,0,0.35)]'
                            : 'text-[#D9DCFF] hover:bg-white/10 hover:text-white'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>

                        {isTicketsNav && (
                          <div className="ml-auto flex items-center gap-1.5 shrink-0">
                            {hasUrgentTickets && (
                              <span className="relative flex h-2 w-2" title="Urgent tickets pending">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                              </span>
                            )}
                            {unresolvedTicketCount > 0 && (
                              <span
                                className={cn(
                                  'px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black',
                                  isActive
                                    ? 'bg-[#08088F] text-[#FFFF00]'
                                    : 'bg-[#FF3B30] text-white'
                                )}
                              >
                                {unresolvedTicketCount}
                              </span>
                            )}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Admin Sidebar Footer */}
        <div className="p-4 border-t border-white/15">
          <Button
            variant="outline"
            onClick={handleSignOut}
            disabled={isLoggingOut}
            className="w-full justify-start gap-2 border-white/20 bg-[#0A0A7A] text-[#FF168B] hover:bg-[#FF168B]/15 hover:text-white hover:border-[#FF168B]/40 rounded-2xl font-black text-xs uppercase"
          >
            <LogOut className="h-4 w-4" />
            <span>{isLoggingOut ? 'Signing Out...' : 'Sign Out'}</span>
          </Button>
        </div>
      </aside>
    </>
  );
}
