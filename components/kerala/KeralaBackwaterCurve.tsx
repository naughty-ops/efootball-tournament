'use client';

import React from 'react';

interface KeralaBackwaterCurveProps {
  className?: string;
  color?: string;
  opacity?: number;
  height?: number;
}

export default function KeralaBackwaterCurve({
  className = '',
  color = '#0B3323',
  opacity = 0.15,
}: KeralaBackwaterCurveProps) {
  return (
    <div aria-hidden="true" className={`pointer-events-none w-full overflow-hidden leading-none ${className}`}>
      <svg
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
        className="relative block w-full h-10 sm:h-16"
        style={{ opacity }}
      >
        <path
          d="M0,0 C150,90 350,-40 500,50 C650,140 900,10 1200,60 L1200,120 L0,120 Z"
          fill={color}
        />
      </svg>
    </div>
  );
}
