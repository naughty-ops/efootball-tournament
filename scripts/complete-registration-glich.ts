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

async function completeGlichRegistration() {
  console.log('================================================================');
  console.log('   COMPLETING REGISTRATION FOR TOURNAMENT: glich                ');
  console.log('================================================================\n');

  const supabase = createAdminClient();

  // 1. Fetch tournament
  const { data: tourneys, error: tErr } = await (supabase.from('tournaments') as any)
    .select('*')
    .ilike('name', 'glich');

  if (tErr || !tourneys || tourneys.length === 0) {
    throw new Error(`Tournament "glich" not found: ${tErr?.message}`);
  }

  const tournament = tourneys[0];
  const tournamentId = tournament.id;
  console.log(`[Tournament Found] ID: ${tournamentId}`);
  console.log(`   Name: ${tournament.name}`);
  console.log(`   Format: ${tournament.format}`);
  console.log(`   Max Participants: ${tournament.max_participants}`);
  console.log(`   Current Status: ${tournament.status}`);
  console.log(`   Confirmed Slots: ${tournament.confirmed_slots_count}`);

  // 2. Extend registration deadline to a future date
  const futureDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error: deadlineErr } = await (supabase.from('tournaments') as any)
    .update({
      registration_deadline: futureDeadline,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tournamentId);

  if (deadlineErr) {
    console.warn('Could not update deadline:', deadlineErr);
  } else {
    console.log(`✅ Registration deadline extended to: ${futureDeadline}`);
  }

  // 3. Check existing participants
  const { data: existingParticipants, error: pErr } = await (supabase.from('participants') as any)
    .select('*')
    .eq('tournament_id', tournamentId);

  if (pErr) {
    throw new Error(`Error fetching existing participants: ${pErr.message}`);
  }

  console.log(`[Current Participants in DB]: ${existingParticipants?.length || 0}`);
  for (const p of existingParticipants || []) {
    console.log(`   - ${p.username} (${p.real_name || 'N/A'}) [User: ${p.user_id || 'None'}, Seed: ${p.seed_number ?? 'None'}]`);
  }

  // Assign seed 1 to Agraj]n if not set
  const agrajn = (existingParticipants || []).find((p: any) => p.user_id === '78dbc5d4-2f6b-4fc9-b062-c7e534075a78');
  if (agrajn && !agrajn.seed_number) {
    await (supabase.from('participants') as any)
      .update({ seed_number: 1, updated_at: new Date().toISOString() })
      .eq('id', agrajn.id);
    agrajn.seed_number = 1;
    console.log('✅ Assigned Seed 1 to Agraj]n.');
  }

  // 4. Ensure confirmed tournament_registrations entry for Agraj]n
  if (agrajn) {
    const { data: regCheck } = await (supabase.from('tournament_registrations') as any)
      .select('id, status')
      .eq('tournament_id', tournamentId)
      .eq('user_id', agrajn.user_id)
      .maybeSingle();

    if (!regCheck) {
      const { data: newReg, error: regErr } = await (supabase.from('tournament_registrations') as any)
        .insert({
          tournament_id: tournamentId,
          user_id: agrajn.user_id,
          participant_id: agrajn.id,
          status: 'confirmed',
          amount_paise: tournament.entry_fee_paise || 4000,
          currency: 'INR',
          confirmed_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (regErr) {
        console.warn('Warning creating registration record for Agraj]n:', regErr);
      } else {
        console.log(`✅ Created confirmed registration record for Agraj]n (${newReg.id}).`);
      }
    } else if (regCheck.status !== 'confirmed') {
      await (supabase.from('tournament_registrations') as any)
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          participant_id: agrajn.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', regCheck.id);
      console.log(`✅ Updated existing registration record to confirmed for Agraj]n.`);
    } else {
      console.log(`✅ Agraj]n already has a confirmed registration record.`);
    }
  }

  // 5. Fill remaining slots to reach max_participants (20)
  const maxSlots = tournament.max_participants || 20;
  const currentCount = (existingParticipants || []).length;
  const slotsNeeded = Math.max(0, maxSlots - currentCount);

  console.log(`\n[Slots Needed]: ${slotsNeeded} participants to reach full roster of ${maxSlots}.`);

  if (slotsNeeded > 0) {
    // Collect existing seeds
    const existingSeeds = new Set((existingParticipants || []).map((p: any) => p.seed_number).filter(Boolean));
    const newParticipants: any[] = [];

    let seedCandidate = 1;
    for (let i = 1; i <= slotsNeeded; i++) {
      while (existingSeeds.has(seedCandidate)) {
        seedCandidate++;
      }
      existingSeeds.add(seedCandidate);

      const paddedNum = String(seedCandidate).padStart(2, '0');
      const seedVal = seedCandidate;

      newParticipants.push({
        tournament_id: tournamentId,
        username: `GLICH-PLAYER-${paddedNum}`,
        real_name: `Competitor ${paddedNum}`,
        contact_info: `player${paddedNum}@efootball.local`,
        seed_number: seedVal,
        status: 'active',
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        rules_version: '1.0',
      });
    }

    const { data: insertedParts, error: insErr } = await (supabase.from('participants') as any)
      .insert(newParticipants)
      .select('*');

    if (insErr) {
      throw new Error(`Failed to insert batch participants: ${insErr.message}`);
    }

    console.log(`✅ Successfully added ${insertedParts.length} participants to "glich".`);
  }

  // 6. Synchronize tournament slot counts
  const { count: finalParticipantCount } = await (supabase.from('participants') as any)
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .neq('status', 'withdrawn');

  const { error: syncErr } = await (supabase.from('tournaments') as any)
    .update({
      confirmed_slots_count: finalParticipantCount ?? maxSlots,
      reserved_slots_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tournamentId);

  if (syncErr) {
    console.error('Error syncing tournament slots count:', syncErr);
  } else {
    console.log(`✅ Synced confirmed_slots_count to ${finalParticipantCount} (Reserved: 0).`);
  }

  // 7. Verify final roster and tournament status
  const { data: finalParticipants } = await (supabase.from('participants') as any)
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('seed_number', { ascending: true });

  const { data: updatedTourney } = await (supabase.from('tournaments') as any)
    .select('*')
    .eq('id', tournamentId)
    .single();

  console.log('\n================================================================');
  console.log(`🎉 REGISTRATION COMPLETE FOR "${updatedTourney.name}"`);
  console.log(`   Capacity: ${finalParticipants?.length} / ${updatedTourney.max_participants}`);
  console.log(`   Confirmed Slots Count: ${updatedTourney.confirmed_slots_count}`);
  console.log(`   Reserved Slots Count: ${updatedTourney.reserved_slots_count}`);
  console.log(`   Registration Deadline: ${updatedTourney.registration_deadline}`);
  console.log(`   Status: ${updatedTourney.status}`);
  console.log('================================================================\n');

  console.log('Final Roster:');
  for (const p of finalParticipants || []) {
    console.log(`   Seed ${String(p.seed_number ?? 'U').padStart(2, ' ')}: ${p.username.padEnd(20, ' ')} | ${p.real_name || 'N/A'} ${p.user_id ? '(User: Agraj]n)' : ''}`);
  }
}

completeGlichRegistration().catch((err) => {
  console.error('Registration completion failed:', err);
  process.exit(1);
});
