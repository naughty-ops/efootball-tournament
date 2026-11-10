import React from 'react';
import type { Metadata } from 'next';
import { getAllAvatarsAdmin } from '@/services/avatarService';
import AdminAvatarDesk from '@/components/admin/avatars/AdminAvatarDesk';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Avatar Management | Admin Portal',
  description: 'Manage and curate official player competitor avatars across the platform.',
};

export default async function AdminAvatarsPage() {
  const avatars = await getAllAvatarsAdmin();

  return <AdminAvatarDesk initialAvatars={avatars} />;
}
