'use client';

import React from 'react';
import { X, History, UserCheck, Clock, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { HomepageAuditHistory } from '@/types/database';

interface HomepageAuditHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: HomepageAuditHistory[];
  isLoading: boolean;
}

export function HomepageAuditHistoryModal({
  isOpen,
  onClose,
  history,
  isLoading,
}: HomepageAuditHistoryModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#08088F]/85 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-[#1414B8] rounded-[32px] border border-white/20 shadow-2xl p-6 sm:p-8 z-10 flex flex-col gap-5 animate-in zoom-in-95 duration-200 text-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-[#FFFF00]/15 text-[#FFFF00] flex items-center justify-center shrink-0">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black text-white uppercase font-display">
                Homepage Audit Trail
              </h3>
              <p className="text-xs text-[#D9DCFF]">
                Immutable historical log of all CMS configuration and publishing events.
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10 rounded-full"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content Area */}
        <div className="overflow-y-auto space-y-3 pr-1 flex-1">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-[#D9DCFF] animate-pulse">
              Loading audit logs...
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <History className="h-8 w-8 text-[#D9DCFF]/40 mx-auto" />
              <p className="text-sm text-[#D9DCFF]">No audit history recorded yet.</p>
            </div>
          ) : (
            history.map((entry) => {
              const formattedDate = new Date(entry.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-white/10 bg-[#0E0EB5] p-4 space-y-2.5 shadow-sm text-xs"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] font-black uppercase tracking-wider py-0 px-2">
                        {entry.action.replace('_', ' ')}
                      </Badge>
                      <span className="text-[#A6ACFF] font-semibold flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formattedDate}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[#D9DCFF] font-medium">
                      <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{entry.performed_by_email || 'Administrator'}</span>
                    </div>
                  </div>

                  {entry.changes && Object.keys(entry.changes).length > 0 && (
                    <div className="bg-[#08088F] rounded-xl p-2.5 font-mono text-[11px] text-[#FFFF00] overflow-x-auto max-h-32">
                      <pre>{JSON.stringify(entry.changes, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-white/10 flex justify-end shrink-0">
          <Button
            onClick={onClose}
            className="rounded-full bg-white/15 hover:bg-white/25 text-white font-black text-xs uppercase px-6"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
