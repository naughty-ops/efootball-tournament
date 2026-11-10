'use client';

import React, { useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminTopNav from '@/components/admin/AdminTopNav';

export default function AdminLayoutClient({
  children,
  adminEmail,
  unresolvedTicketCount = 0,
  hasUrgentTickets = false,
}: {
  children: React.ReactNode;
  adminEmail?: string | null;
  unresolvedTicketCount?: number;
  hasUrgentTickets?: boolean;
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-[#0B0B7A] text-white">
      {/* Desktop & Mobile Admin Sidebar */}
      <AdminSidebar
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        unresolvedTicketCount={unresolvedTicketCount}
        hasUrgentTickets={hasUrgentTickets}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation */}
        <AdminTopNav adminEmail={adminEmail} onMenuClick={() => setMobileSidebarOpen(true)} />

        {/* Content Body */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
