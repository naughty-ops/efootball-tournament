'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Tv, Users, Activity, Clock, Vote, BarChart3, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAdminLiveAnalytics, LiveAnalyticsSummary } from '@/services/adminAnalyticsService';
import { getAllAdminMatches, MatchWithDetails } from '@/services/matchService';

export default function AdminLiveAnalyticsPage() {
  const [analytics, setAnalytics] = useState<LiveAnalyticsSummary | null>(null);
  const [matches, setMatches] = useState<MatchWithDetails[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [summary, mList] = await Promise.all([
        getAdminLiveAnalytics(selectedMatchId),
        getAllAdminMatches(),
      ]);
      setAnalytics(summary);
      setMatches(mList);
    } catch (err) {
      console.error('Failed to load live analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [selectedMatchId]);

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Sub-navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="gap-2 text-slate-500 hover:text-[#0B3323] -ml-2 mb-1">
            <Link href="/admin/matches">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Match Center</span>
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-[#0B3323] tracking-tight">
              Live Analytics Dashboard
            </h1>
            <Badge className="bg-[#0B3323] text-emerald-400 font-black text-[10px] uppercase">ADMIN</Badge>
          </div>
        </div>

        {/* Sub Nav Links */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button asChild variant="default" size="sm" className="bg-[#0B3323] text-white rounded-xl text-xs font-bold gap-1.5">
            <Link href="/admin/matches/analytics">
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Analytics</span>
            </Link>
          </Button>

          <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-bold gap-1.5">
            <Link href="/admin/matches/viewers">
              <Users className="h-3.5 w-3.5 text-emerald-600" />
              <span>Viewer History</span>
            </Link>
          </Button>

          <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-bold gap-1.5">
            <Link href="/admin/matches/predictions">
              <Vote className="h-3.5 w-3.5 text-teal-600" />
              <span>Predictions History</span>
            </Link>
          </Button>

          <Button variant="outline" size="sm" onClick={loadAnalytics} className="rounded-xl text-xs font-bold gap-1">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Filter Selector */}
      <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-xs flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Tv className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-black text-[#0B3323] uppercase tracking-wider">Filter Analytics:</span>
        </div>

        <select
          value={selectedMatchId}
          onChange={(e) => setSelectedMatchId(e.target.value)}
          className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl p-2 min-w-[200px]"
        >
          <option value="all">All Live & Past Matches</option>
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              Match #{m.match_position} ({m.status.toUpperCase()})
            </option>
          ))}
        </select>
      </Card>

      {/* Dashboard KPI Grid */}
      {loading || !analytics ? (
        <div className="flex items-center justify-center min-h-[250px]">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Current Viewers</span>
              <p className="text-2xl font-black text-[#0B3323] font-mono">{analytics.currentViewers}</p>
            </Card>

            <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Unique Viewers</span>
              <p className="text-2xl font-black text-emerald-700 font-mono">{analytics.uniqueViewers}</p>
            </Card>

            <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Peak Viewers</span>
              <p className="text-2xl font-black text-amber-600 font-mono">{analytics.peakViewers}</p>
            </Card>

            <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Avg Watch Time</span>
              <p className="text-2xl font-black text-teal-700 font-mono">{analytics.avgWatchTimeMinutes}m</p>
            </Card>

            <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Watch Time</span>
              <p className="text-2xl font-black text-[#0B3323] font-mono">{analytics.totalWatchTimeHours}h</p>
            </Card>

            <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Predictions</span>
              <p className="text-2xl font-black text-purple-700 font-mono">{analytics.totalPredictions}</p>
            </Card>
          </div>

          {/* Prediction Distribution Banner */}
          <Card className="p-6 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-[#0B3323] uppercase tracking-wider flex items-center gap-2">
                <Vote className="h-4 w-4 text-emerald-600" />
                <span>Prediction Distribution</span>
              </h3>
              <span className="text-xs font-extrabold text-slate-500 font-mono">{analytics.totalPredictions} Total Votes</span>
            </div>

            <div className="space-y-2 pt-2">
              <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden flex">
                <div
                  className="bg-emerald-600 h-full transition-all duration-500"
                  style={{ width: `${analytics.predictionDistribution.playerA}%` }}
                />
                <div
                  className="bg-teal-700 h-full transition-all duration-500"
                  style={{ width: `${analytics.predictionDistribution.playerB}%` }}
                />
              </div>

              <div className="flex justify-between text-xs font-mono font-bold text-slate-600">
                <span>Player A ({analytics.predictionDistribution.playerA}%)</span>
                <span>Player B ({analytics.predictionDistribution.playerB}%)</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
