'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Swords,
  Phone,
  Copy,
  Check,
  ExternalLink,
  Laptop,
  AlertCircle,
  Activity,
  Flame,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import {
  getAdminAliveMembersDirectory,
  getAliveMembersCounts,
  type AdminMemberPresenceItem,
  type MemberPresenceCounts,
  type MemberPresenceStatus,
} from '@/services/memberPresenceService';

interface AdminAliveMembersDeskProps {
  initialMembers?: AdminMemberPresenceItem[];
  initialCounts?: MemberPresenceCounts;
}

export default function AdminAliveMembersDesk({
  initialMembers = [],
  initialCounts = {
    total_alive: 0,
    total_idle: 0,
    total_offline: 0,
    total_members: 0,
  },
}: AdminAliveMembersDeskProps) {
  const [members, setMembers] = useState<AdminMemberPresenceItem[]>(initialMembers);
  const [counts, setCounts] = useState<MemberPresenceCounts>(initialCounts);
  const [filterTab, setFilterTab] = useState<'all' | 'alive' | 'idle' | 'offline'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const fetchLiveDirectory = useCallback(async () => {
    const [dirRes, countsRes] = await Promise.all([
      getAdminAliveMembersDirectory(),
      getAliveMembersCounts(),
    ]);

    if (!isMountedRef.current) return;

    if (dirRes.success) {
      setMembers(dirRes.members);
    }
    if (countsRes.success) {
      setCounts(countsRes.counts);
    }
  }, []);

  const handleManualSync = async () => {
    setIsRefreshing(true);
    await fetchLiveDirectory();
    setIsRefreshing(false);
  };

  useEffect(() => {
    isMountedRef.current = true;

    // Realtime channel listener with unique ID to prevent React 19 remount collision
    const supabase = createClient();
    const channelId = `admin-alive-tracker-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'member_presence',
        },
        () => {
          fetchLiveDirectory();
        }
      )
      .subscribe();

    // 25s background polling to reconcile stale server heartbeats
    const interval = setInterval(() => {
      fetchLiveDirectory();
    }, 25000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchLiveDirectory]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      if (filterTab !== 'all' && member.status !== filterTab) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = member.display_name.toLowerCase().includes(q);
        const matchesEmail = member.email?.toLowerCase().includes(q) || false;
        const matchesEfId = member.efootball_id.toLowerCase().includes(q);
        const matchesActivity = member.current_activity.toLowerCase().includes(q);
        return matchesName || matchesEmail || matchesEfId || matchesActivity;
      }
      return true;
    });
  }, [members, filterTab, searchQuery]);

  const formatRelativeTime = (timestamp: string, status: MemberPresenceStatus) => {
    if (status === 'alive') return 'Active now';
    if (!timestamp) return 'Never';

    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${diffDays}d ago`;
  };

  const getStatusBadge = (status: MemberPresenceStatus) => {
    switch (status) {
      case 'alive':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-500/20 border border-emerald-500/40 text-[#00E676] shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E676] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00E676]" />
            </span>
            <span>ALIVE</span>
          </span>
        );
      case 'idle':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-500/20 border border-amber-500/40 text-amber-400 shadow-sm">
            <span className="inline-flex rounded-full h-2 w-2 bg-amber-400" />
            <span>IDLE</span>
          </span>
        );
      case 'offline':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/10 border border-white/20 text-white/50">
            <span className="inline-flex rounded-full h-2 w-2 bg-white/30" />
            <span>OFFLINE</span>
          </span>
        );
    }
  };

  return (
    <Card className="bg-[#1818D4] border border-white/20 rounded-[32px] shadow-2xl text-white overflow-hidden">
      {/* 1. Header with Live Status & Controls */}
      <CardHeader className="p-5 sm:p-7 border-b border-white/15 bg-gradient-to-r from-[#0E0EA5] via-[#1212B8] to-[#0A0A7A]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <Badge className="bg-[#0A0A7A] text-[#FFFF00] border border-white/20 gap-1.5 py-1 px-3 rounded-full text-xs font-black uppercase tracking-wider">
                <Activity className="h-3.5 w-3.5 text-[#00E676] animate-pulse" />
                <span>Real-Time Presence Engine</span>
              </Badge>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-xs font-black text-[#00E676] shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E676] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00E676]" />
                </span>
                <span>{counts.total_alive} ONLINE NOW</span>
              </span>
            </div>

            <CardTitle className="text-xl sm:text-2xl font-black text-white font-display uppercase tracking-wider mt-2">
              Alive Members Operations Desk
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-white/70 mt-1">
              Live server-authoritative presence tracking: active connections, backgrounded idle states, and real-time competition duel activities.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2.5 self-start lg:self-auto shrink-0">
            <Button
              onClick={handleManualSync}
              disabled={isRefreshing}
              variant="outline"
              size="sm"
              className="rounded-xl border-white/25 text-white hover:bg-white/10 text-xs font-bold gap-1.5 cursor-pointer h-9 px-4"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-[#FFFF00]' : ''}`} />
              <span>Sync Presence</span>
            </Button>
          </div>
        </div>

        {/* 2. Top Presence Summary Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 mt-5 border-t border-white/10">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 block">
              Active Alive
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="h-2 w-2 rounded-full bg-[#00E676] animate-pulse" />
              <span className="text-xl font-black font-display text-[#00E676]">
                {counts.total_alive}
              </span>
            </div>
            <span className="text-[10px] text-white/40 block mt-0.5">Heartbeat ≤ 45s</span>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 block">
              Idle / Away
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-xl font-black font-display text-amber-400">
                {counts.total_idle}
              </span>
            </div>
            <span className="text-[10px] text-white/40 block mt-0.5">Hidden tab or inactive</span>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 block">
              Offline
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="h-2 w-2 rounded-full bg-white/30" />
              <span className="text-xl font-black font-display text-white/70">
                {counts.total_offline}
              </span>
            </div>
            <span className="text-[10px] text-white/40 block mt-0.5">Disconnected / expired</span>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 block">
              Total Community
            </span>
            <div className="flex items-center gap-2 mt-1">
              <Users className="h-4 w-4 text-[#FFFF00]" />
              <span className="text-xl font-black font-display text-[#FFFF00]">
                {counts.total_members}
              </span>
            </div>
            <span className="text-[10px] text-white/40 block mt-0.5">Registered accounts</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 sm:p-7 space-y-5">
        {/* 3. Filter Tabs & Search Controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Segmented Filter Buttons */}
          <div className="flex items-center gap-1.5 p-1 bg-[#0A0A7A] border border-white/15 rounded-xl overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                filterTab === 'all'
                  ? 'bg-[#FFFF00] text-[#08088F] shadow-sm font-black'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              All ({counts.total_members})
            </button>
            <button
              onClick={() => setFilterTab('alive')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                filterTab === 'alive'
                  ? 'bg-[#00E676] text-[#08088F] shadow-sm'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#00E676]" />
              <span>Alive ({counts.total_alive})</span>
            </button>
            <button
              onClick={() => setFilterTab('idle')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                filterTab === 'idle'
                  ? 'bg-amber-400 text-[#08088F] shadow-sm'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span>Idle ({counts.total_idle})</span>
            </button>
            <button
              onClick={() => setFilterTab('offline')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                filterTab === 'offline'
                  ? 'bg-white/20 text-white shadow-sm'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
              <span>Offline ({counts.total_offline})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search athlete, email, eFootball ID..."
              className="pl-9 h-9 text-xs bg-[#0A0A7A] border-white/20 text-white rounded-xl placeholder:text-white/40 focus:border-[#FFFF00]"
            />
          </div>
        </div>

        {/* 4. Alive Members Detailed Table */}
        <div className="rounded-2xl border border-white/15 overflow-x-auto bg-[#0A0A7A]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/15 bg-white/5 text-white/60 font-black uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4">Athlete / Member</th>
                <th className="py-3.5 px-4">eFootball ID</th>
                <th className="py-3.5 px-4">Status & Tabs</th>
                <th className="py-3.5 px-4">Current Activity</th>
                <th className="py-3.5 px-4">Last Active</th>
                <th className="py-3.5 px-4 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-white/50">
                    <Users className="h-8 w-8 mx-auto text-white/20 mb-2" />
                    <p className="font-bold">No members match your current filter</p>
                    <p className="text-[11px] text-white/40">Try switching tabs or adjusting search query</p>
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => {
                  return (
                    <tr
                      key={member.user_id}
                      className={`hover:bg-white/5 transition-colors ${
                        member.status === 'alive'
                          ? 'bg-emerald-950/20'
                          : member.status === 'idle'
                          ? 'bg-amber-950/15'
                          : ''
                      }`}
                    >
                      {/* Column 1: Athlete / Member Details */}
                      <td className="py-3.5 px-4 min-w-[200px]">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <div className="h-9 w-9 rounded-xl bg-[#1818D4] border border-white/20 flex items-center justify-center font-black text-xs text-[#FFFF00]">
                              {member.display_name[0]?.toUpperCase() || 'P'}
                            </div>
                            <span className="absolute -bottom-0.5 -right-0.5">
                              {member.status === 'alive' ? (
                                <span className="h-2 w-2 rounded-full bg-[#00E676] block border border-[#0A0A7A]" />
                              ) : member.status === 'idle' ? (
                                <span className="h-2 w-2 rounded-full bg-amber-400 block border border-[#0A0A7A]" />
                              ) : (
                                <span className="h-2 w-2 rounded-full bg-white/30 block border border-[#0A0A7A]" />
                              )}
                            </span>
                          </div>

                          <div className="min-w-0">
                            <span className="font-bold text-white block truncate text-xs sm:text-sm">
                              {member.display_name}
                            </span>
                            <span className="text-[11px] text-white/50 block truncate font-mono">
                              {member.email || 'No Email'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: eFootball ID */}
                      <td className="py-3.5 px-4 min-w-[150px]">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-[#FFFF00]">
                              {member.efootball_id}
                            </span>
                            {member.efootball_id !== 'Not Provided' && (
                              <button
                                onClick={() => handleCopy(member.efootball_id, `ef-${member.user_id}`)}
                                className="text-white/40 hover:text-white"
                                title="Copy eFootball ID"
                              >
                                {copiedId === `ef-${member.user_id}` ? (
                                  <Check className="h-3 w-3 text-[#00E676]" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            )}
                          </div>
                          {member.efootball_id_verified ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#00E676] uppercase">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Verified</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400/80 uppercase">
                              <Clock className="h-3 w-3" />
                              <span>Unverified</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 3: Status & Tabs */}
                      <td className="py-3.5 px-4 min-w-[120px]">
                        <div className="space-y-1">
                          {getStatusBadge(member.status)}
                          {member.tab_count > 0 && member.status !== 'offline' && (
                            <span className="flex items-center gap-1 text-[10px] text-white/50 font-mono block">
                              <Laptop className="h-2.5 w-2.5" />
                              <span>{member.tab_count} {member.tab_count === 1 ? 'tab' : 'tabs'}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 4: Current Activity */}
                      <td className="py-3.5 px-4 min-w-[180px]">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-[11px] font-medium text-white/90">
                          {member.current_activity.includes('Matchmaking') ? (
                            <Flame className="h-3.5 w-3.5 text-[#FF168B] shrink-0 animate-pulse" />
                          ) : member.current_activity.includes('Duel') || member.current_activity.includes('Playing') ? (
                            <Swords className="h-3.5 w-3.5 text-[#FFFF00] shrink-0" />
                          ) : (
                            <Activity className="h-3.5 w-3.5 text-[#00E676] shrink-0" />
                          )}
                          <span className="truncate max-w-[170px]" title={member.current_activity}>
                            {member.current_activity}
                          </span>
                        </div>
                      </td>

                      {/* Column 5: Last Seen / Active */}
                      <td className="py-3.5 px-4 min-w-[110px]">
                        <span className="text-white/80 font-mono block text-xs">
                          {formatRelativeTime(member.last_seen_at, member.status)}
                        </span>
                        <span className="text-[10px] text-white/40 block">
                          Heartbeat: {member.last_heartbeat_at ? new Date(member.last_heartbeat_at).toLocaleTimeString() : 'N/A'}
                        </span>
                      </td>

                      {/* Column 6: Admin Actions */}
                      <td className="py-3.5 px-4 text-right min-w-[120px]">
                        <div className="flex items-center justify-end gap-1.5">
                          {member.whatsapp_number && (
                            <a
                              href={`https://wa.me/${member.whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent(
                                `Hello ${member.display_name}, message from eFootball Tournament Platform Operations.`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-[#00E676] border border-emerald-500/30 transition-colors"
                              title={`Contact on WhatsApp: ${member.whatsapp_number}`}
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => handleCopy(member.user_id, `uid-${member.user_id}`)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/15 transition-colors"
                            title="Copy User ID"
                          >
                            {copiedId === `uid-${member.user_id}` ? (
                              <Check className="h-3.5 w-3.5 text-[#00E676]" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
