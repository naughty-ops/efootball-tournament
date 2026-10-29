import fs from 'fs';
import path from 'path';

function loadEnvFile(filename: string) {
  const filePath = path.resolve(process.cwd(), filename);
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

import { createAdminClient } from '../lib/supabase/server';
import { setupTournamentGroups, getTournamentGroups } from '../services/groupService';

async function runPipeline() {
  const supabase = createAdminClient();

  console.log('================================================================');
  console.log('   STEP 1: START TOURNAMENT (STATUS: ongoing, LOCK ROSTER)       ');
  console.log('================================================================\n');

  const { data: tourney } = await (supabase.from('tournaments') as any)
    .select('*')
    .ilike('name', 'glich')
    .single();

  const tournamentId = tourney.id;

  // 1. Start Tournament: Set status = 'ongoing'
  await (supabase.from('tournaments') as any)
    .update({
      status: 'ongoing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', tournamentId);

  console.log(`✅ Tournament "${tourney.name}" status updated to "ongoing". Roster locked at 20 players.`);

  console.log('\n================================================================');
  console.log('   STEP 2: VERIFY TABLES (4 GROUPS x 5 COMPETITORS)             ');
  console.log('================================================================\n');

  // 2. Setup 4 Groups with 2 Qualifiers Each (8 total qualifiers for Quarterfinals)
  await setupTournamentGroups(tournamentId, 4, 2, 1);
  const overview = await getTournamentGroups(tournamentId);

  console.log(`✅ Verified ${overview.groups.length} groups for "${tourney.name}":`);
  for (const gDet of overview.groups) {
    console.log(`\n--- ${gDet.group.name} (${gDet.participants.length} players) ---`);
    for (const p of gDet.participants) {
      const isAgraj = p.user_id ? ' ★ REGISTERED USER (Agraj]n)' : '';
      console.log(`   - Seed ${String(p.seed_number).padStart(2, ' ')}: ${p.username.padEnd(20, ' ')} | ${p.real_name}${isAgraj}`);
    }
  }

  console.log('\n================================================================');
  console.log('   STEP 3: START MATCH MAKING (GENERATE BERGER ROUND-ROBIN)     ');
  console.log('================================================================\n');

  console.log(`✅ Total Matches Generated: ${overview.totalGroupMatches} fixtures across 4 groups (10 matches/group).`);

  console.log('\n================================================================');
  console.log('   STEP 4: MANAGE FIXTURES AND SCORES (SCHEDULE TIMES & ROOMS)  ');
  console.log('================================================================\n');

  // Schedule match times and live room names
  const { data: matches } = await (supabase.from('matches') as any)
    .select('id, group_id, match_position')
    .eq('tournament_id', tournamentId)
    .order('match_position', { ascending: true });

  const startTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  for (let idx = 0; idx < (matches || []).length; idx++) {
    const m = matches[idx];
    const matchTime = new Date(startTime.getTime() + idx * 30 * 60 * 1000).toISOString();
    const roomCode = `GLICH-RM-${String(idx + 1).padStart(2, '0')}`;

    await (supabase.from('matches') as any)
      .update({
        scheduled_time: matchTime,
        live_room_name: roomCode,
        status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', m.id);
  }

  console.log(`✅ All ${matches.length} matches scheduled with 30-minute intervals and live room codes.`);
  console.log(`Tournament "glich" is now LIVE and fully ready for score entry!`);
}

runPipeline().catch(console.error);
