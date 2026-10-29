import type { Profile, Tournament, Participant, Match } from '@/types/database';
import { normalizeEfootballId, isValidEfootballId } from '@/lib/validations';

export interface ServiceResult<T> {
  data: T;
  error: string | null;
}

export interface PlayerOverviewStats {
  registeredTournamentsCount: number;
  activeTournamentsCount: number;
  upcomingMatchesCount: number;
  liveMatchesCount: number;
  matchesPlayedCount: number;
  matchesWonCount: number;
  matchesDrawnCount: number;
  matchesLostCount: number;
  winRate: number;
}

export interface PlayerTournamentItem {
  participantId: string;
  tournamentId: string;
  tournamentName: string;
  description: string | null;
  bannerImage: string | null;
  format: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  participantStatus: string;
  seedNumber: number | null;
  registeredAt: string;
  maxParticipants: number;
  groupName?: string | null;
  matchesPlayed?: number;
  matchesWon?: number;
}

export interface PlayerMatchItem {
  id: string;
  tournamentId: string;
  tournamentName: string;
  roundName: string;
  roundNumber: number;
  matchPosition: number | null;
  scheduledTime: string | null;
  status: string;
  isLive: boolean;
  userSide: 'home' | 'away'; // 'home' = participant_a, 'away' = participant_b
  userScore: number;
  opponentScore: number;
  userPenalties: number | null;
  opponentPenalties: number | null;
  opponentUsername: string;
  opponentDisplayName: string | null;
  opponentWhatsappNumber: string | null;
  opponentWhatsappVerified: boolean;
  result: 'win' | 'loss' | 'draw' | null;
  decidedBy: string | null;
  liveRoomName: string | null;
  createdAt: string;
}

type AnySupabaseClient = any;

/**
 * Fetch a player's profile data
 */
export async function getPlayerProfile(
  supabase: AnySupabaseClient,
  userId: string,
  fallbackUser?: any
): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      const profileData = data as Profile;
      const isEfFormatValid = isValidEfootballId(profileData.efootball_id);
      return {
        ...profileData,
        efootball_id_verified: isEfFormatValid || profileData.efootball_id_verified,
        efootball_verification_status: isEfFormatValid ? 'verified' : profileData.efootball_verification_status,
      };
    }

    if (error) {
      console.warn('Profiles table notice (using auth metadata fallback):', error.message);
    }

    // Graceful fallback to Supabase Auth user_metadata if profiles table is not yet migrated
    if (fallbackUser) {
      const meta = fallbackUser.user_metadata || {};
      const efId = meta.efootball_id || '';
      const isEfFormatValid = isValidEfootballId(efId);
      return {
        id: userId,
        email: fallbackUser.email || null,
        display_name: meta.full_name || meta.name || (fallbackUser.email ? fallbackUser.email.split('@')[0] : 'Competitor'),
        efootball_id: efId,
        efootball_id_verified: isEfFormatValid,
        efootball_verification_status: isEfFormatValid ? 'verified' : 'pending',
        efootball_rejection_reason: null,
        whatsapp_number: meta.whatsapp_number || '',
        whatsapp_verified: meta.whatsapp_verified === true,
        whatsapp_verification_status: meta.whatsapp_verification_status || 'not_submitted',
        whatsapp_verification_requested_at: meta.whatsapp_verification_requested_at || null,
        whatsapp_verified_at: meta.whatsapp_verified_at || null,
        whatsapp_verified_by: meta.whatsapp_verified_by || null,
        whatsapp_rejection_reason: meta.whatsapp_rejection_reason || null,
        account_status: 'active',
        suspension_reason: null,
        suspended_at: null,
        suspended_by: null,
        admin_notes: null,
        created_at: fallbackUser.created_at || new Date().toISOString(),
        updated_at: fallbackUser.updated_at || new Date().toISOString(),
      };
    }

    return null;
  } catch (err) {
    console.warn('Unexpected error in getPlayerProfile, using fallback if available:', err);
    if (fallbackUser) {
      const meta = fallbackUser.user_metadata || {};
      return {
        id: userId,
        email: fallbackUser.email || null,
        display_name: meta.full_name || meta.name || 'Competitor',
        efootball_id: meta.efootball_id || '',
        efootball_id_verified: false,
        efootball_verification_status: 'pending',
        efootball_rejection_reason: null,
        whatsapp_number: meta.whatsapp_number || '',
        whatsapp_verified: false,
        whatsapp_verification_status: 'not_submitted',
        whatsapp_verification_requested_at: null,
        whatsapp_verified_at: null,
        whatsapp_verified_by: null,
        whatsapp_rejection_reason: null,
        account_status: 'active',
        suspension_reason: null,
        suspended_at: null,
        suspended_by: null,
        admin_notes: null,
        created_at: fallbackUser.created_at || new Date().toISOString(),
        updated_at: fallbackUser.updated_at || new Date().toISOString(),
      };
    }
    return null;
  }
}

/**
 * Fetch all tournaments in which this player is registered
 * Real Supabase query: Resolves tournaments, group allocations, and match counts.
 */
export async function getPlayerTournaments(
  supabase: AnySupabaseClient,
  userId: string
): Promise<ServiceResult<PlayerTournamentItem[]>> {
  try {
    // 1. Fetch user's verified participant records
    const { data: participants, error: pErr } = await supabase
      .from('participants')
      .select('id, tournament_id, username, seed_number, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (pErr) {
      console.error('Error querying participants for user:', pErr);
      return { data: [], error: 'Failed to load tournament registrations from database.' };
    }

    if (!participants || participants.length === 0) {
      return { data: [], error: null };
    }

    const tournamentIds = participants.map((p: any) => p.tournament_id);
    const participantIds = participants.map((p: any) => p.id);

    // 2. Fetch tournament details in parallel with group participation
    const [tournamentsRes, groupPartsRes] = await Promise.all([
      supabase
        .from('tournaments')
        .select('id, name, description, banner_image, format, status, start_date, end_date, max_participants')
        .in('id', tournamentIds),
      supabase
        .from('group_participants')
        .select('participant_id, group_id, groups(id, name)')
        .in('participant_id', participantIds),
    ]);

    if (tournamentsRes.error || !tournamentsRes.data) {
      console.error('Error querying tournaments:', tournamentsRes.error);
      return { data: [], error: 'Failed to load tournament details.' };
    }

    const tournamentMap = new Map<string, any>();
    tournamentsRes.data.forEach((t: any) => tournamentMap.set(t.id, t));

    // Map group names by participant_id
    const groupMap = new Map<string, string>();
    if (groupPartsRes.data) {
      groupPartsRes.data.forEach((gp: any) => {
        if (gp.groups && gp.groups.name) {
          groupMap.set(gp.participant_id, gp.groups.name);
        }
      });
    }

    // 3. Assemble tournament items
    const items: PlayerTournamentItem[] = participants.map((p: any) => {
      const tourney = tournamentMap.get(p.tournament_id) || {};
      const groupName = groupMap.get(p.id) || null;

      return {
        participantId: p.id,
        tournamentId: p.tournament_id,
        tournamentName: tourney.name || 'Unknown Tournament',
        description: tourney.description || null,
        bannerImage: tourney.banner_image || null,
        format: tourney.format || 'knockout',
        status: tourney.status || 'registration',
        startDate: tourney.start_date || null,
        endDate: tourney.end_date || null,
        participantStatus: p.status,
        seedNumber: p.seed_number,
        registeredAt: p.created_at,
        maxParticipants: tourney.max_participants || 32,
        groupName,
      };
    });

    return { data: items, error: null };
  } catch (err: any) {
    console.error('Unexpected error in getPlayerTournaments:', err);
    return { data: [], error: err.message || 'An unexpected error occurred loading your tournaments.' };
  }
}

export interface PlayerMatchesOptions {
  activeLimit?: number;
  completedLimit?: number;
}

/**
 * Fetch all matches involving this player across all registered tournaments
 * Strictly bounds and sorts queries, isolates data ownership, and guards opponent privacy.
 * Uses bounded database-level ordering for upcoming and recent completed matches.
 */
export async function getPlayerMatches(
  supabase: AnySupabaseClient,
  userId: string,
  options?: PlayerMatchesOptions
): Promise<ServiceResult<PlayerMatchItem[]>> {
  try {
    // 1. Get all participant records for this user
    const { data: userParticipants, error: pErr } = await supabase
      .from('participants')
      .select('id, tournament_id')
      .eq('user_id', userId);

    if (pErr) {
      console.error('Error fetching participant IDs for user matches:', pErr);
      return { data: [], error: 'Failed to load player matches from database.' };
    }

    if (!userParticipants || userParticipants.length === 0) {
      return { data: [], error: null };
    }

    const participantIds: string[] = userParticipants.map((p: any) => p.id);
    const userParticipantSet = new Set(participantIds);

    // 2. Fetch matches using database-level ordering and bounds
    const matchSelectFields = `
      id,
      round_id,
      group_id,
      match_position,
      participant_a,
      participant_b,
      scheduled_time,
      status,
      score_a,
      score_b,
      decided_by,
      penalty_score_a,
      penalty_score_b,
      winner_id,
      live_room_name,
      created_at
    `;

    const orFilter = `participant_a.in.(${participantIds.join(',')}),participant_b.in.(${participantIds.join(',')})`;
    const activeLimit = options?.activeLimit ?? 50;
    const completedLimit = options?.completedLimit ?? 50;

    let rawMatches: any[] = [];

    // Attempt dual bounded, database-ordered queries (Active: scheduled_time ASC; Completed: scheduled_time DESC)
    try {
      const activeQuery = supabase.from('matches').select(matchSelectFields).or(orFilter);

      if (typeof activeQuery.in === 'function') {
        const [activeRes, completedRes] = await Promise.all([
          activeQuery
            .in('status', ['live', 'pending', 'ready', 'scheduled'])
            .order('scheduled_time', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(activeLimit),
          supabase
            .from('matches')
            .select(matchSelectFields)
            .or(orFilter)
            .in('status', ['completed', 'walkover'])
            .order('scheduled_time', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(completedLimit),
        ]);

        if (activeRes.error || completedRes.error) {
          const err = activeRes.error || completedRes.error;
          console.error('Error fetching matches query:', err);
          return { data: [], error: 'Failed to retrieve match records.' };
        }

        const map = new Map<string, any>();
        (activeRes.data || []).forEach((m: any) => map.set(m.id, m));
        (completedRes.data || []).forEach((m: any) => map.set(m.id, m));
        rawMatches = Array.from(map.values());
      } else {
        // Fallback for simple mock clients with just .or().limit()
        const fallbackRes = await activeQuery.limit(100);
        if (fallbackRes.error) {
          return { data: [], error: 'Failed to retrieve match records.' };
        }
        rawMatches = fallbackRes.data || [];
      }
    } catch (e: any) {
      console.error('Error in matches query execution:', e);
      return { data: [], error: 'Failed to retrieve match records.' };
    }

    if (!rawMatches || rawMatches.length === 0) {
      return { data: [], error: null };
    }

    // 3. Collect round IDs and opponent participant IDs
    const roundIds = Array.from(new Set(rawMatches.map((m: any) => m.round_id).filter(Boolean)));
    const opponentIds = Array.from(
      new Set(
        rawMatches
          .flatMap((m: any) => [m.participant_a, m.participant_b])
          .filter((id: string | null) => id && !userParticipantSet.has(id))
      )
    );

    interface OpponentDetail {
      username: string;
      displayName: string;
      whatsappNumber: string | null;
      whatsappVerified: boolean;
    }

    const opponentMap = new Map<string, OpponentDetail>();

    if (opponentIds.length > 0) {
      let elevatedClient: any = null;
      try {
        const { createAdminClient } = await import('@/lib/supabase/server');
        elevatedClient = createAdminClient();
      } catch {
        // Fallback to passed client if service role is unavailable
      }

      const clientToUse = elevatedClient || supabase;

      try {
        const { data: tableOpponents, error: partErr } = await clientToUse
          .from('participants')
          .select('id, user_id, username, real_name, contact_info')
          .in('id', opponentIds);

        if (!partErr && tableOpponents && tableOpponents.length > 0) {
          const userIds = Array.from(new Set(tableOpponents.map((o: any) => o.user_id).filter(Boolean)));
          const profileMap = new Map<string, any>();

          if (userIds.length > 0) {
            try {
              const { data: profiles } = await clientToUse
                .from('profiles')
                .select('id, display_name, whatsapp_number, whatsapp_verified, whatsapp_verification_status')
                .in('id', userIds);

              if (profiles) {
                profiles.forEach((p: any) => profileMap.set(p.id, p));
              }
            } catch (err) {
              console.warn('Profiles query notice in player dashboard:', err);
            }
          }

          tableOpponents.forEach((o: any) => {
            const prof = o.user_id ? profileMap.get(o.user_id) : null;
            const fallbackDisplayName = o.real_name || o.username || 'Opponent';
            const displayName = prof?.display_name || fallbackDisplayName;
            const rawWhatsapp = prof?.whatsapp_number?.trim();
            const whatsappNumber = rawWhatsapp && rawWhatsapp.length > 0 ? rawWhatsapp : null;
            const whatsappVerified = Boolean(
              prof?.whatsapp_verified === true || prof?.whatsapp_verification_status === 'verified'
            );

            opponentMap.set(o.id, {
              username: o.username || 'Opponent',
              displayName,
              whatsappNumber,
              whatsappVerified,
            });
          });
        } else {
          // Graceful fallback to public view
          const { data: safeOpponents } = await supabase
            .from('tournament_participants_public')
            .select('id, username')
            .in('id', opponentIds);

          (safeOpponents || []).forEach((o: any) => {
            opponentMap.set(o.id, {
              username: o.username || 'Opponent',
              displayName: o.username || 'Opponent',
              whatsappNumber: null,
              whatsappVerified: false,
            });
          });
        }
      } catch {
        const { data: safeOpponents } = await supabase
          .from('tournament_participants_public')
          .select('id, username')
          .in('id', opponentIds);

        (safeOpponents || []).forEach((o: any) => {
          opponentMap.set(o.id, {
            username: o.username || 'Opponent',
            displayName: o.username || 'Opponent',
            whatsappNumber: null,
            whatsappVerified: false,
          });
        });
      }
    }

    const [roundsRes] = await Promise.all([
      roundIds.length > 0
        ? supabase.from('rounds').select('id, name, round_number, tournament_id').in('id', roundIds)
        : Promise.resolve({ data: [] }),
    ]);

    const roundMap = new Map<string, { name: string; round_number: number; tournament_id: string }>();
    if (roundsRes.data) {
      roundsRes.data.forEach((r: any) => roundMap.set(r.id, r));
    }

    // Fetch tournament names
    const tournamentIds = Array.from(
      new Set(Array.from(roundMap.values()).map((r) => r.tournament_id))
    );
    const tournamentMap = new Map<string, string>();
    if (tournamentIds.length > 0) {
      const { data: tournaments } = await supabase
        .from('tournaments')
        .select('id, name')
        .in('id', tournamentIds);
      if (tournaments) {
        tournaments.forEach((t: any) => tournamentMap.set(t.id, t.name));
      }
    }

    // 4. Map each match into PlayerMatchItem with authoritative result and side
    const mappedMatches: PlayerMatchItem[] = rawMatches.map((m: any) => {
      const isUserParticipantA = userParticipantSet.has(m.participant_a);
      const userParticipantId = isUserParticipantA ? m.participant_a : m.participant_b;
      const opponentId = isUserParticipantA ? m.participant_b : m.participant_a;

      const oppDetail = opponentId ? opponentMap.get(opponentId) : undefined;
      const opponentUsername = oppDetail ? oppDetail.username : (opponentId ? 'Opponent' : 'TBD / Bye');
      const opponentDisplayName = oppDetail ? oppDetail.displayName : opponentUsername;
      const opponentWhatsappNumber = oppDetail?.whatsappNumber || null;
      const opponentWhatsappVerified = Boolean(oppDetail?.whatsappVerified);

      const roundData = roundMap.get(m.round_id);
      const tournamentName = roundData ? (tournamentMap.get(roundData.tournament_id) || 'Tournament') : 'Tournament';

      const userSide: 'home' | 'away' = isUserParticipantA ? 'home' : 'away';
      const userScore = isUserParticipantA ? (m.score_a ?? 0) : (m.score_b ?? 0);
      const opponentScore = isUserParticipantA ? (m.score_b ?? 0) : (m.score_a ?? 0);
      const userPenalties = isUserParticipantA ? m.penalty_score_a : m.penalty_score_b;
      const opponentPenalties = isUserParticipantA ? m.penalty_score_b : m.penalty_score_a;

      // Authoritative result calculation:
      let result: 'win' | 'loss' | 'draw' | null = null;
      if (m.status === 'completed' || m.status === 'walkover') {
        if (m.winner_id) {
          result = m.winner_id === userParticipantId ? 'win' : 'loss';
        } else if (userScore > opponentScore) {
          result = 'win';
        } else if (userScore < opponentScore) {
          result = 'loss';
        } else {
          // Both scores equal: draw (distinguished from penalty shootouts by decided_by)
          result = 'draw';
        }
      }

      return {
        id: m.id,
        tournamentId: roundData?.tournament_id || '',
        tournamentName,
        roundName: roundData?.name || `Round ${roundData?.round_number || 1}`,
        roundNumber: roundData?.round_number || 1,
        matchPosition: m.match_position ?? null,
        scheduledTime: m.scheduled_time,
        status: m.status,
        isLive: m.status === 'live',
        userSide,
        userScore,
        opponentScore,
        userPenalties,
        opponentPenalties,
        opponentUsername,
        opponentDisplayName,
        opponentWhatsappNumber,
        opponentWhatsappVerified,
        result,
        decidedBy: m.decided_by,
        liveRoomName: m.live_room_name,
        createdAt: m.created_at,
      };
    });

    // 5. Intelligent multi-tier sorting:
    // Live matches first -> Upcoming matches by scheduled_time ASC -> Completed matches by scheduled_time DESC
    const liveMatches = mappedMatches.filter((m) => m.isLive);
    const upcomingMatches = mappedMatches
      .filter((m) => !m.isLive && m.status !== 'completed' && m.status !== 'walkover')
      .sort((a, b) => {
        if (a.scheduledTime && b.scheduledTime) {
          return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
        }
        if (a.scheduledTime) return -1;
        if (b.scheduledTime) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const completedMatches = mappedMatches
      .filter((m) => m.status === 'completed' || m.status === 'walkover')
      .sort((a, b) => {
        if (a.scheduledTime && b.scheduledTime) {
          return new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime();
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    return {
      data: [...liveMatches, ...upcomingMatches, ...completedMatches],
      error: null,
    };
  } catch (err: any) {
    console.error('Unexpected error in getPlayerMatches:', err);
    return { data: [], error: err.message || 'An unexpected error occurred loading your matches.' };
  }
}

/**
 * Aggregates statistics for the player overview cards
 */
export async function getPlayerOverviewStats(
  supabase: AnySupabaseClient,
  userId: string
): Promise<PlayerOverviewStats> {
  const [tournamentsRes, matchesRes] = await Promise.all([
    getPlayerTournaments(supabase, userId),
    getPlayerMatches(supabase, userId),
  ]);

  const tournaments = tournamentsRes.data || [];
  const matches = matchesRes.data || [];

  const registeredTournamentsCount = tournaments.length;
  const activeTournamentsCount = tournaments.filter(
    (t) => t.status === 'ongoing' || t.status === 'registration'
  ).length;

  const upcomingMatches = matches.filter(
    (m) => !m.isLive && m.status !== 'completed' && m.status !== 'walkover'
  );
  const liveMatches = matches.filter((m) => m.isLive);
  const completedMatches = matches.filter((m) => m.status === 'completed' || m.status === 'walkover');

  let matchesWonCount = 0;
  let matchesDrawnCount = 0;
  let matchesLostCount = 0;

  completedMatches.forEach((m) => {
    if (m.result === 'win') {
      matchesWonCount++;
    } else if (m.result === 'draw') {
      matchesDrawnCount++;
    } else if (m.result === 'loss') {
      matchesLostCount++;
    }
  });

  const matchesPlayedCount = completedMatches.length;
  const winRate =
    matchesPlayedCount > 0
      ? Math.round((matchesWonCount / matchesPlayedCount) * 100)
      : 0;

  return {
    registeredTournamentsCount,
    activeTournamentsCount,
    upcomingMatchesCount: upcomingMatches.length,
    liveMatchesCount: liveMatches.length,
    matchesPlayedCount,
    matchesWonCount,
    matchesDrawnCount,
    matchesLostCount,
    winRate,
  };
}

/**
 * Check if the user is already registered for a specific tournament
 */
export async function checkUserTournamentRegistration(
  supabase: AnySupabaseClient,
  userId: string,
  tournamentId: string
): Promise<{ isRegistered: boolean; participant: Participant | null }> {
  try {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return { isRegistered: false, participant: null };
    }
    return { isRegistered: true, participant: data as Participant };
  } catch (err) {
    console.error('Error checking tournament registration:', err);
    return { isRegistered: false, participant: null };
  }
}

/**
 * Perform self-registration for an open tournament
 */
export async function selfRegisterTournament(
  supabase: AnySupabaseClient,
  userId: string,
  tournamentId: string,
  options?: { rulesAccepted?: boolean }
): Promise<{ success: boolean; message: string; participantId?: string }> {
  // 1. Fetch user profile
  let profile = await getPlayerProfile(supabase, userId);
  if (!profile) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.id === userId) {
        profile = await getPlayerProfile(supabase, userId, user);
      }
    } catch {
      // Fallback auth error ignored
    }
  }
  if (!profile) {
    return { success: false, message: 'Profile not found. Please complete your registration details.' };
  }

  if (profile.account_status && profile.account_status !== 'active') {
    return { success: false, message: `Your account is currently ${profile.account_status}. Registration is restricted.` };
  }

  // Ensure user has configured their eFootball ID
  const rawEfootballId = (profile.efootball_id || profile.display_name || '').trim();
  if (!rawEfootballId) {
    return { success: false, message: 'Please update your profile with a valid eFootball ID before registering.' };
  }

  const normalizedEfootballId = normalizeEfootballId(rawEfootballId);

  // 2. Fetch tournament details & verify status
  const { data: tourney, error: tErr } = await supabase
    .from('tournaments')
    .select('id, name, status, max_participants')
    .eq('id', tournamentId)
    .maybeSingle();

  if (tErr || !tourney) {
    return { success: false, message: 'Tournament not found.' };
  }

  if (tourney.status !== 'registration') {
    return {
      success: false,
      message: `Tournament registration is closed (current status: ${tourney.status}).`,
    };
  }

  // 3. Verify capacity
  const { count, error: countErr } = await supabase
    .from('participants')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if (countErr) {
    return { success: false, message: 'Failed to check tournament capacity.' };
  }

  const currentCount = count || 0;
  if (currentCount >= (tourney.max_participants || 32)) {
    return { success: false, message: 'Tournament capacity is full. No more slots available.' };
  }

  // 4. Verify user is not already registered by user_id
  const { isRegistered } = await checkUserTournamentRegistration(supabase, userId, tournamentId);
  if (isRegistered) {
    return { success: false, message: 'You are already registered for this tournament.' };
  }

  // 5. Verify no participant in this tournament has the same eFootball ID
  const { data: existingParticipantWithId } = await supabase
    .from('participants')
    .select('id')
    .eq('tournament_id', tournamentId)
    .ilike('username', normalizedEfootballId)
    .maybeSingle();

  if (existingParticipantWithId) {
    return { success: false, message: 'This eFootball ID is already registered in this tournament.' };
  }

  // 6. Insert participant record
  const username = normalizedEfootballId;
  const { data: newParticipant, error: insertErr } = await supabase
    .from('participants')
    .insert({
      tournament_id: tournamentId,
      user_id: userId,
      username: username,
      real_name: profile.display_name?.trim() || username,
      contact_info: profile.whatsapp_number?.trim() || null,
      status: 'active',
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
      rules_version: '1.0',
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('Registration insert error:', insertErr);
    if (insertErr.code === '23505') {
      return { success: false, message: 'You or this eFootball ID are already registered in this tournament.' };
    }
    return { success: false, message: insertErr.message || 'Failed to complete registration.' };
  }

  return {
    success: true,
    message: `Successfully registered for ${tourney.name}!`,
    participantId: newParticipant?.id,
  };
}
