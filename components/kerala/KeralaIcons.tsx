'use client';

import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
  color?: string;
}

export function KeralaPalmIcon({ className = 'h-5 w-5', color = 'currentColor' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22V10" />
      <path d="M12 10C9 6 4 6 2 8C5 11 9 11 12 10Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M12 10C15 6 20 6 22 8C19 11 15 11 12 10Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M12 10C10 4 12 2 12 2C12 2 14 4 12 10Z" fill="currentColor" fillOpacity="0.2" />
    </svg>
  );
}

export function KeralaLeafIcon({ className = 'h-5 w-5', color = 'currentColor' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 20A9 9 0 0 0 20 11A9 9 0 0 0 11 20Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M4 20C4 20 8 16 11 11C14 6 20 4 20 4C20 4 18 10 13 15C8 20 4 20 4 20Z" />
      <path d="M11 11L7 15" />
    </svg>
  );
}

export function KeralaFootballIcon({ className = 'h-5 w-5', color = 'currentColor' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="12,6 15,9 14,13 10,13 9,9" fill="currentColor" fillOpacity="0.25" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="15" y1="9" x2="19" y2="7" />
      <line x1="14" y1="13" x2="17" y2="17" />
      <line x1="10" y1="13" x2="7" y2="17" />
      <line x1="9" y1="9" x2="5" y2="7" />
    </svg>
  );
}

export function KeralaBackwaterIcon({ className = 'h-5 w-5', color = 'currentColor' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 6C6 9 10 9 14 6C18 3 22 6 22 6" />
      <path d="M2 12C6 15 10 15 14 12C18 9 22 12 22 12" />
      <path d="M2 18C6 21 10 21 14 18C18 15 22 18 22 18" />
    </svg>
  );
}

export function KeralaTrophyIcon({ className = 'h-5 w-5', color = 'currentColor' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 9H18V12C18 15.3 15.3 18 12 18C8.7 18 6 15.3 6 12V9Z" fill="currentColor" fillOpacity="0.15" />
      <path d="M6 9H4C2.9 9 2 8.1 2 7V5C2 3.9 2.9 3 4 3H6" />
      <path d="M18 9H20C21.1 9 22 8.1 22 7V5C22 3.9 21.1 3 20 3H18" />
      <path d="M12 18V21" />
      <path d="M8 21H16" />
      <path d="M6 3H18V9H6V3Z" />
    </svg>
  );
}
