'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';

export default function PWASplashTransition() {
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Only run initial splash transition once per session to prevent repeated interference
    const splashSeen = sessionStorage.getItem('efootball_splash_seen');
    if (splashSeen) {
      setIsVisible(false);
      return;
    }

    // Hold 4K splash screen for 700ms then smooth fade-out over 500ms
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 700);

    const removeTimer = setTimeout(() => {
      setIsVisible(false);
      sessionStorage.setItem('efootball_splash_seen', 'true');
    }, 1200);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[#0B3323] transition-opacity duration-500 ease-out ${
        isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      <div className="relative w-full h-full max-w-5xl max-h-[90vh] flex items-center justify-center p-4">
        <Image
          src="/splash/splash-4k.png"
          alt="eFootball Tournament Splash"
          fill
          priority
          sizes="100vw"
          className="object-contain drop-shadow-2xl"
        />
      </div>
    </div>
  );
}
