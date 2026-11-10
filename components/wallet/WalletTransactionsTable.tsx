'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  Trophy,
  Coins,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { WalletTransactionItem } from '@/types/wallet';
import { formatDate } from '@/lib/utils';

interface WalletTransactionsTableProps {
  initialTransactions: WalletTransactionItem[];
}

export default function WalletTransactionsTable({ initialTransactions }: WalletTransactionsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTx, setSelectedTx] = useState<WalletTransactionItem | null>(null);

  const pageSize = 8;

  // Filter in memory for instantaneous, latency-free feedback
  const filtered = useMemo(() => {
    const now = Date.now();
    const oneDayMs = 24 * 3600 * 1000;

    return initialTransactions.filter((tx) => {
      const matchesSearch =
        !searchTerm.trim() ||
        tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.transactionRef.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.tournamentName && tx.tournamentName.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesType = selectedType === 'all' || tx.transactionType === selectedType;
      const matchesStatus = selectedStatus === 'all' || tx.status === selectedStatus;

      let matchesDate = true;
      if (selectedDate !== 'all') {
        const txTime = new Date(tx.createdAt).getTime();
        const diffMs = now - txTime;
        if (selectedDate === 'today') {
          matchesDate = diffMs <= oneDayMs;
        } else if (selectedDate === 'week') {
          matchesDate = diffMs <= 7 * oneDayMs;
        } else if (selectedDate === 'month') {
          matchesDate = diffMs <= 30 * oneDayMs;
        }
      }

      return matchesSearch && matchesType && matchesStatus && matchesDate;
    });
  }, [initialTransactions, searchTerm, selectedType, selectedStatus, selectedDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px] font-black uppercase">
            Completed
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px] font-black uppercase">
            Pending
          </Badge>
        );
      case 'failed':
      case 'cancelled':
        return (
          <Badge className="bg-red-500/15 text-red-300 border-red-500/30 text-[10px] font-black uppercase">
            {status}
          </Badge>
        );
      default:
        return (
          <Badge className="bg-white/10 text-white/70 border-white/20 text-[10px] font-black uppercase">
            {status}
          </Badge>
        );
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'TOURNAMENT_PRIZE':
        return (
          <div className="h-8 w-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Trophy className="h-4 w-4" />
          </div>
        );
      case 'PAYOUT_COMPLETED':
        return (
          <div className="h-8 w-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <ArrowUpRight className="h-4 w-4" />
          </div>
        );
      case 'BONUS_REWARD':
        return (
          <div className="h-8 w-8 rounded-xl bg-[#FFFF00]/15 border border-[#FFFF00]/30 flex items-center justify-center text-[#FFFF00] shrink-0">
            <Coins className="h-4 w-4" />
          </div>
        );
      default:
        return (
          <div className="h-8 w-8 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
        );
    }
  };

  return (
    <>
      <Card className="bg-[#0A0A7A] border border-white/20 rounded-2xl shadow-xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 border-b border-white/10 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#FFFF00]" />
                <span>Financial Transaction History</span>
              </CardTitle>
              <p className="text-xs text-white/60 mt-0.5">Authoritative immutable financial ledger records</p>
            </div>
            <div className="text-xs font-bold text-white/70">
              Showing <span className="text-[#FFFF00] font-black">{filtered.length}</span> recorded transactions
            </div>
          </div>

          {/* Search & Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
              <Input
                placeholder="Search reference or tournament..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 h-9 text-xs bg-black/30 border-white/15 text-white rounded-xl placeholder:text-white/40 focus:border-[#FFFF00]"
              />
            </div>

            {/* Date Filter */}
            <select
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 px-3 text-xs bg-[#07074E] border border-white/15 text-white rounded-xl focus:border-[#FFFF00] outline-none"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
            </select>

            {/* Type Filter */}
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 px-3 text-xs bg-[#07074E] border border-white/15 text-white rounded-xl focus:border-[#FFFF00] outline-none"
            >
              <option value="all">All Transaction Types</option>
              <option value="TOURNAMENT_PRIZE">Tournament Prize</option>
              <option value="PAYOUT_COMPLETED">Payout Completed</option>
              <option value="BONUS_REWARD">Bonus Reward</option>
              <option value="ADMIN_ADJUSTMENT">Admin Adjustment</option>
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 px-3 text-xs bg-[#07074E] border border-white/15 text-white rounded-xl focus:border-[#FFFF00] outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {paginated.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <FileText className="h-10 w-10 text-white/30 mx-auto mb-2" />
              <p className="text-sm font-bold text-white/70">No transactions matching your criteria.</p>
              <p className="text-xs text-white/40 mt-1">Try adjusting your search terms or filters.</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View (hidden on mobile) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5 text-white/60 font-black uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">Transaction ID</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4">Tournament</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {paginated.map((tx) => (
                      <tr
                        key={tx.id}
                        onClick={() => setSelectedTx(tx)}
                        className="hover:bg-white/5 cursor-pointer transition-colors group"
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-[#FFFF00]">
                          <div className="flex items-center gap-1.5">
                            <span>{tx.transactionRef}</span>
                            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 text-white/50 transition-opacity" />
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-white font-medium">
                          <div className="flex items-center gap-2.5">
                            {getTypeIcon(tx.transactionType)}
                            <span className="truncate max-w-xs">{tx.description}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-white/80 font-bold truncate max-w-[150px]">
                          {tx.tournamentName || '—'}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-black text-sm font-display ${
                            tx.transactionType === 'PAYOUT_COMPLETED' ? 'text-blue-300' : 'text-emerald-400'
                          }`}
                        >
                          {tx.transactionType === 'PAYOUT_COMPLETED' ? '-' : '+'}₹
                          {tx.amountInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-white/60 whitespace-nowrap">
                          {formatDate(tx.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 text-center">{getStatusBadge(tx.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Layout (visible on mobile only) */}
              <div className="md:hidden divide-y divide-white/10">
                {paginated.map((tx) => (
                  <div
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className="p-4 hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        {getTypeIcon(tx.transactionType)}
                        <div className="min-w-0">
                          <div className="text-xs font-black text-white truncate">{tx.description}</div>
                          <div className="text-[10px] font-mono text-[#FFFF00] mt-0.5">{tx.transactionRef}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className={`text-sm font-black font-display ${
                            tx.transactionType === 'PAYOUT_COMPLETED' ? 'text-blue-300' : 'text-emerald-400'
                          }`}
                        >
                          {tx.transactionType === 'PAYOUT_COMPLETED' ? '-' : '+'}₹
                          {tx.amountInr.toLocaleString('en-IN')}
                        </div>
                        <div className="mt-1">{getStatusBadge(tx.status)}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-white/50 mt-2.5 pt-2 border-t border-white/5">
                      <span>{tx.tournamentName || 'Platform Award'}</span>
                      <span>{formatDate(tx.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="p-4 border-t border-white/10 flex items-center justify-between gap-2">
                  <span className="text-xs text-white/60">
                    Page <span className="text-white font-bold">{currentPage}</span> of{' '}
                    <span className="text-white font-bold">{totalPages}</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="h-8 px-2.5 text-xs bg-white/5 border-white/20 text-white hover:bg-white/10 disabled:opacity-30"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                      Prev
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="h-8 px-2.5 text-xs bg-white/5 border-white/20 text-white hover:bg-white/10 disabled:opacity-30"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detailed Transaction View Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-[#080854] border border-white/20 shadow-2xl p-5 text-white relative">
            <button
              onClick={() => setSelectedTx(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/10">
              {getTypeIcon(selectedTx.transactionType)}
              <div>
                <h3 className="text-base font-black text-white">Transaction Intelligence</h3>
                <span className="font-mono text-xs text-[#FFFF00]">{selectedTx.transactionRef}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-white/60">Description</span>
                <span className="font-bold text-white text-right max-w-[220px]">{selectedTx.description}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-white/60">Amount</span>
                <span className="font-black text-sm text-emerald-400 font-display">
                  ₹{selectedTx.amountInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-white/60">Type</span>
                <span className="font-bold text-white">{selectedTx.transactionType}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-white/60">Status</span>
                <span>{getStatusBadge(selectedTx.status)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-white/60">Tournament</span>
                <span className="font-bold text-white">{selectedTx.tournamentName || 'Platform Direct'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-white/60">Recorded Timestamp</span>
                <span className="font-mono text-white/80">{new Date(selectedTx.createdAt).toLocaleString('en-IN')}</span>
              </div>
              {selectedTx.idempotencyKey && (
                <div className="flex justify-between py-1.5">
                  <span className="text-white/60">Ledger Key</span>
                  <span className="font-mono text-[10px] text-white/40">{selectedTx.idempotencyKey}</span>
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-white/10 flex justify-end">
              <Button
                size="sm"
                onClick={() => setSelectedTx(null)}
                className="h-8 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold"
              >
                Close View
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
