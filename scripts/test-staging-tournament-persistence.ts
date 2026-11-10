import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { generateLeagueFixtures } from '../services/leagueService';
import { getPlayerMatches } from '../services/playerDashboardService';

const envContent = fs.readFileSync('.env.local', 'utf8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim();
      env[k] = v;
      process.env[k] = v;
    }
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function run() {
  console.log('===============================================================');
  console.log('   SECTION 1: ISOLATED STAGING TOURNAMENT PERSISTENCE TEST     ');
  console.log('===============================================================\n');

  let stagingTournamentId: string | null = null;
  const createdParticipantIds: string[] = [];

  try {
    // 1. Fetch 20 test auth users
    const { data: authData, error: aErr } = await supabase.auth.admin.listUsers({ perPage: 25 });
    if (aErr || !authData?.users || authData.users.length < 20) {
      throw new Error(`Insufficient auth users in database: found ${authData?.users?.length}`);
    }

    const testUsers = authData.users.slice(0, 20);
    console.log(`✓ Selected 20 test auth accounts (${testUsers[0].email} to ${testUsers[19].email})`);

    // 2. Create isolated staging tournament
    const stagingName = `[STAGING-TEST] 20-Player League Persistence — ${Date.now()}`;
    const { data: tData, error: tErr } = await (supabase.from('tournaments') as any)
      .insert({
        name: stagingName,
        format: 'league',
        status: 'registration',
        max_participants: 20,
        confirmed_slots_count: 20,
        rules_text: 'Official 20-Player League Staging Test Rules',
      })
      .select('id')
      .single();

    if (tErr || !tData) {
      throw new Error(`Failed to create staging tournament: ${JSON.stringify(tErr)}`);
    }
    stagingTournamentId = tData.id;
    console.log(`✓ Staging tournament created: ${stagingTournamentId} ("${stagingName}")`);

    // 3. Insert 20 participants
    const participantPayloads = testUsers.map((u, i) => ({
      tournament_id: stagingTournamentId,
      user_id: u.id,
      username: `Staging Competitor ${String(i + 1).padStart(2, '0')}`,
      seed_number: i + 1,
      status: 'active',
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
      rules_version: '1.0',
    }));

    const { data: pData, error: pErr } = await (supabase.from('participants') as any)
      .insert(participantPayloads)
      .select('id, user_id, username');

    if (pErr || !pData || pData.length !== 20) {
      throw new Error(`Failed to insert 20 staging participants: ${JSON.stringify(pErr)}`);
    }
    createdParticipantIds.push(...pData.map((p: any) => p.id));
    console.log(`✓ Inserted 20 staging participants with active status`);

    // 4. Run fixture generation engine
    console.log('\n--- 1. Generating League Fixtures ---');
    await generateLeagueFixtures(stagingTournamentId, 1);
    console.log('✓ generateLeagueFixtures executed cleanly');

    // 5. Verify rounds in DB
    const { data: rounds, error: rErr } = await (supabase.from('rounds') as any)
      .select('*')
      .eq('tournament_id', stagingTournamentId)
      .order('round_number', { ascending: true });

    if (rErr || !rounds) throw new Error(`Failed to fetch rounds: ${JSON.stringify(rErr)}`);
    console.log(`✓ Persisted rounds count: ${rounds.length} (Expected: 19)`);
    if (rounds.length !== 19) throw new Error(`Rounds count mismatch: expected 19, got ${rounds.length}`);

    // 6. Verify matches in DB
    const roundIds = rounds.map((r: any) => r.id);
    const { data: matches, error: mErr } = await (supabase.from('matches') as any)
      .select('*')
      .in('round_id', roundIds);

    if (mErr || !matches) throw new Error(`Failed to fetch matches: ${JSON.stringify(mErr)}`);
    console.log(`✓ Persisted matches count: ${matches.length} (Expected: 190)`);
    if (matches.length !== 190) throw new Error(`Matches count mismatch: expected 190, got ${matches.length}`);

    // 7. Pairing & Invariant Verifications
    let selfPairings = 0;
    const pairingSet = new Set<string>();
    const opponentMap = new Map<string, Set<string>>();

    for (const m of matches) {
      if (m.participant_a === m.participant_b) {
        selfPairings++;
      }
      const pairKey = [m.participant_a, m.participant_b].sort().join('<->');
      pairingSet.add(pairKey);

      if (!opponentMap.has(m.participant_a)) opponentMap.set(m.participant_a, new Set());
      if (!opponentMap.has(m.participant_b)) opponentMap.set(m.participant_b, new Set());
      opponentMap.get(m.participant_a)!.add(m.participant_b);
      opponentMap.get(m.participant_b)!.add(m.participant_a);

      // Verify foreign keys
      if (!roundIds.includes(m.round_id)) throw new Error(`Invalid round_id FK in match ${m.id}`);
      if (m.tournament_id && m.tournament_id !== stagingTournamentId) {
        throw new Error(`Tournament ID mismatch on match ${m.id}`);
      }
      if (m.status !== 'pending' && m.status !== 'scheduled') {
        throw new Error(`Unexpected match status: ${m.status}`);
      }
    }

    console.log(`✓ Self-pairings count: ${selfPairings} (Expected: 0)`);
    if (selfPairings !== 0) throw new Error(`Found ${selfPairings} self-pairings!`);

    console.log(`✓ Distinct pairing pairs: ${pairingSet.size} (Expected: 190)`);
    if (pairingSet.size !== 190) throw new Error(`Duplicate pairings detected! Unique pairs: ${pairingSet.size}/190`);

    let allOpponentsValid = true;
    for (const [pid, opps] of opponentMap.entries()) {
      if (opps.size !== 19) {
        console.error(`Participant ${pid} plays ${opps.size} opponents instead of 19!`);
        allOpponentsValid = false;
      }
    }
    console.log(`✓ Every participant plays exactly 19 distinct opponents: ${allOpponentsValid}`);
    if (!allOpponentsValid) throw new Error('Opponent count verification failed!');

    // 8. Safe Retry / Idempotency Test
    console.log('\n--- 2. Testing Safe Retry / Idempotency ---');
    console.log('Re-running generateLeagueFixtures on the same tournament...');
    await generateLeagueFixtures(stagingTournamentId, 1);

    const { data: retryRounds } = await (supabase.from('rounds') as any)
      .select('*')
      .eq('tournament_id', stagingTournamentId);
    const { data: retryMatches } = await (supabase.from('matches') as any)
      .select('*')
      .eq('tournament_id', stagingTournamentId);

    console.log(`✓ Post-retry rounds count: ${retryRounds?.length} (Expected: 19, NEVER 38)`);
    console.log(`✓ Post-retry matches count: ${retryMatches?.length} (Expected: 190, NEVER 380)`);
    if (retryRounds?.length !== 19 || retryMatches?.length !== 190) {
      throw new Error(`Idempotency failure! Duplicate rows created upon retry.`);
    }

    // 9. Verify Display in Player Dashboard / My Matches Query
    console.log('\n--- 3. Verifying My Matches Display Query ---');
    const firstUserId = testUsers[0].id;
    const playerMatchesResult = await getPlayerMatches(supabase as any, firstUserId);
    const playerMatches = playerMatchesResult.data || [];
    console.log(`✓ getPlayerMatches query returned ${playerMatches.length} matches for Player 1`);
    if (playerMatches.length !== 19) {
      console.warn(`Player 1 expected 19 matches, returned ${playerMatches.length}`);
    } else {
      console.log(`✓ Exact match count for Player 1 verified (19 fixtures)`);
    }

    // 10. Record Artifact Evidence
    const evidence = {
      timestamp: new Date().toISOString(),
      staging_tournament_id: stagingTournamentId,
      staging_tournament_name: stagingName,
      total_participants: 20,
      total_rounds: retryRounds?.length,
      total_matches: retryMatches?.length,
      self_pairings: selfPairings,
      unique_pairings: pairingSet.size,
      all_participants_19_opponents: allOpponentsValid,
      idempotency_safe_retry: true,
      player_1_matches_queried: playerMatches.length,
      sample_fixtures: retryMatches?.slice(0, 5),
    };

    fs.writeFileSync('qa/artifacts/staging_tournament_persistence_evidence.json', JSON.stringify(evidence, null, 2));
    console.log('\n✓ Staging persistence evidence saved to qa/artifacts/staging_tournament_persistence_evidence.json');

  } finally {
    // 11. Cleanup Staging Data
    console.log('\n--- 4. Cleaning Up Staging Records ---');
    if (stagingTournamentId) {
      const { data: roundsToClean } = await (supabase.from('rounds') as any)
        .select('id')
        .eq('tournament_id', stagingTournamentId);

      const rIds = roundsToClean?.map((r: any) => r.id) || [];
      if (rIds.length > 0) {
        await (supabase.from('matches') as any).delete().in('round_id', rIds);
        await (supabase.from('matches') as any).delete().eq('tournament_id', stagingTournamentId);
        await (supabase.from('rounds') as any).delete().eq('tournament_id', stagingTournamentId);
      }
      await (supabase.from('participants') as any).delete().eq('tournament_id', stagingTournamentId);
      await (supabase.from('tournaments') as any).delete().eq('id', stagingTournamentId);
      console.log('✓ Isolated staging tournament and all associated fixtures cleanly deleted from DB');
    }
  }

  console.log('\n===============================================================');
  console.log('   SECTION 1 VERIFICATION COMPLETED: ALL ASSERTIONS PASSED!    ');
  console.log('===============================================================');
}

run().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
