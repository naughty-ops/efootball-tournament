'use client';

import React from 'react';

interface PalmFrondCornerProps {
  position?: 'top-right' | 'bottom-left' | 'top-left' | 'bottom-right';
  className?: string;
  opacity?: number;
  color?: string;
}

export default function PalmFrondCorner({
  position = 'top-right',
  className = '',
  opacity = 0.18,
  color = '#00C853',
}: PalmFrondCornerProps) {
  const getTransform = () => {
    switch (position) {
      case 'top-right':
        return 'top-0 right-0 rotate-0';
      case 'bottom-left':
        return 'bottom-0 left-0 rotate-180';
      case 'top-left':
        return 'top-0 left-0 -scale-x-100';
      case 'bottom-right':
        return 'bottom-0 right-0 rotate-180 -scale-x-100';
    }
  };

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute z-10 h-32 w-32 sm:h-48 sm:w-48 overflow-hidden ${getTransform()} ${className}`}
      style={{ opacity }}
    >
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        {/* Main Curved Stem */}
        <path d="M 200 0 Q 100 20 0 200" stroke={color} strokeWidth="3" strokeLinecap="round" />
        
        {/* Individual Frond Blades */}
        <path d="M 180 10 Q 150 40 140 70" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <path d="M 160 20 Q 130 55 110 90" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <path d="M 140 35 Q 105 75 80 115" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <path d="M 115 55 Q 80 100 50 145" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <path d="M 85 85 Q 50 130 20 175" stroke={color} strokeWidth="2" strokeLinecap="round" />

        {/* Opposite Angle Leaves */}
        <path d="M 175 15 Q 160 50 170 85" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M 145 30 Q 130 70 142 105" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M 120 50 Q 102 90 115 130" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M 90 75 Q 70 120 85 160" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}
