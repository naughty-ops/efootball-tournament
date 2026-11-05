import React from 'react';
import type { Metadata } from 'next';
import { getPublicTournaments } from '@/services/publicTournamentService';
import TournamentsClientList from '@/components/public/TournamentsClientList';

export const metadata: Metadata = {
  title: 'Tournaments | eFootball Tournament Platform',
  description: 'Browse ongoing, upcoming, and completed eFootball competitive leagues.',
};

// Revalidate tournaments listing cache every 30 seconds
export const revalidate = 30;

export default async function TournamentsPage() {
  const initialTournaments = await getPublicTournaments().catch(() => []);
  return <TournamentsClientList initialTournaments={initialTournaments} />;
}
