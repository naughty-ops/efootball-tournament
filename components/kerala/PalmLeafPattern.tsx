'use client';

import React from 'react';

interface PalmLeafPatternProps {
  className?: string;
  opacity?: number;
  color?: string;
}

export default function PalmLeafPattern({
  className = '',
  opacity = 0.04,
  color = 'currentColor',
}: PalmLeafPatternProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ opacity }}
    >
      <svg
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
      >
        <defs>
          <pattern
            id="kerala-palm-pattern"
            width="140"
            height="140"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(20)"
          >
            {/* Main Central Stem */}
            <path
              d="M 15 130 Q 70 70 125 15"
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            {/* Palm Leaf Fronds Left */}
            <path d="M 35 110 Q 18 90 12 78" fill="none" stroke={color} strokeWidth="1" />
            <path d="M 52 92 Q 32 74 25 60" fill="none" stroke={color} strokeWidth="1" />
            <path d="M 70 74 Q 48 52 40 38" fill="none" stroke={color} strokeWidth="1" />
            <path d="M 88 56 Q 66 34 58 22" fill="none" stroke={color} strokeWidth="1" />
            <path d="M 106 38 Q 85 18 76 10" fill="none" stroke={color} strokeWidth="1" />

            {/* Palm Leaf Fronds Right */}
            <path d="M 35 110 Q 55 98 68 94" fill="none" stroke={color} strokeWidth="1" />
            <path d="M 52 92 Q 74 78 86 72" fill="none" stroke={color} strokeWidth="1" />
            <path d="M 70 74 Q 92 56 104 50" fill="none" stroke={color} strokeWidth="1" />
            <path d="M 88 56 Q 110 36 120 28" fill="none" stroke={color} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#kerala-palm-pattern)" />
      </svg>
    </div>
  );
}
