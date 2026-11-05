'use client';

import React from 'react';
import Link from 'next/link';
import { ExternalLink, UploadCloud, RotateCcw, ShieldCheck, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface HomepageCmsHeaderProps {
  pendingDraftCount: number;
  onPublishAll: () => void;
  onOpenAuditHistory: () => void;
  isPublishing: boolean;
}

export function HomepageCmsHeader({
  pendingDraftCount,
  onPublishAll,
  onOpenAuditHistory,
  isPublishing,
}: HomepageCmsHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 bg-[#1414B8] border border-white/20 rounded-[28px] p-6 sm:p-8 shadow-2xl">
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge className="bg-[#FFFF00] text-[#08088F] font-black uppercase text-xs px-3 py-1 tracking-wider">
            Phase 1 CMS
          </Badge>
          <span className="text-xs text-[#D9DCFF] font-semibold flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Strict Admin Authorization Enforced
          </span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-black text-white uppercase font-display tracking-tight">
          Homepage Management
        </h1>
        <p className="text-xs sm:text-sm text-[#D9DCFF] max-w-2xl font-medium leading-relaxed">
          Control, configure, reorder, and publish public homepage sections in real-time. Changes can be saved as drafts or published instantly to live visitors.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="rounded-full border-white/20 bg-white/5 hover:bg-white/10 text-white font-black text-xs uppercase tracking-wider"
        >
          <Link href="/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
            <ExternalLink className="h-3.5 w-3.5 text-[#FFFF00]" />
            <span>Live Site</span>
          </Link>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onOpenAuditHistory}
          className="rounded-full border-white/20 bg-white/5 hover:bg-white/10 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2"
        >
          <History className="h-3.5 w-3.5 text-[#FFFF00]" />
          <span>Audit Log</span>
        </Button>

        <Button
          onClick={onPublishAll}
          disabled={pendingDraftCount === 0 || isPublishing}
          className={`rounded-full font-black text-xs uppercase tracking-wider px-5 shadow-lg flex items-center gap-2 transition-all ${
            pendingDraftCount > 0
              ? 'bg-[#FFFF00] hover:bg-yellow-300 text-[#08088F] hover:scale-105 active:scale-95'
              : 'bg-white/15 text-white/50 cursor-not-allowed'
          }`}
        >
          <UploadCloud className="h-4 w-4" />
          <span>
            {isPublishing
              ? 'Publishing...'
              : pendingDraftCount > 0
              ? `Publish All (${pendingDraftCount})`
              : 'All Changes Published'}
          </span>
        </Button>
      </div>
    </div>
  );
}
