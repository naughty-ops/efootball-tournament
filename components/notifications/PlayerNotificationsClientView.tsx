'use client';

import React, { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCircle2,
  Clock,
  Filter,
  DollarSign,
  Swords,
  Trophy,
  LifeBuoy,
  Megaphone,
  ArrowRight,
  ExternalLink,
  Check,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatDate } from '@/lib/utils';
import type { PlayerNotificationItem } from '@/services/notificationService';
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from '@/app/actions/notificationActions';

interface PlayerNotificationsClientViewProps {
  initialNotifications: PlayerNotificationItem[];
  openTicketsCount?: number;
}

const CATEGORIES = [
  { key: 'all', label: 'All Alerts', icon: Bell },
  { key: 'financial', label: 'Prizes & Wallet', icon: DollarSign },
  { key: 'matches', label: 'Matches', icon: Swords },
  { key: 'tournaments', label: 'Tournaments', icon: Trophy },
  { key: 'support', label: 'Support & Tickets', icon: LifeBuoy },
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
] as const;

export default function PlayerNotificationsClientView({
  initialNotifications,
  openTicketsCount = 0,
}: PlayerNotificationsClientViewProps) {
  const [notifications, setNotifications] = useState<PlayerNotificationItem[]>(initialNotifications);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    if (activeCategory === 'all') return notifications;
    return notifications.filter((n) => {
      const type = (n.type || '').toLowerCase();
      if (activeCategory === 'financial') {
        return type.includes('financial') || type.includes('prize') || type.includes('wallet') || type.includes('payout');
      }
      if (activeCategory === 'matches') {
        return type.includes('match') || type.includes('fixture') || type.includes('score');
      }
      if (activeCategory === 'tournaments') {
        return type.includes('tournament') || type.includes('bracket') || type.includes('register');
      }
      if (activeCategory === 'support') {
        return type.includes('support') || type.includes('ticket') || type.includes('verify') || type.includes('dispute');
      }
      if (activeCategory === 'announcements') {
        return type.includes('system') || type.includes('announcement') || type.includes('general');
      }
      return type === activeCategory;
    });
  }, [notifications, activeCategory]);

  const handleMarkAsRead = async (id: string) => {
    setProcessingId(id);
    startTransition(async () => {
      const res = await markNotificationReadAction(id);
      if (res.success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
      }
      setProcessingId(null);
    });
  };

  const handleMarkAllAsRead = async () => {
    setProcessingId('all');
    startTransition(async () => {
      const res = await markAllNotificationsReadAction();
      if (res.success) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
      setProcessingId(null);
    });
  };

  const getNotificationIcon = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t.includes('financial') || t.includes('prize') || t.includes('wallet') || t.includes('payout')) {
      return { icon: DollarSign, color: 'text-[#00C853]', bg: 'bg-[#00C853]/10 border-[#00C853]/30' };
    }
    if (t.includes('match') || t.includes('fixture') || t.includes('score')) {
      return { icon: Swords, color: 'text-[#FFFF00]', bg: 'bg-[#FFFF00]/10 border-[#FFFF00]/30' };
    }
    if (t.includes('tournament') || t.includes('bracket')) {
      return { icon: Trophy, color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30' };
    }
    if (t.includes('support') || t.includes('ticket') || t.includes('dispute')) {
      return { icon: LifeBuoy, color: 'text-cyan-400', bg: 'bg-cyan-400/10 border-cyan-400/30' };
    }
    return { icon: Megaphone, color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/30' };
  };

  return (
    <div className="space-y-6">
      {/* 1. Support Desk Quick Card */}
      <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] p-5 text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#05053B] border border-cyan-400/30 flex items-center justify-center text-cyan-300 shrink-0 shadow-inner">
            <LifeBuoy className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black uppercase font-display tracking-wider">
                Player Support Desk
              </h2>
              {openTicketsCount > 0 && (
                <Badge className="bg-amber-400 text-[#08088F] text-[10px] font-black uppercase tracking-wider rounded-full px-2">
                  {openTicketsCount} Open {openTicketsCount === 1 ? 'Ticket' : 'Tickets'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-white/70 mt-0.5">
              Submit match dispute appeals, account inquiries, or track existing tickets directly.
            </p>
          </div>
        </div>

        <Button
          asChild
          className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-full h-10 px-5 shadow-lg gap-1.5 shrink-0 cursor-pointer"
        >
          <Link href="/dashboard/tickets">
            <span>Open Support Tickets</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </Button>
      </Card>

      {/* 2. Controls & Categories Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.key;
            const Icon = cat.icon;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all duration-200 cursor-pointer',
                  isActive
                    ? 'bg-[#FFFF00] text-[#08088F] shadow-md shadow-[#FFFF00]/20'
                    : 'bg-[#05053B] border border-white/10 text-white/70 hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-[#08088F]' : 'text-white/60')} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Action: Mark All as Read */}
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllAsRead}
            disabled={processingId === 'all' || isPending}
            className="rounded-full border-white/20 text-white hover:bg-white/10 text-xs font-black uppercase tracking-wider h-9 px-4 shrink-0 gap-1.5 cursor-pointer"
          >
            {processingId === 'all' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5 text-[#00C853]" />
            )}
            <span>Mark All Read ({unreadCount})</span>
          </Button>
        )}
      </div>

      {/* 3. Notifications Feed */}
      {filteredNotifications.length === 0 ? (
        <Card className="p-12 text-center bg-[#1818D4] border border-white/20 rounded-[32px] text-white space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[#05053B] border border-white/10 flex items-center justify-center text-[#FFFF00] mb-2">
            <Bell className="w-8 h-8 opacity-40" />
          </div>
          <h3 className="text-lg font-black uppercase tracking-wider font-display">
            All Caught Up!
          </h3>
          <p className="text-xs text-white/70 max-w-md mx-auto leading-relaxed">
            {activeCategory === 'all'
              ? 'You have no notifications right now. Match call-ups, tournament updates, and payout receipts will appear here.'
              : `No alerts found in the "${activeCategory}" category.`}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notif) => {
            const meta = getNotificationIcon(notif.type);
            const Icon = meta.icon;
            const isBusy = processingId === notif.id;

            return (
              <Card
                key={notif.id}
                className={cn(
                  'rounded-2xl p-4 sm:p-5 border transition-all duration-200 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4',
                  notif.isRead
                    ? 'bg-[#1818D4]/70 border-white/10'
                    : 'bg-[#1818D4] border-[#FFFF00]/50 shadow-lg shadow-[#FFFF00]/5'
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 mt-0.5',
                      meta.bg,
                      meta.color
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-white font-display uppercase tracking-wider">
                        {notif.title}
                      </h4>
                      {!notif.isRead && (
                        <span className="w-2 h-2 rounded-full bg-[#FFFF00] animate-pulse" />
                      )}
                    </div>
                    <p className="text-xs text-white/80 leading-relaxed max-w-2xl">
                      {notif.message}
                    </p>
                    <div className="flex items-center gap-2 pt-1 text-[11px] text-white/50">
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(notif.createdAt)}</span>
                      <span className="text-white/20">•</span>
                      <span className="uppercase text-[10px] font-bold text-white/40 tracking-wider">
                        {notif.type}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {notif.actionUrl && (
                    <Button
                      asChild
                      size="sm"
                      className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider rounded-full h-8 px-4 cursor-pointer"
                    >
                      <Link href={notif.actionUrl}>
                        <span>View</span>
                        <ArrowRight className="w-3 h-3 ml-1" />
                      </Link>
                    </Button>
                  )}

                  {!notif.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMarkAsRead(notif.id)}
                      disabled={isBusy}
                      className="text-white/70 hover:text-white hover:bg-white/10 text-xs font-bold rounded-full h-8 px-3 cursor-pointer"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5 mr-1 text-[#00C853]" />
                      )}
                      <span>Mark Read</span>
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
