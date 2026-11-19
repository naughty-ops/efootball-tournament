import React from 'react';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import { getAllAvatarsAdmin } from '@/services/avatarService';
import AdminAvatarDesk from '@/components/admin/avatars/AdminAvatarDesk';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Avatar Management | Admin Portal',
  description: 'Manage and curate official player competitor avatars across the platform.',
};

export default async function AdminAvatarsPage() {
  await requireAdmin('moderator');
  const supabase = await createClient();
  const avatars = await getAllAvatarsAdmin(supabase);

  return <AdminAvatarDesk initialAvatars={avatars} />;
}
