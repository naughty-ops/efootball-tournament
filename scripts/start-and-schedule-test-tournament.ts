/**
 * Start Tournament & Schedule All Matches: ENGINE TEST CUP — 20 PLAYERS
 * 
 * 1. Verifies tournament exists and loads all 21 confirmed participants (20 dummy + 1 real user).
 * 2. Uses the Tournament Core Engine to create 4 Groups (A, B, C, D) using fair Snake draft distribution.
 * 3. Generates round-robin fixtures using the core Berger pairing engine.
 * 4. Schedules every match with appropriate timestamps (staggered time slots) and live room names.
 * 5. Sets match status to 'ready' for active competition.
 * 6. Ensures tournament status is 'ongoing'.
 */

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
import {
  distributeParticipantsSnake,
  generateGroupNames,
  generateGroupPairings,
  type RoundRobinPairing,
} from '../lib/group/groupEngine';
import type { Participant } from '../types/database';

async function main() {
  console.log('================================================================');
  console.log('   STARTING & SCHEDULING: ENGINE TEST CUP — 20 PLAYERS          ');
  console.log('================================================================\n');

  const supabase = createAdminClient();
  const TOURNAMENT_NAME = 'ENGINE TEST CUP — 20 PLAYERS';

  // 1. Fetch tournament
  const { data: tourney, error: tErr } = await (supabase.from('tournaments') as any)
    .select('*')
    .eq('name', TOURNAMENT_NAME)
    .single();

  if (tErr || !tourney) {
    throw new Error(`Tournament "${TOURNAMENT_NAME}" not found: ${tErr?.message}`);
  }

  const tournamentId = tourney.id;
  console.log(`[Tournament Found] ID: ${tournamentId}, Current Status: ${tourney.status}`);

  // 2. Fetch all participants
  const { data: participants, error: pErr } = await (supabase.from('participants') as any)
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('seed_number', { ascending: true, nullsFirst: false });

  if (pErr || !participants || participants.length < 4) {
    throw new Error(`Insufficient participants found: ${participants?.length || 0}`);
  }

  console.log(`[Participants Loaded] Total: ${participants.length} participants`);
  for (const p of participants) {
    console.log(`   - Seed ${p.seed_number ?? 'U'}: ${p.username} (${p.real_name})`);
  }

  // 3. Clean up any existing draft groups/matches if previously empty
  const { data: existingGroups } = await (supabase.from('groups') as any)
    .select('id')
    .eq('tournament_id', tournamentId);

  if (existingGroups && existingGroups.length > 0) {
    const groupIds = existingGroups.map((g: any) => g.id);
    await (supabase.from('matches') as any).delete().in('group_id', groupIds);
    await (supabase.from('group_participants') as any).delete().in('group_id', groupIds);
    await (supabase.from('groups') as any).delete().eq('tournament_id', tournamentId);
    await (supabase.from('rounds') as any).delete().eq('tournament_id', tournamentId);
    console.log(`[Cleanup] Reset ${existingGroups.length} existing groups/rounds`);
  }

  // 4. Setup 4 Groups (A, B, C, D)
  const groupCount = 4;
  const qualifiersPerGroup = 2;
  const roundsPerPair = 1;

  const groupNames = generateGroupNames(groupCount);
  const groupPayloads = groupNames.map((name) => ({
    tournament_id: tournamentId,
    name,
  }));

  const { data: createdGroups, error: gErr } = await (supabase.from('groups') as any)
    .insert(groupPayloads)
    .select('*');

  if (gErr || !createdGroups) {
    throw new Error(`Failed to create groups: ${gErr?.message}`);
  }

  const sortedGroups = createdGroups.sort((a: any, b: any) => a.name.localeCompare(b.name));
  console.log(`\n[Groups Created] ${sortedGroups.map((g: any) => g.name).join(', ')}`);

  // 5. Snake draft distribution
  const distributedParticipants = distributeParticipantsSnake(participants as Participant[], groupCount);

  const groupParticipantInserts: any[] = [];
  const allPairings: { groupId: string; groupName: string; pairing: RoundRobinPairing }[] = [];

  for (let i = 0; i < sortedGroups.length; i++) {
    const groupObj = sortedGroups[i];
    const gParticipants = distributedParticipants[i] || [];

    console.log(`\n--- ${groupObj.name} (${gParticipants.length} Players) ---`);
    for (const p of gParticipants) {
      console.log(`  • ${p.username} (${p.real_name})`);
      groupParticipantInserts.push({
        group_id: groupObj.id,
        participant_id: p.id,
      });
    }

    const pairings = generateGroupPairings(gParticipants, roundsPerPair);
    for (const pairing of pairings) {
      allPairings.push({
        groupId: groupObj.id,
        groupName: groupObj.name,
        pairing,
      });
    }
  }

  // Insert group participants
  const { error: gpErr } = await (supabase.from('group_participants') as any).insert(groupParticipantInserts);
  if (gpErr) {
    throw new Error(`Failed to insert group participants: ${gpErr.message}`);
  }

  // 6. Create Round 1 in rounds table
  const { data: createdRound, error: rErr } = await (supabase.from('rounds') as any)
    .insert({
      tournament_id: tournamentId,
      round_number: 1,
      name: 'Group Stage Round 1',
    })
    .select('*')
    .single();

  if (rErr || !createdRound) {
    throw new Error(`Failed to create round: ${rErr?.message}`);
  }

  const roundId = createdRound.id;
  console.log(`\n[Round Created] ID: ${roundId}, Name: ${createdRound.name}`);

  // 7. Schedule all matches with realistic, staggered appropriate times
  // Starting today at 16:00 UTC (or next whole hour)
  const baseTime = new Date();
  baseTime.setMinutes(0, 0, 0);
  baseTime.setHours(baseTime.getHours() + 1); // 1 hour from now

  console.log(`\n[Generating & Scheduling ${allPairings.length} Matches]`);
  console.log(`   Base Schedule Start: ${baseTime.toISOString()}`);

  // Order pairings by group & match position for clear sequential scheduling
  allPairings.sort((a, b) => {
    if (a.pairing.matchPosition !== b.pairing.matchPosition) {
      return a.pairing.matchPosition - b.pairing.matchPosition;
    }
    return a.groupName.localeCompare(b.groupName);
  });

  const matchPayloads = allPairings.map(({ groupId, groupName, pairing }, index) => {
    // Stagger matches by 30-minute intervals
    const matchTime = new Date(baseTime.getTime() + index * 30 * 60 * 1000);
    const roomName = `ROOM-${groupName}${String(pairing.matchPosition).padStart(2, '0')}`;

    return {
      round_id: roundId,
      group_id: groupId,
      match_position: pairing.matchPosition,
      participant_a: pairing.participantA.id,
      participant_b: pairing.participantB.id,
      scheduled_time: matchTime.toISOString(),
      live_room_name: roomName,
      status: 'ready', // Both participants are assigned, match is ready to play
      score_a: 0,
      score_b: 0,
    };
  });

  const { data: insertedMatches, error: mErr } = await (supabase.from('matches') as any)
    .insert(matchPayloads)
    .select('id, match_position, scheduled_time, live_room_name, status');

  if (mErr) {
    throw new Error(`Failed to insert matches: ${mErr.message}`);
  }

  console.log(`[Matches Created & Scheduled] Successfully scheduled ${insertedMatches?.length || 0} fixtures!`);

  // 8. Update Tournament Status to 'ongoing' and update participant/slot counters
  const { error: updErr } = await (supabase.from('tournaments') as any)
    .update({
      status: 'ongoing',
      confirmed_slots_count: participants.length,
      reserved_slots_count: 0,
      qualifiers_per_group: qualifiersPerGroup,
      rounds_per_pair: roundsPerPair,
      is_group_stage_finalized: false,
      start_date: baseTime.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', tournamentId);

  if (updErr) {
    throw new Error(`Failed to update tournament: ${updErr.message}`);
  }

  console.log(`\n[Tournament Started] Status updated to 'ongoing'.`);
  console.log('================================================================');
  console.log('   SCHEDULE OVERVIEW (FIRST 10 FIXTURES)                         ');
  console.log('================================================================');

  for (let i = 0; i < Math.min(10, matchPayloads.length); i++) {
    const m = matchPayloads[i];
    const pA = participants.find((p: any) => p.id === m.participant_a);
    const pB = participants.find((p: any) => p.id === m.participant_b);
    console.log(
      `Match ${i + 1} [${m.live_room_name}] | ${m.scheduled_time} | Status: ${m.status}`
    );
    console.log(`   ${pA?.username} (${pA?.real_name}) vs ${pB?.username} (${pB?.real_name})\n`);
  }

  console.log(`... and ${matchPayloads.length - 10} more matches scheduled.`);
  console.log('================================================================');
  console.log('ALL FIXTURES GENERATED AND SCHEDULED SUCCESSFULLY! ✅');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
