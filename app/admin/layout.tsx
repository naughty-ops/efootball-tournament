import React from 'react';
import { redirect } from 'next/navigation';
import { isAllowlistedAdminEmail, getAuthenticatedUser } from '@/lib/auth/server';
import AdminLayoutClient from '@/components/admin/AdminLayoutClient';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin Dashboard | eFootball Tournament',
  description: 'Administrative portal for managing tournaments, fixtures, and settings.',
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Leverages request-cached getAuthenticatedUser (1 single auth + admin check across the entire request)
  const { user, isAdmin } = await getAuthenticatedUser();

  // 1. Enforce active authentication
  if (!user) {
    redirect('/login');
  }

  // 2. Enforce strict email allowlist and database admin check (ye.agrajj@gmail.com only)
  if (!isAdmin || !isAllowlistedAdminEmail(user.email)) {
    redirect('/dashboard?error=admin_unauthorized');
  }

  return <AdminLayoutClient adminEmail={user.email}>{children}</AdminLayoutClient>;
}
