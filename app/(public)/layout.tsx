import React from 'react';
import PublicHeader from '@/components/public/PublicHeader';
import PublicFooter from '@/components/public/PublicFooter';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#08088F] text-white w-full relative overflow-x-hidden">
      {/* Decorative Yellow Angles matching reference screenshot sides */}
      <div className="hidden xl:block yellow-angle-left top-48" aria-hidden="true" />
      <div className="hidden xl:block yellow-angle-right top-48" aria-hidden="true" />
      <div className="hidden xl:block yellow-angle-left top-[850px]" aria-hidden="true" />
      <div className="hidden xl:block yellow-angle-right top-[850px]" aria-hidden="true" />

      {/* Centered Pill Public Header Navigation */}
      <PublicHeader />

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 relative z-20">
        {children}
      </main>

      {/* eFootball Gaming Public Footer */}
      <PublicFooter />
    </div>
  );
}
