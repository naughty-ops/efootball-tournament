'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function AuthResetPasswordPage() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      window.location.replace(`/reset-password${search}${hash}`);
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08088F] p-4 text-white">
      <div className="text-center space-y-3 bg-[#1818D4] border border-white/20 p-8 rounded-[32px] shadow-2xl max-w-sm w-full">
        <Loader2 className="h-10 w-10 animate-spin text-[#FFFF00] mx-auto" />
        <h3 className="text-base font-black font-display uppercase tracking-wider text-white">
          Redirecting to Password Reset
        </h3>
        <p className="text-xs text-white/70">
          Transferring session to canonical reset portal...
        </p>
      </div>
    </div>
  );
}
