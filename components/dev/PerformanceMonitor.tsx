'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { navigationMonitor, type NavigationRecord } from '@/lib/performance/navigationMonitor';
import { networkMonitor, type NetworkStats } from '@/lib/performance/networkMonitor';
import { renderMonitor, type RenderStats } from '@/lib/performance/renderMonitor';
import { Activity, ChevronDown, ChevronUp, Database, Globe, Layers, Zap } from 'lucide-react';

export default function PerformanceMonitor() {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return <PerformanceMonitorInner />;
}

function PerformanceMonitorInner() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);

  // Monitors state
  const [lastNav, setLastNav] = useState<NavigationRecord | null>(null);
  const [avgNavMs, setAvgNavMs] = useState(0);
  const [navCount, setNavCount] = useState(0);

  const [netStats, setNetStats] = useState<NetworkStats>({
    totalRequests: 0,
    supabaseRequests: 0,
    failedRequests: 0,
    slowestRequest: null,
    averageDurationMs: 0,
    duplicateCount: 0,
    recentRequests: [],
  });

  const [renStats, setRenStats] = useState<RenderStats>({
    longTaskCount: 0,
    longestTaskMs: 0,
    lastTaskDurationMs: 0,
    renderCount: 0,
  });

  // Query Client Stats
  const [queryStats, setQueryStats] = useState({
    active: 0,
    fetching: 0,
    total: 0,
  });

  // Route change tracker
  useEffect(() => {
    navigationMonitor.recordRouteTransition(pathname);
    renderMonitor.recordRender();
  }, [pathname]);

  // Subscriptions
  useEffect(() => {
    const unsubNav = navigationMonitor.subscribe((latest, all) => {
      setLastNav(latest);
      setAvgNavMs(navigationMonitor.getAverageDuration());
      setNavCount(all.length);
    });

    const unsubNet = networkMonitor.subscribe((stats) => {
      setNetStats(stats);
    });

    const unsubRen = renderMonitor.subscribe((stats) => {
      setRenStats(stats);
    });

    // Query stats polling
    const queryInterval = setInterval(() => {
      const cache = queryClient.getQueryCache().getAll();
      const fetching = queryClient.isFetching();
      setQueryStats({
        total: cache.length,
        active: cache.filter((q) => q.isActive()).length,
        fetching,
      });
    }, 1000);

    return () => {
      unsubNav();
      unsubNet();
      unsubRen();
      clearInterval(queryInterval);
    };
  }, [queryClient]);

  const getStatusColor = (ms: number) => {
    if (ms <= 150) return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/40';
    if (ms <= 500) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/40';
    return 'text-rose-400 bg-rose-500/20 border-rose-500/40';
  };

  const lastDuration = lastNav?.durationMs ?? 0;

  return (
    <div className="fixed bottom-3 right-3 z-[9999] font-mono text-xs select-none">
      {!isExpanded ? (
        /* Collapsed Floating Pill */
        <button
          onClick={() => setIsExpanded(true)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-2xl backdrop-blur-md transition-all active:scale-95 cursor-pointer ${
            lastDuration > 0
              ? getStatusColor(lastDuration)
              : 'bg-[#08088F]/90 text-white border-white/20'
          }`}
          title="Click to expand Dev Performance Monitor"
        >
          <Zap className="h-3.5 w-3.5 animate-pulse" />
          <span className="font-bold">
            {lastDuration > 0 ? `${lastDuration}ms` : 'Perf HUD'}
          </span>
          <span className="text-[10px] opacity-75">
            {pathname.length > 15 ? pathname.substring(0, 14) + '...' : pathname}
          </span>
          <ChevronUp className="h-3 w-3 opacity-60" />
        </button>
      ) : (
        /* Expanded HUD Panel */
        <div className="w-80 rounded-2xl bg-[#0B0B7C]/95 border border-white/25 shadow-2xl backdrop-blur-xl p-3.5 text-white space-y-3 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-1.5 text-[#FFFF00] font-black text-xs uppercase tracking-wider">
              <Zap className="h-4 w-4" />
              <span>Real-Time Perf HUD</span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Navigation Section */}
          <div className="space-y-1 bg-white/5 p-2 rounded-xl border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-[10px] uppercase font-bold flex items-center gap-1">
                <Globe className="h-3 w-3 text-[#FFFF00]" /> Nav Timing
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getStatusColor(
                  lastDuration
                )}`}
              >
                {lastDuration > 0 ? `${lastDuration} ms` : 'Idle'}
              </span>
            </div>
            <div className="text-[11px] truncate text-white/90">
              <span className="text-white/50">{lastNav?.from || 'start'}</span> →{' '}
              <span className="text-[#FFFF00] font-bold">{pathname}</span>
            </div>
            <div className="flex justify-between text-[10px] text-white/60 pt-0.5">
              <span>Avg: {avgNavMs} ms</span>
              <span>Transitions: {navCount}</span>
            </div>
          </div>

          {/* TanStack Query Section */}
          <div className="space-y-1 bg-white/5 p-2 rounded-xl border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-[10px] uppercase font-bold flex items-center gap-1">
                <Database className="h-3 w-3 text-cyan-400" /> Query Cache
              </span>
              {queryStats.fetching > 0 && (
                <span className="text-[9px] text-cyan-300 font-bold animate-pulse">
                  Fetching...
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1 text-center pt-1 text-[11px]">
              <div className="bg-white/5 p-1 rounded-lg">
                <div className="font-bold text-white">{queryStats.total}</div>
                <div className="text-[9px] text-white/50">Cached</div>
              </div>
              <div className="bg-white/5 p-1 rounded-lg">
                <div className="font-bold text-emerald-400">{queryStats.active}</div>
                <div className="text-[9px] text-white/50">Active</div>
              </div>
              <div className="bg-white/5 p-1 rounded-lg">
                <div className="font-bold text-yellow-400">{queryStats.fetching}</div>
                <div className="text-[9px] text-white/50">Fetching</div>
              </div>
            </div>
          </div>

          {/* Network & Supabase Section */}
          <div className="space-y-1 bg-white/5 p-2 rounded-xl border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-[10px] uppercase font-bold flex items-center gap-1">
                <Activity className="h-3 w-3 text-emerald-400" /> Network / Supabase
              </span>
              <span className="text-[10px] text-white/60">
                {netStats.totalRequests} reqs
              </span>
            </div>
            <div className="flex justify-between text-[10px] pt-0.5">
              <span>Supabase: {netStats.supabaseRequests}</span>
              <span>Avg: {netStats.averageDurationMs} ms</span>
              {netStats.duplicateCount > 0 && (
                <span className="text-rose-400 font-bold">
                  {netStats.duplicateCount} dup
                </span>
              )}
            </div>
            {netStats.slowestRequest && (
              <div className="text-[9px] text-white/50 truncate pt-0.5">
                Slowest: {netStats.slowestRequest.durationMs}ms ({netStats.slowestRequest.url})
              </div>
            )}
          </div>

          {/* React & Main-Thread Section */}
          <div className="space-y-1 bg-white/5 p-2 rounded-xl border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-[10px] uppercase font-bold flex items-center gap-1">
                <Layers className="h-3 w-3 text-purple-400" /> Main-Thread Tasks
              </span>
              <span
                className={`text-[10px] font-bold ${
                  renStats.longTaskCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {renStats.longTaskCount} long tasks
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-white/60 pt-0.5">
              <span>Renders: {renStats.renderCount}</span>
              <span>Max Task: {renStats.longestTaskMs} ms</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
