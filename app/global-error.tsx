'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global application error caught:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#08088F] text-white flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-[#1010C5] border border-white/20 rounded-[28px] p-8 text-center space-y-6 shadow-2xl">
          <div className="mx-auto h-16 w-16 rounded-full bg-[#FF168B]/15 border border-[#FF168B]/30 flex items-center justify-center text-[#FF168B]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black uppercase tracking-wider text-white">
              Something went wrong
            </h1>
            <p className="text-xs text-[#D9DCFF]/80 leading-relaxed">
              An unexpected error occurred. You can retry the current action or refresh the page.
            </p>
            {error?.digest && (
              <p className="text-[10px] font-mono text-white/40 pt-1">
                Digest: {error.digest}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => reset()}
              className="flex-1 bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] font-black rounded-full h-11 text-xs uppercase tracking-wider transition-all"
            >
              Try Again
            </button>
            <Link
              href="/"
              className="flex-1 border border-white/20 text-white hover:bg-white/10 font-bold rounded-full h-11 text-xs uppercase tracking-wider flex items-center justify-center transition-all"
            >
              Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
