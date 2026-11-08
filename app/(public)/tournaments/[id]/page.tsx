import React, { cache } from 'react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getPublicTournament, redactPrivateTournament } from '@/services/publicTournamentService';
import { verifySignedTournamentAccessToken, getTournamentCookieName } from '@/lib/security/tournamentAccessCookie';
import PublicTournamentClientView from '@/app/(public)/t/[tournamentId]/PublicTournamentClientView';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Revalidate public tournament details cache every 30 seconds (ISR)
export const revalidate = 30;

// Deduplicate tournament data query between generateMetadata and Page component
const getCachedTournament = cache(async (id: string) => {
  return await getPublicTournament(id).catch(() => null);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const tournament = await getCachedTournament(id);

  if (!tournament) {
    return {
      title: 'Tournament Not Found | eFootball Tournament',
      description: 'The requested eFootball tournament could not be found or may have been deleted.',
    };
  }

  // Obfuscate metadata if tournament is marked private
  if ((tournament as any).is_private) {
    return {
      title: 'Private Tournament | eFootball Tournament',
      description: 'This is a private invitation-only tournament. Access code required to participate.',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const statusLabel =
    tournament.status === 'completed'
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
  };
}

export default async function PublicTournamentPage({ params }: PageProps) {
  const { id } = await params;
  const initialTournament = await getCachedTournament(id);

  if (!initialTournament) {
    return <PublicTournamentClientView tournamentId={id} initialTournament={null} />;
  }

  // If tournament is private, check user session and cryptographically signed authorization cookie
  if ((initialTournament as any).is_private) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Anonymous visitors are strictly restricted behind the access code gate (Task 3.A)
    if (!user) {
      const safeRedacted = redactPrivateTournament(initialTournament);
      return <PublicTournamentClientView tournamentId={id} initialTournament={safeRedacted} isPrivateLocked={true} />;
    }

    const cookieStore = await cookies();
    const cookieName = getTournamentCookieName(id);
    const accessCookie = cookieStore.get(cookieName)?.value;

    // Fetch password hash to verify password-state fingerprint
    const adminClient = createAdminClient();
    const { data: privRecord } = await (adminClient.from('tournaments') as any)
      .select('access_code_hash')
      .eq('id', id)
      .maybeSingle();

    const verification = verifySignedTournamentAccessToken(
      accessCookie,
      id,
      privRecord?.access_code_hash
    );

    if (!verification.valid) {
      // Pass strictly redacted version to client view. No private fields leaked to props or HTML.
      const safeRedacted = redactPrivateTournament(initialTournament);
      return <PublicTournamentClientView tournamentId={id} initialTournament={safeRedacted} isPrivateLocked={true} />;
    }
  }

  return <PublicTournamentClientView tournamentId={id} initialTournament={initialTournament} />;
}
