'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Vote, BarChart3, Users, ArrowLeft, Loader2, RefreshCw, ChevronLeft, ChevronRight, Download, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAdminPredictionHistory, exportToCSV, PredictionHistoryRow } from '@/services/adminAnalyticsService';
import { getAllAdminMatches, MatchWithDetails } from '@/services/matchService';
import { formatDate } from '@/lib/utils';

export default function AdminPredictionHistoryPage() {
  const [rows, setRows] = useState<PredictionHistoryRow[]>([]);
  const [matches, setMatches] = useState<MatchWithDetails[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>('all');
  const [selectedResult, setSelectedResult] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [stats, setStats] = useState({
    totalPredictions: 0,
    correctCount: 0,
    wrongCount: 0,
    voidCount: 0,
    pendingCount: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);

  const loadPredictionHistory = async () => {
    setLoading(true);
    try {
      const [res, mList] = await Promise.all([
        getAdminPredictionHistory({ matchId: selectedMatchId, result: selectedResult, page, pageSize: 15 }),
        getAllAdminMatches(),
      ]);
      setRows(res.rows);
      setTotalPages(res.totalPages);
      setStats({
        totalPredictions: res.totalPredictions,
        correctCount: res.correctCount,
        wrongCount: res.wrongCount,
        voidCount: res.voidCount,
        pendingCount: res.pendingCount,
      });
      setMatches(mList);
    } catch (err) {
      console.error('Failed to load prediction history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPredictionHistory();
  }, [selectedMatchId, selectedResult, page]);

  const handleExportCSV = () => {
    if (rows.length === 0) return;
    const csvData = rows.map((r) => ({
      ID: r.id,
      User: r.userLabel,
      Match: `Match #${r.matchPosition}`,
      PredictedPlayer: r.predictedPlayerName,
      Time: formatDate(r.predictedAt),
      Result: r.result.toUpperCase(),
    }));
    exportToCSV('match_predictions_history', csvData);
  };

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
              Prediction History
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

          <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-bold gap-1.5">
            <Link href="/admin/matches/viewers">
              <Users className="h-3.5 w-3.5 text-emerald-600" />
              <span>Viewer History</span>
            </Link>
          </Button>

          <Button asChild variant="default" size="sm" className="bg-[#0B3323] text-white rounded-xl text-xs font-bold gap-1.5">
            <Link href="/admin/matches/predictions">
              <Vote className="h-3.5 w-3.5 text-emerald-400" />
              <span>Predictions History</span>
            </Link>
          </Button>

          <Button variant="outline" size="sm" onClick={handleExportCSV} className="rounded-xl text-xs font-bold gap-1">
            <Download className="h-3.5 w-3.5 text-emerald-700" />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Votes</span>
          <p className="text-xl font-black text-[#0B3323] font-mono">{stats.totalPredictions}</p>
        </Card>

        <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Correct</span>
          <p className="text-xl font-black text-emerald-600 font-mono">{stats.correctCount}</p>
        </Card>

        <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Wrong</span>
          <p className="text-xl font-black text-rose-600 font-mono">{stats.wrongCount}</p>
        </Card>

        <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Void</span>
          <p className="text-xl font-black text-amber-600 font-mono">{stats.voidCount}</p>
        </Card>

        <Card className="p-4 rounded-3xl border border-slate-200 bg-white shadow-xs space-y-1 col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending</span>
          <p className="text-xl font-black text-slate-600 font-mono">{stats.pendingCount}</p>
        </Card>
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
            <span className="text-xs font-black text-[#0B3323] uppercase tracking-wider">Result:</span>
            <select
              value={selectedResult}
              onChange={(e) => {
                setSelectedResult(e.target.value);
                setPage(1);
              }}
              className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl p-2 min-w-[140px]"
            >
              <option value="all">All Results</option>
              <option value="correct">Correct</option>
              <option value="wrong">Wrong</option>
              <option value="void">Void</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={loadPredictionHistory} className="rounded-xl text-xs font-bold gap-1">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </Button>
      </Card>

      {/* Predictions Data Table */}
      <Card className="rounded-3xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Vote className="h-8 w-8 text-slate-300 mx-auto" />
            <h3 className="text-sm font-black text-[#0B3323]">No predictions found</h3>
            <p className="text-xs text-slate-500">User predictions for live matches will appear here.</p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Match</th>
                  <th className="py-3 px-4">Predicted Winner</th>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4 font-bold text-[#0B3323]">{r.userLabel}</td>
                    <td className="py-3 px-4 font-extrabold font-mono text-emerald-800">Match #{r.matchPosition}</td>
                    <td className="py-3 px-4 font-extrabold text-[#0B3323]">{r.predictedPlayerName}</td>
                    <td className="py-3 px-4 text-slate-600 font-mono">{formatDate(r.predictedAt)}</td>
                    <td className="py-3 px-4">
                      {r.result === 'correct' && (
                        <Badge className="bg-emerald-600 text-white font-black text-[9px] uppercase gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Correct
                        </Badge>
                      )}
                      {r.result === 'wrong' && (
                        <Badge className="bg-rose-600 text-white font-black text-[9px] uppercase gap-1">
                          <XCircle className="h-3 w-3" /> Wrong
                        </Badge>
                      )}
                      {r.result === 'void' && (
                        <Badge className="bg-amber-500 text-slate-950 font-black text-[9px] uppercase gap-1">
                          <AlertCircle className="h-3 w-3" /> Void
                        </Badge>
                      )}
                      {r.result === 'pending' && (
                        <Badge variant="outline" className="text-slate-600 font-bold text-[9px] uppercase gap-1">
                          <Clock className="h-3 w-3 text-slate-400" /> Pending
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
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
