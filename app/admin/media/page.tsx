import React from 'react';
import type { Metadata } from 'next';
import { getAdminMediaOverview } from '@/services/mediaService';
import AdminMediaDesk from '@/components/admin/media/AdminMediaDesk';
import type { MediaEntityType, MediaStatus } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Media Management Desk | Admin Portal',
  description: 'Manage Cloudinary centralized media assets, storage metrics, and evidence vaults.',
};

interface PageProps {
  searchParams?: Promise<{
    category?: string;
    status?: string;
  }>;
}

export default async function AdminMediaPage({ searchParams }: PageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const selectedCategory = (resolvedParams.category as MediaEntityType | 'all') || 'all';
  const selectedStatus = (resolvedParams.status as MediaStatus | 'all') || 'all';

  const overview = await getAdminMediaOverview({
    category: selectedCategory,
    status: selectedStatus,
    limit: 100,
  });

  return (
    <AdminMediaDesk
      initialAssets={overview.assets}
      totalCount={overview.totalCount}
      totalMB={overview.totalMB}
      countByCategory={overview.countByCategory}
      bytesByCategory={overview.bytesByCategory}
      selectedCategory={selectedCategory}
      selectedStatus={selectedStatus}
    />
  );
}
