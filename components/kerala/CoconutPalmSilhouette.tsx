'use client';

import React from 'react';

interface CoconutPalmSilhouetteProps {
  position?: 'left' | 'right' | 'corner-top-right' | 'corner-bottom-left';
  className?: string;
  opacity?: number;
  color?: string;
}

export default function CoconutPalmSilhouette({
  position = 'right',
  className = '',
  opacity = 0.12,
  color = '#0B3323',
}: CoconutPalmSilhouetteProps) {
  const getPositionStyle = () => {
    switch (position) {
      case 'left':
        return 'left-0 top-1/2 -translate-y-1/2 -translate-x-1/4 h-[120%] w-auto';
      case 'right':
        return 'right-0 top-1/2 -translate-y-1/2 translate-x-1/4 h-[120%] w-auto';
      case 'corner-top-right':
        return 'right-0 top-0 translate-x-1/6 -translate-y-1/6 h-[110%] w-auto';
      case 'corner-bottom-left':
        return 'left-0 bottom-0 -translate-x-1/6 translate-y-1/6 h-[110%] w-auto';
    }
  };

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute z-0 overflow-hidden ${getPositionStyle()} ${className}`}
      style={{ opacity }}
    >
      <svg
        viewBox="0 0 400 600"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-auto object-contain"
      >
        {/* Curved Coconut Tree Trunk */}
        <path
          d="M 220 600 C 230 450, 180 300, 150 180 C 140 140, 145 100, 160 70"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* Ring Bark Textures */}
        <path d="M 215 540 Q 225 535 230 540" stroke={color} strokeWidth="4" />
        <path d="M 200 480 Q 212 475 218 480" stroke={color} strokeWidth="4" />
        <path d="M 182 410 Q 194 405 200 410" stroke={color} strokeWidth="4" />
        <path d="M 165 330 Q 175 325 182 330" stroke={color} strokeWidth="4" />

        {/* Coconut Clusters */}
        <circle cx="150" cy="85" r="10" fill={color} />
        <circle cx="165" cy="80" r="11" fill={color} />
        <circle cx="140" cy="95" r="9" fill={color} />

        {/* Coconut Palm Fronds */}
        {/* Frond 1 - Top Left Flowing */}
        <path d="M 155 75 Q 80 40 10 90" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
        <path d="M 155 75 C 100 20, 40 40, 10 90 C 50 70, 110 60, 155 75 Z" fill={color} />

        {/* Frond 2 - Top Center Arching */}
        <path d="M 155 75 Q 160 -10 240 5" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
        <path d="M 155 75 C 150 10, 200 -20, 240 5 C 200 20, 170 30, 155 75 Z" fill={color} />

        {/* Frond 3 - Right Arching Droop */}
        <path d="M 155 75 Q 260 30 350 110" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
        <path d="M 155 75 C 220 30, 310 60, 350 110 C 290 85, 210 70, 155 75 Z" fill={color} />

        {/* Frond 4 - Lower Right Sway */}
        <path d="M 155 75 Q 280 110 380 200" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
        <path d="M 155 75 C 240 100, 330 140, 380 200 C 310 165, 230 130, 155 75 Z" fill={color} />

        {/* Frond 5 - Lower Left Sway */}
        <path d="M 155 75 Q 60 110 -20 190" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
        <path d="M 155 75 C 80 100, 10 130, -20 190 C 30 150, 100 120, 155 75 Z" fill={color} />
      </svg>
    </div>
  );
}
