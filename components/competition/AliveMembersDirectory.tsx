'use client';

import React, { useState, useMemo } from 'react';
import { Users, Search, RefreshCw, Circle, Radio, Swords, Gamepad2, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAliveMembersDirectory } from '@/hooks/useAliveMembersDirectory';
import type { MemberPresenceItem, MemberPresenceStatus } from '@/services/memberPresenceService';

interface AliveMembersDirectoryProps {
  currentUserId?: string;
  className?: string;
}

export default function AliveMembersDirectory({
  currentUserId,
  className = '',
}: AliveMembersDirectoryProps) {
  const { members, counts, loading, error, refresh } = useAliveMembersDirectory();
  const [filterTab, setFilterTab] = useState<'all' | 'alive' | 'idle' | 'offline'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      // Status filter
      if (filterTab !== 'all' && member.status !== filterTab) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = member.display_name.toLowerCase().includes(q);
        const matchesEfId = member.efootball_id.toLowerCase().includes(q);
        const matchesActivity = member.current_activity.toLowerCase().includes(q);
        return matchesName || matchesEfId || matchesActivity;
      }
      return true;
    });
  }, [members, filterTab, searchQuery]);

  const formatRelativeTime = (timestamp: string, status: MemberPresenceStatus) => {
    if (status === 'alive') return 'Active now';
    if (!timestamp) return 'Offline';

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

  const getStatusDot = (status: MemberPresenceStatus) => {
    switch (status) {
      case 'alive':
        return (
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E676] opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00E676]" />
          </span>
        );
      case 'idle':
        return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />;
      case 'offline':
      default:
        return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-white/30" />;
    }
  };

  const getStatusBadge = (status: MemberPresenceStatus) => {
    switch (status) {
      case 'alive':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/35 text-[#00E676]">
            {getStatusDot('alive')}
            <span>ALIVE</span>
          </span>
        );
      case 'idle':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/15 border border-amber-500/35 text-amber-400">
            {getStatusDot('idle')}
            <span>IDLE</span>
          </span>
        );
      case 'offline':
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/40">
            {getStatusDot('offline')}
            <span>OFFLINE</span>
          </span>
        );
    }
  };

  return (
    <Card
      id="alive-members-directory"
      className={`rounded-[28px] bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-white/15 p-5 sm:p-7 text-white shadow-2xl space-y-6 relative overflow-hidden ${className}`}
    >
      {/* Stadium radial lighting */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-[#1E1EF5]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#00E676]/10 rounded-full blur-3xl pointer-events-none" />

      {/* 1. Header with Live Count Badge */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-lg sm:text-xl font-black font-display uppercase tracking-wider text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-[#FFFF00]" />
              <span>Alive Members</span>
            </h3>
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-xs font-black text-[#00E676] shadow-md shadow-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E676] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00E676]" />
              </span>
              <span>{counts.total_alive} ONLINE NOW</span>
            </span>
          </div>
          <p className="text-xs text-white/60 mt-1">
            Real-time active community members ready for head-to-head 1v1 challenges and tournaments.
          </p>
        </div>

        <Button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
          className="rounded-xl border-white/20 text-white hover:bg-white/10 text-xs font-bold gap-1.5 cursor-pointer self-start sm:self-auto shrink-0 h-9"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-[#FFFF00]' : ''}`} />
          <span>Sync</span>
        </Button>
      </div>

      {/* 2. Controls: Filter Tabs & Search Bar */}
      <div className="relative z-10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[#05053B] border border-white/15 rounded-xl overflow-x-auto no-scrollbar">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
              filterTab === 'all'
                ? 'bg-[#1E1EF5] text-white shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            All ({counts.total_members})
          </button>
          <button
            onClick={() => setFilterTab('alive')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
              filterTab === 'alive'
                ? 'bg-[#00E676] text-[#08088F] shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#00E676]" />
            <span>Alive ({counts.total_alive})</span>
          </button>
          <button
            onClick={() => setFilterTab('idle')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
              filterTab === 'idle'
                ? 'bg-amber-400 text-[#08088F] shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span>Idle ({counts.total_idle})</span>
          </button>
          <button
            onClick={() => setFilterTab('offline')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
              filterTab === 'offline'
                ? 'bg-white/20 text-white shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
            <span>Offline ({counts.total_offline})</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search athlete or ID..."
            className="pl-9 h-9 text-xs bg-white/5 border-white/15 text-white rounded-xl placeholder:text-white/40 focus:border-[#FFFF00]"
          />
        </div>
      </div>

      {/* 3. Member Cards Grid */}
      <div className="relative z-10">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-white/60">
            <RefreshCw className="h-6 w-6 animate-spin text-[#FFFF00]" />
            <span className="text-xs font-bold uppercase tracking-wider">Syncing alive members...</span>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="py-12 text-center rounded-2xl bg-white/5 border border-dashed border-white/10 space-y-2">
            <Users className="h-8 w-8 text-white/30 mx-auto" />
            <p className="text-sm font-bold text-white/70">No members match the selected filter</p>
            <p className="text-xs text-white/40">Try switching tabs or adjusting your search</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredMembers.map((member) => {
              const isCurrentUser = member.user_id === currentUserId;
              return (
                <div
                  key={member.user_id}
                  className={`p-3.5 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 border transition-all duration-200 flex flex-col justify-between gap-3 ${
                    member.status === 'alive'
                      ? 'border-[#00E676]/40 hover:border-[#00E676] shadow-lg shadow-emerald-950/20'
                      : member.status === 'idle'
                      ? 'border-amber-400/30 hover:border-amber-400/60'
                      : 'border-white/10 hover:border-white/20 opacity-70 hover:opacity-100'
                  }`}
                >
                  {/* Top: Avatar, Name & Status */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div className="h-10 w-10 rounded-xl bg-[#1E1EF5] border border-white/20 flex items-center justify-center font-black text-sm text-[#FFFF00]">
                          {member.display_name[0]?.toUpperCase() || 'P'}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5">
                          {getStatusDot(member.status)}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-black text-white truncate block">
                            {member.display_name}
                          </span>
                          {isCurrentUser && (
                            <span className="text-[9px] font-black text-[#FFFF00] bg-[#FFFF00]/15 px-1.5 py-0.2 rounded">
                              YOU
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-white/50 block truncate">
                          {member.efootball_id}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {getStatusBadge(member.status)}
                    </div>
                  </div>

                  {/* Bottom: Current Activity & Last Seen */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-white/60">
                    <span className="truncate max-w-[140px] text-[10px] text-[#FFFF00]/90 font-medium">
                      {member.current_activity}
                    </span>
                    <span className="text-[10px] text-white/40 shrink-0 font-mono">
                      {formatRelativeTime(member.last_seen_at, member.status)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
