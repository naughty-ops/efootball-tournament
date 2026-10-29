import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAllowlistedAdminEmail, checkIsAdmin } from '@/lib/auth/server';
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
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // 1. Enforce active authentication
  if (error || !user) {
    redirect('/login');
  }

  // 2. Enforce strict email allowlist check (ye.agrajj@gmail.com only)
  if (!isAllowlistedAdminEmail(user.email)) {
    redirect('/dashboard?error=admin_unauthorized');
  }

  // 3. Enforce database admin_users record verification
  const isAdmin = await checkIsAdmin(user.id, user.email);
  if (!isAdmin) {
    redirect('/dashboard?error=admin_unauthorized');
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
