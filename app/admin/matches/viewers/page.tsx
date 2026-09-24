'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, BarChart3, Vote, ArrowLeft, Loader2, RefreshCw, ChevronLeft, ChevronRight, Monitor, Smartphone, Tablet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAdminViewerHistory, ViewerHistoryRow } from '@/services/adminAnalyticsService';
import { getAllAdminMatches, MatchWithDetails } from '@/services/matchService';
import { formatDate } from '@/lib/utils';

export default function AdminViewerHistoryPage() {
  const [rows, setRows] = useState<ViewerHistoryRow[]>([]);
  const [matches, setMatches] = useState<MatchWithDetails[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>('all');
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalSessions, setTotalSessions] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const loadViewerHistory = async () => {
    setLoading(true);
    try {
      const [res, mList] = await Promise.all([
        getAdminViewerHistory({ matchId: selectedMatchId, deviceType: selectedDevice, page, pageSize: 15 }),
        getAllAdminMatches(),
      ]);
      setRows(res.rows);
      setTotalPages(res.totalPages);
      setTotalSessions(res.totalSessions);
      setMatches(mList);
    } catch (err) {
      console.error('Failed to load viewer history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadViewerHistory();
  }, [selectedMatchId, selectedDevice, page]);

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
              Viewer History
            </h1>
            <Badge className="bg-[#0B3323] text-emerald-400 font-black text-[10px] uppercase">ADMIN ONLY</Badge>
          </div>
        </div>

        {/* Sub Nav Links */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-bold gap-1.5">
            <Link href="/admin/matches/analytics">
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Analytics</span>
            </Link>
          </Button>

          <Button asChild variant="default" size="sm" className="bg-[#0B3323] text-white rounded-xl text-xs font-bold gap-1.5">
            <Link href="/admin/matches/viewers">
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              <span>Viewer History</span>
            </Link>
          </Button>

          <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-bold gap-1.5">
            <Link href="/admin/matches/predictions">
              <Vote className="h-3.5 w-3.5 text-teal-600" />
              <span>Predictions History</span>
            </Link>
          </Button>

          <Button variant="outline" size="sm" onClick={loadViewerHistory} className="rounded-xl text-xs font-bold gap-1">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-xs flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-[#0B3323] uppercase tracking-wider">Match:</span>
            <select
              value={selectedMatchId}
              onChange={(e) => {
                setSelectedMatchId(e.target.value);
                setPage(1);
              }}
              className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl p-2 min-w-[180px]"
            >
              <option value="all">All Matches</option>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  Match #{m.match_position} ({m.status.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-[#0B3323] uppercase tracking-wider">Device:</span>
            <select
              value={selectedDevice}
              onChange={(e) => {
                setSelectedDevice(e.target.value);
                setPage(1);
              }}
              className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl p-2 min-w-[140px]"
            >
              <option value="all">All Devices</option>
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
              <option value="tablet">Tablet</option>
            </select>
          </div>
        </div>

        <span className="text-xs font-bold text-slate-500 font-mono">{totalSessions} Total Sessions</span>
      </Card>

      {/* Viewer History Data Table */}
      <Card className="rounded-3xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Users className="h-8 w-8 text-slate-300 mx-auto" />
            <h3 className="text-sm font-black text-[#0B3323]">No viewer history found</h3>
            <p className="text-xs text-slate-500">Viewer sessions will appear here as viewers join live streams.</p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-4">Viewer</th>
                  <th className="py-3 px-4">Match</th>
                  <th className="py-3 px-4">Joined At</th>
                  <th className="py-3 px-4">Left At</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Device</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const minutes = Math.floor(r.durationSeconds / 60);
                  const seconds = r.durationSeconds % 60;
                  const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

                  return (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-bold text-[#0B3323]">{r.userLabel}</td>
                      <td className="py-3 px-4 font-extrabold font-mono text-emerald-800">Match #{r.matchPosition}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono">{formatDate(r.joinedAt)}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono">{r.leftAt ? formatDate(r.leftAt) : 'Active / Unregistered'}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{durationStr}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-[9px] font-bold capitalize gap-1 bg-slate-50">
                          {r.deviceType === 'mobile' ? (
                            <Smartphone className="h-3 w-3 text-emerald-600" />
                          ) : r.deviceType === 'tablet' ? (
                            <Tablet className="h-3 w-3 text-teal-600" />
                          ) : (
                            <Monitor className="h-3 w-3 text-slate-600" />
                          )}
                          <span>{r.deviceType}</span>
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-500">
              Page {page} of {totalPages}
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 px-2 rounded-xl text-xs font-bold"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-8 px-2 rounded-xl text-xs font-bold"
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
