'use client';

import React from 'react';
import { X, History, Clock, FileCheck, Layers } from 'lucide-react';
import type { KnockoutBracketLog } from '@/types/database';
import { formatDate } from '@/lib/utils';

interface AuditLogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  logs: KnockoutBracketLog[];
}

export function AuditLogDrawer({ isOpen, onClose, logs }: AuditLogDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 z-10">
        <div className="w-screen max-w-md bg-white border-l border-slate-200 shadow-2xl p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#0B3323]">Bracket Change Audit</h3>
                  <p className="text-xs text-slate-500 font-semibold">Admin actions history for this bracket</p>
                </div>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-[#0B3323] p-1.5 rounded-xl">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-[75vh] overflow-y-auto no-scrollbar pr-1">
              {logs.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl">
                  <Clock className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 font-bold">No bracket customization logs yet.</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black text-[#0B3323] uppercase tracking-wider flex items-center gap-1">
                        <FileCheck className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{log.action.replace('_', ' ')}</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{formatDate(log.created_at)}</span>
                    </div>

                    {log.details && (
                      <pre className="text-[10px] text-slate-600 bg-white p-2 rounded-xl border border-slate-200 overflow-x-auto font-mono">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
