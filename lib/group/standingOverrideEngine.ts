import type { GroupStandingRow } from './groupEngine';

export interface StandingOverride {
  participantId: string;
  positionOverride?: number | null;
  played?: number | null;
  wins?: number | null;
  draws?: number | null;
  losses?: number | null;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
  goalDifference?: number | null;
  points?: number | null;
  reason?: string | null;
}

const OVERRIDE_TAG_PREFIX = '<!--STANDINGS_OVERRIDES:';
const OVERRIDE_TAG_SUFFIX = '-->';

/**
 * Parse standing overrides embedded inside rules_text
 */
export function parseStandingOverrides(rulesText?: string | null): Record<string, StandingOverride> {
  if (!rulesText) return {};
  const startIdx = rulesText.indexOf(OVERRIDE_TAG_PREFIX);
  if (startIdx === -1) return {};

  const endIdx = rulesText.indexOf(OVERRIDE_TAG_SUFFIX, startIdx);
  if (endIdx === -1) return {};

  const jsonStr = rulesText.substring(startIdx + OVERRIDE_TAG_PREFIX.length, endIdx);
  try {
    return JSON.parse(jsonStr);
  } catch {
    return {};
  }
}

/**
 * Embed standing overrides cleanly into rules_text
 */
export function serializeStandingOverrides(
  rulesText: string | null | undefined,
  overrides: Record<string, StandingOverride>
): string {
  const cleanBase = (rulesText || '')
    .replace(new RegExp(`${OVERRIDE_TAG_PREFIX}.*?${OVERRIDE_TAG_SUFFIX}`, 'gs'), '')
    .trim();

  if (Object.keys(overrides).length === 0) {
    return cleanBase;
  }

  const jsonStr = JSON.stringify(overrides);
  const tag = `${OVERRIDE_TAG_PREFIX}${jsonStr}${OVERRIDE_TAG_SUFFIX}`;
  return cleanBase ? `${cleanBase}\n\n${tag}` : tag;
}

/**
 * Apply admin standing overrides to auto-calculated group standings rows
 */
export function applyStandingOverrides(
  standings: GroupStandingRow[],
  overridesMap: Record<string, StandingOverride>,
  qualifiersPerGroup: number
): GroupStandingRow[] {
  if (!overridesMap || Object.keys(overridesMap).length === 0) {
    return standings;
  }

  const updatedRows = standings.map((row) => {
    const override = overridesMap[row.participant.id];
    if (!override) return row;

    const played = override.played ?? row.played;
    const wins = override.wins ?? row.wins;
    const draws = override.draws ?? row.draws;
    const losses = override.losses ?? row.losses;
    const goalsFor = override.goalsFor ?? row.goalsFor;
    const goalsAgainst = override.goalsAgainst ?? row.goalsAgainst;
    const goalDifference = override.goalDifference ?? (goalsFor - goalsAgainst);
    const points = override.points ?? row.points;
    const auditLogMessage = `Admin Adjustment: Player ${row.participant.username} adjusted to ${points} PTS (${played} P, ${wins} W, ${draws} D, ${losses} L, ${goalsFor} GF, ${goalsAgainst} GA). Reason: ${override.reason || 'Administrative decision'}`;

    return {
      ...row,
      played,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDifference,
      points,
      isAdminAdjustment: true,
      auditLogMessage,
    };
  });

  // Re-sort deterministically: 1. Position Override, 2. Points, 3. GD, 4. GF, 5. Username
  updatedRows.sort((a, b) => {
    const ovA = overridesMap[a.participant.id]?.positionOverride;
    const ovB = overridesMap[b.participant.id]?.positionOverride;

    if (ovA != null && ovB != null) return ovA - ovB;
    if (ovA != null) return -1;
    if (ovB != null) return 1;

    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.participant.username.localeCompare(b.participant.username);
  });

  // Re-assign positions and labels
  return updatedRows.map((row, idx) => {
    const position = idx + 1;
    const isQualified = position <= qualifiersPerGroup;
    const isLeagueWinner = position === 1;

    let qualificationLabel = isQualified ? 'Qualified for Knockout 🟢' : 'Eliminated 🔴';
    if (position === 1) {
      qualificationLabel = isQualified ? 'League Winner 🏆 (Qualified)' : 'League Winner 🏆';
    }

    return {
      ...row,
      position,
      isQualified,
      isLeagueWinner,
      qualificationLabel,
    };
  });
}
