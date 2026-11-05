'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export default function LivePlayerSkeleton() {
  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/90 border border-white/10 shadow-inner flex flex-col items-center justify-center gap-2.5 p-6 text-center select-none">
      <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00]" />
      <span className="text-xs font-black font-display uppercase tracking-widest text-[#D9DCFF]">
        Initializing Player...
      </span>
    </div>
  );
}
