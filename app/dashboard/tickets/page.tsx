import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  ShieldAlert,
  Plus,
  ChevronLeft,
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquare,
  ArrowRight,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PlayerDashboardHeader from '../PlayerDashboardHeader';
import PlayerDashboardSwipeWrapper from '@/components/dashboard/PlayerDashboardSwipeWrapper';
import { getPlayerTickets } from '@/services/ticketService';
import { getPlayerProfile } from '@/services/playerDashboardService';
import { formatDate } from '@/lib/utils';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My Tickets & Support | eFootball Player Hub',
  description: 'View your submitted support inquiries, match dispute progress, and administrator replies.',
};

export default async function PlayerTicketsPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login?error=unauthorized');
  }

  const [profile, tickets] = await Promise.all([
    getPlayerProfile(supabase, user.id),
    getPlayerTickets(user.id),
  ]);

  const fullName = profile?.display_name || user.user_metadata?.full_name || 'Player';
  const email = user.email || '';
  const efootballId = profile?.efootball_id || user.user_metadata?.efootball_id;
  const isVerified = profile?.efootball_id_verified === true;

  return (
    <div className="min-h-screen bg-[#08088F] text-white pb-16">
      <PlayerDashboardHeader
        userEmail={email}
        displayName={fullName}
        efootballId={efootballId}
        isVerified={isVerified}
        avatarUrl={profile?.avatar_url || '/avatars/default-avatar.svg'}
      />

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <PlayerDashboardSwipeWrapper currentSection="settings">
          <div className="space-y-6">
            {/* Top Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs text-white/70 hover:text-white rounded-full -ml-2.5"
                  >
                    <Link href="/dashboard/settings">
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Settings Center
                    </Link>
                  </Button>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFFF00] text-[#08088F] text-[11px] font-black uppercase tracking-widest">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>Player Support Desk</span>
                </div>
                <h1 className="text-3xl font-black font-display uppercase tracking-wider text-white">
                  My Tickets & Disputes
                </h1>
                <p className="text-xs sm:text-sm text-white/70">
                  Track your open inquiries, submitted match disputes, and official administrator responses.
                </p>
              </div>

              <Button
                asChild
                className="rounded-full bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider gap-2 h-11 px-6 shadow-lg self-start sm:self-auto cursor-pointer"
              >
                <Link href="/contact">
                  <Plus className="h-4 w-4" />
                  <span>Submit New Ticket</span>
                </Link>
              </Button>
            </div>

        {/* Tickets Feed */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] p-6 shadow-2xl text-white">
          {tickets.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-[#00C853] mx-auto opacity-80" />
              <h3 className="text-lg font-bold text-white">You have no active support tickets</h3>
              <p className="text-xs text-white/60 max-w-sm mx-auto">
                Need help with match scheduling, scores, or account questions? Submit an official ticket to the tournament operations team.
              </p>
              <Button
                asChild
                size="sm"
                className="rounded-full bg-[#FFFF00] text-[#08088F] font-black text-xs uppercase tracking-wider hover:bg-[#FFFF00]/90 mt-2"
              >
                <Link href="/contact">
                  Submit a Query
                </Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {tickets.map((t) => {
                let statusBadge = 'bg-white/10 text-white';
                if (t.status === 'open') statusBadge = 'bg-[#3434FF] text-white';
                else if (t.status === 'pending_review') statusBadge = 'bg-[#FF9500]/20 text-[#FF9500] border border-[#FF9500]/40';
                else if (t.status === 'under_investigation') statusBadge = 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40';
                else if (t.status === 'waiting_for_player') statusBadge = 'bg-[#FFFF00] text-[#08088F] font-black';
                else if (t.status === 'resolved') statusBadge = 'bg-[#00C853]/20 text-[#00C853] border border-[#00C853]/40';
                else if (t.status === 'rejected') statusBadge = 'bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/40';

                return (
                  <div key={t.id} className="py-5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 max-w-xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[#FFFF00]">{t.ticket_number}</span>
                        <Badge className={`${statusBadge} text-[10px] font-bold uppercase tracking-wider px-2 py-0.5`}>
                          {t.status.replace(/_/g, ' ')}
                        </Badge>
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/70 text-[10px] font-bold uppercase tracking-wider">
                          🏷️ {t.category.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-white">{t.subject}</h3>
                      <p className="text-xs text-white/70 line-clamp-1">{t.description}</p>
                      <p className="text-[11px] text-white/40">
                        Submitted: {formatDate(t.created_at)} • Last updated: {formatDate(t.updated_at)}
                      </p>
                    </div>

                    <Button
                      asChild
                      size="sm"
                      className="rounded-full bg-[#0A0A7A] hover:bg-white/10 border border-white/20 text-white font-bold text-xs uppercase tracking-wider shrink-0 h-9 px-4 gap-1.5"
                    >
                      <Link href={`/dashboard/tickets/${t.id}`}>
                        <MessageSquare className="h-3.5 w-3.5 text-[#FFFF00]" />
                        <span>View Conversation</span>
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          </Card>
        </div>
      </PlayerDashboardSwipeWrapper>
    </main>
  </div>
);
}
