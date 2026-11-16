import fs from 'fs';

// Parse .env.local into process.env
if (fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import { createClient } from '../lib/supabase/server';
import { getPlayerProfile, getPlayerMatches, getPlayerTournaments } from '../services/playerDashboardService';
import { getPlayerWalletOverview } from '../services/walletService';

async function timeOperation<T>(name: string, fn: () => Promise<T>): Promise<{ name: string; durationMs: number; result: T }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - start);
  return { name, durationMs, result };
}

async function runDiagnosis() {
  console.log('================================================================');
  console.log('   DEEP DIVE INVESTIGATION: QUERY TIMINGS & WATERFALLS         ');
  console.log('================================================================\n');

  const supabase = await createClient();

  // 1. ADMIN DASHBOARD QUERIES DECONSTRUCTION
  console.log('--- PHASE 1: ADMIN DASHBOARD QUERIES ---');
  
  // A. Admin check (admin_users)
  const tAdminRecord = await timeOperation('1. Admin Record Check (admin_users by email)', async () => {
    return supabase.from('admin_users').select('id, role').limit(1);
  });
  console.log(`[Admin] ${tAdminRecord.name}: ${tAdminRecord.durationMs}ms`);

  // B. Layout Ticket Stats (support_tickets full read & match_disputes full read)
  const tTicketStats = await timeOperation('2. Ticket Overview Stats (support_tickets + match_disputes)', async () => {
    const { createAdminClient } = await import('../lib/supabase/admin');
    const adminClient = createAdminClient();
    return Promise.all([
      adminClient.from('support_tickets').select('id, status, priority, assigned_admin_id, created_at, updated_at'),
      adminClient.from('match_disputes').select('id, status, priority, assigned_admin_id, created_at, updated_at'),
    ]);
  });
  console.log(`[Admin] ${tTicketStats.name}: ${tTicketStats.durationMs}ms`);

  // C. Platform-wide counts (tournaments, participants, matches)
  const tCounts = await timeOperation('3. Platform Counts (tournaments, participants, matches)', async () => {
    return Promise.all([
      supabase.from('tournaments').select('*', { count: 'exact', head: true }),
      supabase.from('participants').select('*', { count: 'exact', head: true }),
      supabase.from('matches').select('*', { count: 'exact', head: true }),
    ]);
  });
  console.log(`[Admin] ${tCounts.name}: ${tCounts.durationMs}ms`);

  // D. Client Verification Stats Action (5 count queries on profiles)
  const tVerifStats = await timeOperation('4. Client Verification Stats (5 profile count queries)', async () => {
    return Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('whatsapp_verified', true),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).or('whatsapp_verified.eq.false,efootball_id_verified.eq.false'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).or('whatsapp_verification_status.eq.rejected,efootball_verification_status.eq.rejected'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).in('account_status', ['suspended', 'disabled']),
    ]);
  });
  console.log(`[Admin] ${tVerifStats.name}: ${tVerifStats.durationMs}ms`);

  // E. Client Verification Queue Action (profiles pagination query with count)
  const tVerifQueue = await timeOperation('5. Client Verification Queue (profiles range + count)', async () => {
    return supabase.from('profiles').select('*', { count: 'exact' }).range(0, 19).order('created_at', { ascending: false });
  });
  console.log(`[Admin] ${tVerifQueue.name}: ${tVerifQueue.durationMs}ms`);

  const adminCumulative = tAdminRecord.durationMs + tTicketStats.durationMs + tCounts.durationMs + tVerifStats.durationMs + tVerifQueue.durationMs;
  console.log(`-> Cumulative Admin Supabase Time (if sequential): ${adminCumulative}ms\n`);

  // 2. MATCHES PAGE QUERIES DECONSTRUCTION
  console.log('--- PHASE 2: MATCHES PAGE QUERIES ---');

  const { data: sampleParticipant } = await supabase.from('participants').select('user_id').not('user_id', 'is', null).limit(1).single();
  const testUserId = sampleParticipant?.user_id || '4426a75f-22ec-4f27-a006-25f385c4bf2a';
  console.log(`Using sample user_id for matches test: ${testUserId}`);

  // A. Profile lookup
  const tProfile = await timeOperation('1. Player Profile Query (profiles table)', async () => {
    return supabase.from('profiles').select('*').eq('id', testUserId).single();
  });
  console.log(`[Matches] ${tProfile.name}: ${tProfile.durationMs}ms`);

  // B. User participant IDs lookup
  const tUserPart = await timeOperation('2. User Participants Query (participants table)', async () => {
    return supabase.from('participants').select('id, tournament_id').eq('user_id', testUserId);
  });
  console.log(`[Matches] ${tUserPart.name}: ${tUserPart.durationMs}ms`);

  const participantIds = (tUserPart.result.data || []).map((p: any) => p.id);
  console.log(`Found ${participantIds.length} participant records for user`);

  if (participantIds.length > 0) {
    const orFilter = `participant_a.in.(${participantIds.join(',')}),participant_b.in.(${participantIds.join(',')})`;
    
    // C. Matches dual queries
    const tMatches = await timeOperation('3. Matches Dual Queries (active + completed in parallel)', async () => {
      return Promise.all([
        supabase.from('matches').select('id, round_id, tournament_id, participant_a, participant_b, scheduled_time, status').or(orFilter).limit(50),
        supabase.from('matches').select('id, round_id, tournament_id, participant_a, participant_b, scheduled_time, status').or(orFilter).limit(50),
      ]);
    });
    console.log(`[Matches] ${tMatches.name}: ${tMatches.durationMs}ms`);

    // D. Opponent Participants Lookup
    const tOppParts = await timeOperation('4. Opponents Participant Query', async () => {
      return supabase.from('participants').select('id, user_id, username, real_name').limit(10);
    });
    console.log(`[Matches] ${tOppParts.name}: ${tOppParts.durationMs}ms`);

    // E. Opponent Profiles Lookup
    const tOppProfiles = await timeOperation('5. Opponents Profile Query', async () => {
      return supabase.from('profiles').select('id, display_name, efootball_id, whatsapp_number').limit(10);
    });
    console.log(`[Matches] ${tOppProfiles.name}: ${tOppProfiles.durationMs}ms`);

    const matchesCumulative = tProfile.durationMs + tUserPart.durationMs + tMatches.durationMs + tOppParts.durationMs + tOppProfiles.durationMs;
    console.log(`-> Cumulative Matches Supabase Time: ${matchesCumulative}ms\n`);
  } else {
    console.log('Testing getPlayerMatches directly...');
    const tDirect = await timeOperation('Direct getPlayerMatches execution', async () => {
      return getPlayerMatches(supabase, testUserId);
    });
    console.log(`[Matches] Direct getPlayerMatches: ${tDirect.durationMs}ms`);
  }

  // 3. OVERVIEW DASHBOARD QUERIES
  console.log('--- OVERVIEW DASHBOARD: getPlayerTournaments & getPlayerWalletOverview ---');
  const tTourneys = await timeOperation('getPlayerTournaments', async () => {
    return getPlayerTournaments(supabase, testUserId);
  });
  console.log(`[Dashboard] ${tTourneys.name}: ${tTourneys.durationMs}ms`);

  const tWallet = await timeOperation('getPlayerWalletOverview', async () => {
    return getPlayerWalletOverview(testUserId, supabase);
  });
  console.log(`[Dashboard] ${tWallet.name}: ${tWallet.durationMs}ms`);
}

runDiagnosis().catch(console.error);
