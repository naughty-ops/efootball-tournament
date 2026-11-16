import React from 'react';
import PublicHeader from '@/components/public/PublicHeader';
import PublicFooter from '@/components/public/PublicFooter';
import { ThemeSideAngles, ThemeAmbientGlow } from '@/components/shared/ThemeDecorations';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#08088F] text-white w-full relative overflow-x-hidden">
      {/* Dynamic Ambient Stadium Glow */}
      <ThemeAmbientGlow />

      {/* Decorative Yellow Angles matching reference screenshot sides */}
      <ThemeSideAngles />

      {/* Centered Pill Public Header Navigation */}
      <PublicHeader />

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 relative z-20 app-view-transition">
        {children}
      </main>

      {/* eFootball Gaming Public Footer */}
      <PublicFooter />
    </div>
  );
}
