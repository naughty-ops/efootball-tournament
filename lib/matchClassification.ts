export interface MatchClassificationContext {
  group_id?: string | null;
  stageType?: string | null;
  round_name?: string | null;
  tournament_format?: string | null;
}

/**
 * Authoritatively determines whether a match is a Knockout match.
 * League and Group stage matches are NOT knockout matches.
 */
export function isKnockoutMatch(ctx: MatchClassificationContext): boolean {
  // 1. If match belongs to a group, it is a Group/League match (NOT knockout)
  if (ctx.group_id != null) return false;

  // 2. If tournament format is explicitly 'league', it is a League match (NOT knockout)
  if (ctx.tournament_format === 'league') return false;

  // 3. If tournament format is explicitly 'knockout', it is a Knockout match
  if (ctx.tournament_format === 'knockout') return true;

  // 4. Check stageType / round_name text if available
  const stage = (ctx.stageType || ctx.round_name || '').toLowerCase();
  if (stage.includes('group') || stage.includes('matchday') || stage.includes('league')) {
    return false;
  }
  if (
    stage.includes('final') ||
    stage.includes('quarter') ||
    stage.includes('semi') ||
    stage.includes('knockout') ||
    stage.includes('round of') ||
    stage.includes('bracket') ||
    stage.includes('playoff')
  ) {
    return true;
  }

  // 5. Fallback for hybrid formats (group_knockout, single_league_knockout):
  // If group_id is null and format is not league, it is part of the knockout phase.
  return ctx.tournament_format !== 'league';
}

/**
 * Authoritatively determines whether a match is a League/Group match.
 */
export function isLeagueOrGroupMatch(ctx: MatchClassificationContext): boolean {
  return !isKnockoutMatch(ctx);
}
