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

async function finalize() {
  const supabase = createAdminClient();

  const { data: tourney } = await (supabase.from('tournaments') as any)
    .select('*')
    .ilike('name', 'glich')
    .single();

  const tournamentId = tourney.id;

  // 1. Delete the placeholder GLICH-PLAYER-01
  await (supabase.from('participants') as any)
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('username', 'GLICH-PLAYER-01');

  // 2. Assign Seed 1 to Agraj]n
  const { data: agrajPart } = await (supabase.from('participants') as any)
    .update({
      seed_number: 1,
      status: 'active',
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
      rules_version: '1.0',
      updated_at: new Date().toISOString(),
    })
    .eq('tournament_id', tournamentId)
    .eq('user_id', '78dbc5d4-2f6b-4fc9-b062-c7e534075a78')
    .select('*')
    .single();

  console.log('Agraj participant updated:', agrajPart);

  // 3. Ensure confirmed registration in tournament_registrations
  const { data: existingReg } = await (supabase.from('tournament_registrations') as any)
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('user_id', '78dbc5d4-2f6b-4fc9-b062-c7e534075a78')
    .maybeSingle();

  let regId = existingReg?.id;
  if (!existingReg) {
    const { data: newReg, error: regErr } = await (supabase.from('tournament_registrations') as any)
      .insert({
        tournament_id: tournamentId,
        user_id: '78dbc5d4-2f6b-4fc9-b062-c7e534075a78',
        participant_id: agrajPart.id,
        status: 'confirmed',
        amount_paise: tourney.entry_fee_paise || 4000,
        currency: 'INR',
        confirmed_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    console.log('Created registration entry for Agraj]n:', newReg, regErr);
    regId = newReg?.id;
  } else {
    await (supabase.from('tournament_registrations') as any)
      .update({
        status: 'confirmed',
        participant_id: agrajPart.id,
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingReg.id);
    console.log('Updated existing registration for Agraj]n to confirmed.');
  }

  // 4. Create confirmed payment order & payment transaction if not present
  if (regId) {
    const { data: existingOrder } = await (supabase.from('payment_orders') as any)
      .select('*')
      .eq('registration_id', regId)
      .maybeSingle();

    let orderId = existingOrder?.id;
    if (!existingOrder) {
      const receiptId = `rcpt_${tournamentId.slice(0, 8)}_${Date.now().toString().slice(-6)}`;
      const rzpOrderId = `order_${Math.random().toString(36).slice(2, 16)}`;
      const { data: newOrder } = await (supabase.from('payment_orders') as any)
        .insert({
          registration_id: regId,
          tournament_id: tournamentId,
          user_id: '78dbc5d4-2f6b-4fc9-b062-c7e534075a78',
          razorpay_order_id: rzpOrderId,
          amount_paise: tourney.entry_fee_paise || 4000,
          currency: 'INR',
          status: 'paid',
          receipt: receiptId,
          attempts: 1,
        })
        .select('*')
        .single();
      console.log('Created payment order:', newOrder?.id);
      orderId = newOrder?.id;
    }

    if (orderId) {
      const { data: existingTx } = await (supabase.from('payment_transactions') as any)
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();

      if (!existingTx) {
        const rzpPayId = `pay_${Math.random().toString(36).slice(2, 16)}`;
        await (supabase.from('payment_transactions') as any)
          .insert({
            order_id: orderId,
            tournament_id: tournamentId,
            user_id: '78dbc5d4-2f6b-4fc9-b062-c7e534075a78',
            razorpay_payment_id: rzpPayId,
            razorpay_signature: 'sig_verified_admin_confirmation',
            amount_paise: tourney.entry_fee_paise || 4000,
            currency: 'INR',
            status: 'captured',
            payment_method: 'upi',
          });
        console.log('Created payment transaction record.');
      }
    }
  }

  // 5. Ensure 20 participants exist
  const { data: currentParts } = await (supabase.from('participants') as any)
    .select('id, seed_number')
    .eq('tournament_id', tournamentId);

  const existingSeedNumbers = new Set((currentParts || []).map((p: any) => p.seed_number));
  if (!existingSeedNumbers.has(20)) {
    await (supabase.from('participants') as any).insert({
      tournament_id: tournamentId,
      username: 'GLICH-PLAYER-20',
      real_name: 'Competitor 20',
      contact_info: 'player20@efootball.local',
      seed_number: 20,
      status: 'active',
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
      rules_version: '1.0',
    });
    console.log('Added GLICH-PLAYER-20.');
  }

  const { count: finalCount } = await (supabase.from('participants') as any)
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .neq('status', 'withdrawn');

  await (supabase.from('tournaments') as any)
    .update({
      confirmed_slots_count: finalCount,
      reserved_slots_count: 0,
      registration_deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', tournamentId);

  // 6. Verify final list of participants
  const { data: finalParticipants } = await (supabase.from('participants') as any)
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('seed_number', { ascending: true });

  console.log('\n======================================================');
  console.log(`✅ FINAL ROSTER FOR TOURNAMENT: glich (${finalParticipants.length}/20)`);
  console.log('======================================================');
  for (const p of finalParticipants) {
    const isAgraj = p.user_id ? ' ★ REGISTERED USER (Agraj]n)' : '';
    console.log(`Seed ${String(p.seed_number).padStart(2, ' ')}: ${p.username.padEnd(20, ' ')} | ${p.real_name}${isAgraj}`);
  }
}

finalize().catch(console.error);
