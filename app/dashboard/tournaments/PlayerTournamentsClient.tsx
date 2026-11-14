'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Trophy,
  Calendar,
  Users,
  Compass,
  ArrowRight,
  Filter,
  CheckCircle2,
  Clock,
  Flame,
  AlertCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Target,
  Search,
  ShieldCheck,
  Check,
  CreditCard,
  MessageSquare,
  FileCheck2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatDate } from '@/lib/utils';
import { SwipeableTabBar, SwipeableTabContainer } from '@/components/ui/SwipeableTabs';
import type { PlayerTournamentItem, PlayerPaymentRegistrationItem } from '@/services/playerDashboardService';
import type { ManualPaymentSettings } from '@/types/database';
import { cancelRegistrationAction } from '@/app/actions/playerActions';
import { cancelRegistrationRequestAction } from '@/app/actions/paymentRegistrationActions';
import { generateWhatsAppPaymentLink } from '@/lib/whatsappPayment';
import { DEFAULT_MANUAL_PAYMENT_SETTINGS } from '@/services/paymentSettingsService';
import { usePlayerDashboardTabStore } from '@/lib/stores/useTabStateStore';

interface PlayerTournamentsClientProps {
  initialTournaments: PlayerTournamentItem[];
  initialPaymentRegistrations?: PlayerPaymentRegistrationItem[];
  paymentSettings?: ManualPaymentSettings;
  playerProfile?: {
    display_name?: string;
    efootball_id?: string;
    whatsapp_number?: string;
  };
  initialError?: string | null;
}

const TABS = [
  { key: 'all', label: 'All Tournaments', icon: Filter },
  { key: 'ongoing', label: 'In Progress', icon: Flame },
  { key: 'registration', label: 'Upcoming', icon: Clock },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
] as const;

export default function PlayerTournamentsClient({
  initialTournaments,
  initialPaymentRegistrations = [],
  paymentSettings = DEFAULT_MANUAL_PAYMENT_SETTINGS,
  playerProfile = {},
  initialError,
}: PlayerTournamentsClientProps) {
  const [tournaments, setTournaments] = useState<PlayerTournamentItem[]>(initialTournaments);
  const [paymentRegistrations, setPaymentRegistrations] = useState<PlayerPaymentRegistrationItem[]>(initialPaymentRegistrations);
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const { tournamentSearch: searchQuery, setTournamentSearch: setSearchQuery } = usePlayerDashboardTabStore();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleCancelPaymentRequest = async (requestId: string) => {
    if (!window.confirm('Are you sure you want to cancel this registration request?')) return;
    setCancellingId(requestId);
    setFeedback(null);
    try {
      const res = await cancelRegistrationRequestAction(requestId);
      if (res.success) {
        setPaymentRegistrations((prev) => prev.filter((r) => r.id !== requestId));
        setFeedback({ message: 'Registration request cancelled.', type: 'success' });
      } else {
        setFeedback({ message: res.message || 'Failed to cancel request.', type: 'error' });
      }
    } catch {
      setFeedback({ message: 'Error cancelling registration request.', type: 'error' });
    } finally {
      setCancellingId(null);
    }
  };

  // Calculate real, data-backed summary numbers directly from user's records
  const stats = useMemo(() => {
    const totalJoined = tournaments.length;
    const activeCount = tournaments.filter((t) => t.status === 'ongoing').length;
    const upcomingCount = tournaments.filter((t) => t.status === 'registration').length;
    const completedCount = tournaments.filter((t) => t.status === 'completed').length;
    const approvedCount = tournaments.filter((t) => t.participantStatus === 'approved').length;

    return { totalJoined, activeCount, upcomingCount, completedCount, approvedCount };
  }, [tournaments]);

  const tabItems = useMemo(
    () => [
      { id: 'all', label: 'All', icon: Filter, badge: stats.totalJoined },
      { id: 'ongoing', label: 'In Progress', icon: Flame, badge: stats.activeCount > 0 ? stats.activeCount : undefined },
      { id: 'registration', label: 'Upcoming', icon: Clock, badge: stats.upcomingCount > 0 ? stats.upcomingCount : undefined },
      { id: 'completed', label: 'Completed', icon: CheckCircle2, badge: stats.completedCount > 0 ? stats.completedCount : undefined },
    ],
    [stats]
  );
  const tabIds = useMemo(() => ['all', 'ongoing', 'registration', 'completed'], []);

  const filteredTournaments = useMemo(() => {
    return tournaments.filter((t) => {
      const matchesTab = selectedTab === 'all' || t.status === selectedTab;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        t.tournamentName.toLowerCase().includes(q) ||
        t.format.toLowerCase().includes(q) ||
        (t.groupName && t.groupName.toLowerCase().includes(q));
      return matchesTab && matchesSearch;
    });
  }, [tournaments, selectedTab, searchQuery]);

  const handleCancelRegistration = async (tournamentId: string, tournamentName: string) => {
    if (!window.confirm(`Are you sure you want to withdraw your registration from "${tournamentName}"?`)) {
      return;
    }

    setCancellingId(tournamentId);
    setFeedback(null);

    try {
      const res = await cancelRegistrationAction(tournamentId);
      if (res.success) {
        setTournaments((prev) => prev.filter((t) => t.tournamentId !== tournamentId));
        setFeedback({ message: `Successfully withdrawn from ${tournamentName}.`, type: 'success' });
      } else {
        setFeedback({ message: res.message || 'Failed to cancel registration.', type: 'error' });
      }
    } catch {
      setFeedback({ message: 'A network error occurred while cancelling registration.', type: 'error' });
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Summary Cards Section */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Joined */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[24px] p-5 shadow-lg text-white">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-black uppercase tracking-wider text-white/70">Total Joined</span>
            <div className="h-8 w-8 rounded-full bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
              <Trophy className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#FFFF00] font-display">{stats.totalJoined}</div>
          <p className="text-[11px] text-white/60 mt-1">Tournaments registered</p>
        </Card>

        {/* Live / In Progress */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[24px] p-5 shadow-lg text-white">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-black uppercase tracking-wider text-white/70">In Progress</span>
            <div className="h-8 w-8 rounded-full bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FF168B]">
              <Flame className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#FF168B] font-display">{stats.activeCount}</div>
          <p className="text-[11px] text-white/60 mt-1">Currently competing</p>
        </Card>

        {/* Upcoming */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[24px] p-5 shadow-lg text-white">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-black uppercase tracking-wider text-white/70">Upcoming</span>
            <div className="h-8 w-8 rounded-full bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#FFFF00] font-display">{stats.upcomingCount}</div>
          <p className="text-[11px] text-white/60 mt-1">Starting soon</p>
        </Card>

        {/* Completed */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[24px] p-5 shadow-lg text-white">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-black uppercase tracking-wider text-white/70">Completed</span>
            <div className="h-8 w-8 rounded-full bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#00C853]">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#00C853] font-display">{stats.completedCount}</div>
          <p className="text-[11px] text-white/60 mt-1">Archived results</p>
        </Card>
      </div>

      {/* Query Error State */}
      {initialError && tournaments.length === 0 && (
        <Card className="p-8 text-center bg-red-950/40 border border-red-500/30 rounded-3xl space-y-4 text-white">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-400">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-white uppercase font-display">Database Connection Issue</h3>
            <p className="text-xs text-white/70 max-w-md mx-auto mt-1">
              {initialError}
            </p>
          </div>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            size="sm"
            className="rounded-full text-xs font-black uppercase tracking-wider border-white/30 text-white hover:bg-white/10 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry Loading</span>
          </Button>
        </Card>
      )}

      {/* Action Feedback Banner */}
      {feedback && (
        <div
          className={cn(
            'p-4 rounded-2xl text-xs font-black flex items-center justify-between border uppercase tracking-wider',
            feedback.type === 'success'
              ? 'bg-[#00C853]/20 text-[#00C853] border-[#00C853]/40'
              : 'bg-red-500/20 text-red-300 border-red-500/40'
          )}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs underline hover:no-underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Payment & Verification Requests Banner/List */}
      {paymentRegistrations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[#FFFF00]" />
              <span>Pending Payment & Verification Requests ({paymentRegistrations.length})</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paymentRegistrations.map((req) => {
              const isPending = req.status === 'pending_payment';
              const isUnderReview = req.status === 'under_verification';
              const isRejected = req.status === 'rejected';

              const waUrl = generateWhatsAppPaymentLink({
                adminWhatsAppNumber: paymentSettings.admin_whatsapp_number || '+919207516227',
                tournamentName: req.tournamentName,
                tournamentId: req.tournamentId,
                registrationId: req.id,
                userName: playerProfile?.display_name || 'Player',
                efootballId: playerProfile?.efootball_id || 'Not set',
                userPhone: playerProfile?.whatsapp_number || '',
                entryFeeINR: req.entryFeeINR,
              });

              return (
                <Card
                  key={req.id}
                  className="bg-[#1010C5] border border-white/20 rounded-[24px] p-5 shadow-lg text-white space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isPending && (
                          <Badge className="bg-[#FFFF00] text-[#08088F] font-black text-[10px] uppercase px-2.5 py-0.5 rounded-full border-0">
                            PAYMENT PENDING
                          </Badge>
                        )}
                        {isUnderReview && (
                          <Badge className="bg-amber-400 text-amber-950 font-black text-[10px] uppercase px-2.5 py-0.5 rounded-full border-0">
                            UNDER VERIFICATION
                          </Badge>
                        )}
                        {isRejected && (
                          <Badge className="bg-rose-500 text-white font-black text-[10px] uppercase px-2.5 py-0.5 rounded-full border-0">
                            REJECTED
                          </Badge>
                        )}
                        <span className="text-emerald-400 font-extrabold text-xs">₹{req.entryFeeINR} INR</span>
                      </div>
                      <h3 className="text-base font-black text-white font-display uppercase tracking-tight">
                        {req.tournamentName}
                      </h3>
                    </div>

                    <span className="text-[10px] text-[#D9DCFF]/70 font-mono shrink-0">
                      ID: {req.id.slice(0, 8)}
                    </span>
                  </div>

                  {isRejected && req.rejectionReason && (
                    <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-200 text-xs">
                      <strong>Rejection reason:</strong> {req.rejectionReason}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <Button
                      asChild
                      size="sm"
                      className="bg-[#00C853] hover:bg-[#00B048] text-[#072418] text-xs font-black rounded-full h-9 px-4 uppercase tracking-wider shadow-sm gap-1.5 cursor-pointer"
                    >
                      <a href={waUrl} target="_blank" rel="noopener noreferrer">
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>Chat on WhatsApp</span>
                      </a>
                    </Button>

                    {(isPending || isUnderReview) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancelPaymentRequest(req.id)}
                        disabled={cancellingId === req.id}
                        className="text-xs font-bold rounded-full h-9 px-3 border-white/20 text-rose-300 hover:bg-rose-500/20 hover:text-white"
                      >
                        {cancellingId === req.id ? 'Cancelling...' : 'Cancel Request'}
                      </Button>
                    )}

                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="text-xs font-bold rounded-full h-9 px-3 border-white/20 text-white hover:bg-white/10"
                    >
                      <Link href={`/tournaments/${req.tournamentId}`}>Tournament Page</Link>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Controls: Search & Tabs Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Swipeable Tabs Bar */}
        <SwipeableTabBar
          tabs={tabItems}
          activeTab={selectedTab}
          onTabChange={setSelectedTab}
          className="w-full md:w-auto"
        />

        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-white/50" />
          <Input
            placeholder="Search my tournaments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 sm:h-10 text-base sm:text-xs bg-[#0A0A7A] border-white/20 text-white placeholder:text-white/40 focus:border-[#FFFF00] rounded-full"
          />
        </div>
      </div>

      {/* 3. Tournaments Grid */}
      <SwipeableTabContainer
        activeTab={selectedTab}
        onTabChange={setSelectedTab}
        tabs={tabIds}
      >
      {filteredTournaments.length === 0 ? (
        <Card className="p-12 text-center bg-[#1818D4] border border-white/20 rounded-[32px] space-y-4 text-white">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-[#0A0A7A] border border-white/20 flex items-center justify-center text-[#FFFF00]">
            <Trophy className="h-8 w-8 text-[#FFFF00]" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white font-display uppercase tracking-wider">
              {searchQuery
                ? `No tournaments matching "${searchQuery}"`
                : selectedTab === 'all'
                ? 'No Tournament Registrations Yet'
                : `No ${selectedTab} tournaments found`}
            </h3>
            <p className="text-xs text-white/70 max-w-md mx-auto mt-1 leading-relaxed">
              {searchQuery
                ? 'Try adjusting your search query or switching tabs to view all tournaments.'
                : 'Join open competitive tournaments to test your skills and climb the official Kerala eFootball leaderboard!'}
            </p>
          </div>
          <Button asChild className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs rounded-full shadow-lg uppercase tracking-wider px-6 cursor-pointer">
            <Link href="/tournaments">
              <Compass className="h-4 w-4 mr-1.5" />
              Explore Open Tournaments
            </Link>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTournaments.map((t) => (
            <Card
              key={t.participantId}
              className="relative overflow-hidden bg-[#1818D4] border border-white/20 rounded-[28px] shadow-xl hover:border-[#FFFF00]/50 transition-all flex flex-col justify-between text-white group"
            >
              {/* Header Image with Gradient */}
              <div className="relative h-36 w-full bg-[#0A0A7A] overflow-hidden">
                <Image
                  src={t.bannerImage || '/images/banner1.webp'}
                  alt={t.tournamentName}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  loading="lazy"
                  className="object-cover group-hover:scale-105 transition-transform duration-500 opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1818D4] via-[#1818D4]/30 to-transparent" />
                
                {/* Top Badges */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                  <Badge className="bg-[#0A0A7A]/90 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-wider border border-white/20">
                    {t.format.replace(/_/g, ' ')}
                  </Badge>

                  {t.status === 'ongoing' ? (
                    <Badge className="bg-[#FF168B] text-white text-[10px] font-black uppercase tracking-wider border-none shadow-md animate-pulse">
                      ACTIVE
                    </Badge>
                  ) : t.status === 'registration' ? (
                    <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] font-black uppercase tracking-wider border-none shadow-md">
                      UPCOMING
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-[#0A0A7A]/80 text-white/90 text-[10px] font-black border-white/30 uppercase tracking-wider">
                      COMPLETED
                    </Badge>
                  )}
                </div>
              </div>

              {/* Content Body */}
              <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-black text-white font-display uppercase tracking-wide line-clamp-1 group-hover:text-[#FFFF00] transition-colors">
                      {t.tournamentName}
                    </h3>
                    {t.description && (
                      <p className="text-xs text-white/70 line-clamp-2 mt-1 leading-relaxed">
                        {t.description}
                      </p>
                    )}
                  </div>

                  {/* Participant Standing & Tournament Meta */}
                  <div className="p-3.5 rounded-2xl bg-[#0A0A7A] border border-white/10 space-y-2 text-xs">
                    {/* Participant Status Badge */}
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 font-semibold">Your Registration:</span>
                      {t.participantStatus === 'approved' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-[#00C853] uppercase tracking-wider">
                          <Check className="h-3 w-3" />
                          <span>Approved & Seeded</span>
                        </span>
                      ) : t.participantStatus === 'rejected' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-red-400 uppercase tracking-wider">
                          <XCircle className="h-3 w-3" />
                          <span>Rejected</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-[#FFFF00] uppercase tracking-wider">
                          <Clock className="h-3 w-3" />
                          <span>Awaiting Review</span>
                        </span>
                      )}
                    </div>

                    {t.groupName && (
                      <div className="flex items-center justify-between text-white/70 pt-1 border-t border-white/10">
                        <span className="flex items-center gap-1">
                          <Target className="h-3.5 w-3.5 text-[#FFFF00]" />
                          <span>Group:</span>
                        </span>
                        <span className="font-black text-white">{t.groupName}</span>
                      </div>
                    )}

                    {t.seedNumber && (
                      <div className="flex items-center justify-between text-white/70 pt-1 border-t border-white/10">
                        <span>Tournament Seed:</span>
                        <span className="font-black text-[#FFFF00]">#{t.seedNumber}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-white/70 pt-1 border-t border-white/10">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-white/50" />
                        <span>Registered On:</span>
                      </span>
                      <span className="font-medium text-white/90">
                        {new Date(t.registeredAt).toLocaleDateString()}
                      </span>
                    </div>

                    {t.startDate && (
                      <div className="flex items-center justify-between text-white/70 pt-1 border-t border-white/10">
                        <span>Starts:</span>
                        <span className="font-medium text-white/90">
                          {formatDate(t.startDate)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                  <Button asChild size="sm" className="bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] text-xs font-black rounded-full flex-1 uppercase tracking-wider h-9 cursor-pointer shadow-md">
                    <Link href={`/tournaments/${t.tournamentId}`}>
                      <span>Tournament Hub</span>
                      <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Link>
                  </Button>

                  {t.status === 'registration' && (
                    <Button
                      onClick={() => handleCancelRegistration(t.tournamentId, t.tournamentName)}
                      disabled={cancellingId === t.tournamentId}
                      variant="outline"
                      size="sm"
                      className="text-xs font-bold text-red-300 hover:bg-red-500/20 border-red-400/40 rounded-full h-9 px-3 cursor-pointer"
                      title="Withdraw registration before tournament starts"
                    >
                      {cancellingId === t.tournamentId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      </SwipeableTabContainer>
    </div>
  );
}
