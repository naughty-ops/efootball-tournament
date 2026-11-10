'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error securely
    console.error('Player Dashboard Error Boundary caught:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#08088F] text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#1010C5] border border-white/20 rounded-[28px] p-6 sm:p-8 text-center space-y-5 shadow-2xl">
        <div className="mx-auto h-16 w-16 rounded-full bg-[#FF168B]/15 border border-[#FF168B]/30 flex items-center justify-center text-[#FF168B]">
          <AlertCircle className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-black font-display uppercase tracking-wider text-white">
            Dashboard Unavailable
          </h2>
          <p className="text-xs sm:text-sm text-[#D9DCFF]/80 leading-relaxed">
            We encountered a temporary issue while loading your competitor portal. Please refresh or return to the tournament lobby.
          </p>
          {error?.digest && (
            <p className="text-[10px] font-mono text-white/40 pt-1">
              Error Digest: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            onClick={() => reset()}
            className="flex-1 bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] font-black rounded-full h-11 text-xs uppercase tracking-wider gap-2 shadow-lg"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Try Again</span>
          </Button>

          <Button
            asChild
            variant="outline"
            className="flex-1 border-white/20 text-white hover:bg-white/10 font-bold rounded-full h-11 text-xs uppercase tracking-wider gap-2"
          >
            <Link href="/">
              <Home className="h-4 w-4" />
              <span>Lobby</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
