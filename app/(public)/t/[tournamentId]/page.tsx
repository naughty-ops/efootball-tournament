import React from 'react';
import type { Metadata } from 'next';
import { getPublicTournament } from '@/services/publicTournamentService';
import PublicTournamentClientView from './PublicTournamentClientView';

interface PageProps {
  params: Promise<{ tournamentId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tournamentId } = await params;
  const tournament = await getPublicTournament(tournamentId).catch(() => null);

  if (!tournament) {
    return {
      title: 'Tournament Not Found | eFootball Tournament',
      description: 'The requested eFootball tournament could not be found or may have been deleted.',
    };
  }

  const statusLabel = tournament.status === 'completed'
    ? 'Completed'
    : tournament.status === 'ongoing'
    ? '🔴 Live'
    : tournament.status === 'registration'
    ? 'Registration Open'
    : 'Upcoming';

  const title = `${tournament.name} | eFootball Tournament`;
  const description = `Follow ${tournament.name} (${statusLabel}). View participants, fixtures, live match results, standings, and the symmetrical knockout playoff bracket.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'eFootball Tournament Platform',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function PublicTournamentPage({ params }: PageProps) {
  const { tournamentId } = await params;
  return <PublicTournamentClientView tournamentId={tournamentId} />;
}
