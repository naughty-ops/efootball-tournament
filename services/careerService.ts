import type { SupabaseClient } from '@supabase/supabase-js';

export interface HeadToHeadRecord {
  opponentId: string;
  opponentName: string;
  opponentEfootballId?: string;
  opponentAvatarUrl?: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  lastPlayedAt: string | null;
}

export interface PlayerAchievementItem {
  id: string;
  title: string;
  description: string;
  category: string;
  badgeIcon: string;
  points: number;
  isUnlocked: boolean;
  unlockedAt: string | null;
}

export interface PlayerCareerData {
  stats: {
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    winRate: number;
    tournamentsEntered: number;
    championshipsWon: number;
    runnerUpFinishes: number;
    totalPrizeMoneyInr: number;
    currentStreak: number;
    longestStreak: number;
    rankTier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Champion';
  };
  formGuide: Array<'W' | 'D' | 'L'>;
  headToHead: HeadToHeadRecord[];
  achievements: PlayerAchievementItem[];
  totalAchievementPoints: number;
  unlockedCount: number;
}

export const DEFAULT_CAREER_DATA: PlayerCareerData = {
  stats: {
    matchesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    winRate: 0,
    tournamentsEntered: 0,
    championshipsWon: 0,
    runnerUpFinishes: 0,
    totalPrizeMoneyInr: 0,
    currentStreak: 0,
    longestStreak: 0,
    rankTier: 'Bronze',
  },
  formGuide: [],
  headToHead: [],
  achievements: [],
  totalAchievementPoints: 0,
  unlockedCount: 0,
};

interface CareerCacheEntry<T> {
  data: T;
  timestamp: number;
}
const careerCache = new Map<string, CareerCacheEntry<PlayerCareerData>>();
const CAREER_CACHE_TTL_MS = 60 * 1000;

export function invalidateCareerCache(userId?: string) {
  if (userId) careerCache.delete(userId);
  else careerCache.clear();
}

export async function getPlayerCareerData(
  supabase: SupabaseClient,
  userId: string
): Promise<PlayerCareerData> {
  const cached = careerCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CAREER_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
  // 1. Fetch user's participant records across tournaments
  const { data: userParticipants } = await supabase
    .from('participants')
    .select('id, tournament_id, created_at')
    .eq('user_id', userId);

  const participantIds = (userParticipants || []).map((p) => p.id);
  const tournamentIds = Array.from(new Set((userParticipants || []).map((p) => p.tournament_id).filter(Boolean)));

  // If no participants found, early return with default empty stats
  let completedMatches: any[] = [];
  let championshipsCount = 0;
  let runnerUpCount = 0;
  let totalPrizeMoney = 0;

  if (participantIds.length > 0) {
    // 2. Fetch matches involving this player
    const { data: matchesData } = await supabase
      .from('matches')
      .select(`
        id,
        scheduled_time,
        created_at,
        status,
        score_a,
        score_b,
        winner_id,
        participant_a,
        participant_b,
        tournament_id,
        tournaments (
          name
        )
      `)
      .or(`participant_a.in.(${participantIds.join(',')}),participant_b.in.(${participantIds.join(',')})`)
      .order('scheduled_time', { ascending: true });

    const allMatches = matchesData || [];
    completedMatches = allMatches.filter((m) => {
      const s = (m.status || '').toLowerCase();
      return ['completed', 'walkover', 'forfeited'].includes(s);
    });

    // 3. Fetch tournaments where this player won or finished 2nd
    if (tournamentIds.length > 0) {
      const { data: tournamentsData } = await supabase
        .from('tournaments')
        .select('id, champion_id, runner_up_id')
        .in('id', tournamentIds);

      (tournamentsData || []).forEach((t) => {
        if (t.champion_id && participantIds.includes(t.champion_id)) {
          championshipsCount++;
        }
        if (t.runner_up_id && participantIds.includes(t.runner_up_id)) {
          runnerUpCount++;
        }
      });
    }

    // 4. Fetch approved prize money from prize_distributions
    const { data: prizeData } = await supabase
      .from('prize_distributions')
      .select('prize_amount_inr, status')
      .eq('player_id', userId)
      .neq('status', 'cancelled');

    (prizeData || []).forEach((p) => {
      const amt = Number(p.prize_amount_inr) || 0;
      totalPrizeMoney += amt;
    });
  }

  // 5. Calculate match stats, streaks, form guide, head to head
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  const matchResultsChronological: Array<{
    matchId: string;
    result: 'W' | 'D' | 'L';
    opponentId: string | null;
    date: string | null;
  }> = [];

  completedMatches.forEach((m) => {
    const isPlayerA = participantIds.includes(m.participant_a);
    const userPartId = isPlayerA ? m.participant_a : m.participant_b;
    const oppPartId = isPlayerA ? m.participant_b : m.participant_a;

    let res: 'W' | 'D' | 'L' = 'L';
    if (m.winner_id) {
      res = m.winner_id === userPartId ? 'W' : 'L';
    } else if (m.score_a !== null && m.score_b !== null) {
      const userScore = isPlayerA ? m.score_a : m.score_b;
      const oppScore = isPlayerA ? m.score_b : m.score_a;
      if (userScore > oppScore) res = 'W';
      else if (userScore === oppScore) res = 'D';
      else res = 'L';
    }

    if (res === 'W') {
      wins++;
      tempStreak++;
      if (tempStreak > longestStreak) longestStreak = tempStreak;
    } else {
      if (res === 'D') draws++;
      else losses++;
      tempStreak = 0;
    }

    matchResultsChronological.push({
      matchId: m.id,
      result: res,
      opponentId: oppPartId,
      date: m.scheduled_time || m.created_at,
    });
  });

  // Calculate current streak backwards from most recent match
  for (let i = matchResultsChronological.length - 1; i >= 0; i--) {
    if (matchResultsChronological[i].result === 'W') {
      currentStreak++;
    } else {
      break;
    }
  }

  const matchesPlayed = completedMatches.length;
  const winRate = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;

  // Rank Tier Calculation
  let rankTier: PlayerCareerData['stats']['rankTier'] = 'Bronze';
  if (wins >= 20 && winRate >= 70) rankTier = 'Champion';
  else if (wins >= 15 && winRate >= 60) rankTier = 'Diamond';
  else if (wins >= 10 && winRate >= 50) rankTier = 'Platinum';
  else if (wins >= 5) rankTier = 'Gold';
  else if (wins >= 2) rankTier = 'Silver';

  // Recent Form Guide (last 5 matches)
  const formGuide = matchResultsChronological
    .slice(-5)
    .map((m) => m.result);

  // 6. Head-to-Head aggregation
  const opponentPartIds = Array.from(
    new Set(matchResultsChronological.map((m) => m.opponentId).filter(Boolean) as string[])
  );

  const headToHeadMap = new Map<string, HeadToHeadRecord>();

  if (opponentPartIds.length > 0) {
    const { data: oppParticipants } = await supabase
      .from('participants')
      .select('id, user_id, username, real_name')
      .in('id', opponentPartIds);

    const partToUserMap = new Map<string, { username: string; userId?: string }>();
    (oppParticipants || []).forEach((p) => {
      partToUserMap.set(p.id, {
        username: p.username || p.real_name || 'Opponent',
        userId: p.user_id,
      });
    });

    matchResultsChronological.forEach((m) => {
      if (!m.opponentId) return;
      const oppInfo = partToUserMap.get(m.opponentId);
      const key = oppInfo?.userId || m.opponentId;
      const name = oppInfo?.username || 'Opponent';

      if (!headToHeadMap.has(key)) {
        headToHeadMap.set(key, {
          opponentId: key,
          opponentName: name,
          matchesPlayed: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          lastPlayedAt: m.date,
        });
      }

      const h2h = headToHeadMap.get(key)!;
      h2h.matchesPlayed++;
      if (m.result === 'W') h2h.wins++;
      else if (m.result === 'D') h2h.draws++;
      else h2h.losses++;
      if (m.date) h2h.lastPlayedAt = m.date;
    });
  }

  const headToHeadList = Array.from(headToHeadMap.values()).sort(
    (a, b) => b.matchesPlayed - a.matchesPlayed
  );

  // 7. Achievements Evaluation & Sync
  const { data: allAchievements } = await supabase
    .from('achievements')
    .select('*')
    .order('points', { ascending: true });

  const { data: unlockedAchievements } = await supabase
    .from('player_achievements')
    .select('achievement_id, unlocked_at')
    .eq('player_id', userId);

  const unlockedMap = new Map<string, string>();
  (unlockedAchievements || []).forEach((ua) => {
    unlockedMap.set(ua.achievement_id, ua.unlocked_at);
  });

  // Evaluate which achievements qualify
  const eligibleIds: string[] = [];
  if (wins >= 1) eligibleIds.push('first_victory');
  if (tournamentIds.length >= 1) eligibleIds.push('tournament_debut');
  if (championshipsCount >= 1) eligibleIds.push('champion');
  if (runnerUpCount >= 1) eligibleIds.push('runner_up');
  if (wins >= 5) eligibleIds.push('five_wins');
  if (longestStreak >= 3) eligibleIds.push('winning_streak');
  if (tournamentIds.length >= 5) eligibleIds.push('veteran_player');

  // Insert newly unlocked achievements into database
  const toInsert = eligibleIds.filter((id) => !unlockedMap.has(id));
  if (toInsert.length > 0) {
    const insertPayload = toInsert.map((achId) => ({
      player_id: userId,
      achievement_id: achId,
    }));
    await supabase.from('player_achievements').insert(insertPayload);
    toInsert.forEach((id) => {
      unlockedMap.set(id, new Date().toISOString());
    });
  }

  let totalAchievementPoints = 0;
  let unlockedCount = 0;

  const achievements: PlayerAchievementItem[] = (allAchievements || []).map((a) => {
    const isUnlocked = unlockedMap.has(a.id);
    if (isUnlocked) {
      totalAchievementPoints += a.points;
      unlockedCount++;
    }
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      category: a.category,
      badgeIcon: a.badge_icon,
      points: a.points,
      isUnlocked,
      unlockedAt: unlockedMap.get(a.id) || null,
    };
  });

    const careerResult: PlayerCareerData = {
      stats: {
        matchesPlayed,
        wins,
        draws,
        losses,
        winRate,
        tournamentsEntered: tournamentIds.length,
        championshipsWon: championshipsCount,
        runnerUpFinishes: runnerUpCount,
        totalPrizeMoneyInr: totalPrizeMoney,
        currentStreak,
        longestStreak,
        rankTier,
      },
      formGuide,
      headToHead: headToHeadList,
      achievements,
      totalAchievementPoints,
      unlockedCount,
    };
    careerCache.set(userId, { data: careerResult, timestamp: Date.now() });
    return careerResult;
  } catch (err) {
    console.warn('getPlayerCareerData error:', err);
    return DEFAULT_CAREER_DATA;
  }
}
