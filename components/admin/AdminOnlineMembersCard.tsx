'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Users, Radio } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { getAliveMembersCounts, type MemberPresenceCounts } from '@/services/memberPresenceService';

interface AdminOnlineMembersCardProps {
  initialCounts?: MemberPresenceCounts;
}

export default function AdminOnlineMembersCard({
  initialCounts = {
    total_alive: 0,
    total_idle: 0,
    total_offline: 0,
    total_members: 0,
  },
}: AdminOnlineMembersCardProps) {
  const [counts, setCounts] = useState<MemberPresenceCounts>(initialCounts);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const fetchCounts = async () => {
      const res = await getAliveMembersCounts();
      if (res.success && isMountedRef.current) {
        setCounts(res.counts);
      }
    };

    const supabase = createClient();
    const channelId = `admin-online-card-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
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
          fetchCounts();
        }
      )
      .subscribe();

    const interval = setInterval(fetchCounts, 20000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] shadow-lg text-white">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-black uppercase tracking-wider text-white/70">
          Online Members
        </CardTitle>
        <div className="relative flex items-center justify-center">
          <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-[#00E676] opacity-75" />
          <Users className="h-5 w-5 text-[#00E676] relative z-10" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2.5">
          <div className="text-3xl font-black text-[#00E676] font-display">
            {counts.total_alive}
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#00E676] bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            Online
          </span>
        </div>
        <p className="text-[11px] text-white/60 mt-1">
          Currently active & connected
        </p>
      </CardContent>
    </Card>
  );
}
