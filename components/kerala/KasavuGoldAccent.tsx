'use client';

import React from 'react';

interface KasavuGoldAccentProps {
  className?: string;
  variant?: 'line' | 'border-top' | 'card-edge';
}

export default function KasavuGoldAccent({
  className = '',
  variant = 'line',
}: KasavuGoldAccentProps) {
  if (variant === 'border-top') {
    return (
      <div className={`h-1 w-full bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent opacity-80 ${className}`} />
    );
  }

  if (variant === 'card-edge') {
    return (
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#0B3323] via-[#D4AF37] to-[#00C853] rounded-t-xl ${className}`} />
    );
  }

  return (
    <div className={`flex items-center justify-center gap-2 py-1 opacity-90 ${className}`}>
      <span className="h-[1px] w-12 bg-gradient-to-r from-transparent to-[#D4AF37]" />
      <span className="h-1.5 w-1.5 rotate-45 bg-[#D4AF37]" />
      <span className="h-[1px] w-12 bg-gradient-to-l from-transparent to-[#D4AF37]" />
    </div>
  );
}
