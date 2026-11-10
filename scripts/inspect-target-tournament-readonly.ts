import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load .env.local
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

const TOURNAMENT_ID = 'f8b4c365-ad14-4ef7-b2aa-8a7d1be93dce';

async function inspect() {
  console.log('================================================================');
  console.log('   PHASE B: PRODUCTION DATABASE INSPECTION (STRICTLY READ-ONLY) ');
  console.log('================================================================\n');

  // 1. Tournament metadata
  const { data: tourney, error: tErr } = await (supabase.from('tournaments') as any)
    .select('*')
    .eq('id', TOURNAMENT_ID)
    .single();

  if (tErr) console.error('Tournament fetch error:', tErr);

  console.log('Tournament Details:');
  console.log(`- ID: ${tourney?.id}`);
  console.log(`- Name: ${tourney?.name}`);
  console.log(`- Format: ${tourney?.format}`);
  console.log(`- Status: ${tourney?.status}`);
  console.log(`- Max Participants: ${tourney?.max_participants}`);
  console.log(`- Confirmed Slots Count: ${tourney?.confirmed_slots_count}`);
  console.log(`- Rules Text: ${tourney?.rules_text ? 'Defined' : 'None'}`);
  console.log(`- Created At: ${tourney?.created_at}`);

  // 2. Participants
  const { data: parts, error: pErr } = await (supabase.from('participants') as any)
    .select('*')
    .eq('tournament_id', TOURNAMENT_ID)
    .order('seed_number', { ascending: true });

  console.log(`\nConfirmed Participants in DB: ${parts?.length}`);

  // Cross-reference with auth.users and profiles
  const userIds = parts?.map((p: any) => p.user_id).filter(Boolean) || [];
  const { data: profiles } = await (supabase.from('profiles') as any)
    .select('id, display_name, email, efootball_id, account_status')
    .in('id', userIds);

  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const authUsersMap = new Map(authData?.users?.map(u => [u.id, u]) || []);
  const profilesMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

  const participantAnalysis = parts?.map((p: any, idx: number) => {
    const authUser = authUsersMap.get(p.user_id);
    const profile = profilesMap.get(p.user_id);
    const email = authUser?.email || 'N/A';
    const isQA = email.includes('@test.internal') || p.username.startsWith('QA Athlete');

    return {
      index: idx + 1,
      participant_id: p.id,
      user_id: p.user_id,
      username: p.username,
      real_name: p.real_name,
      email,
      efootball_id: profile?.efootball_id || 'N/A',
      is_qa_account: isQA,
      status: p.status,
    };
  }) || [];

  const qaCount = participantAnalysis.filter(p => p.is_qa_account).length;
  console.log(`- QA Test Accounts Detected: ${qaCount} of ${parts?.length}`);
  console.log(`- Real Public Competitors: ${parts?.length - qaCount} of ${parts?.length}`);

  // 3. Rounds
  const { data: rounds, error: rErr } = await (supabase.from('rounds') as any)
    .select('*')
    .eq('tournament_id', TOURNAMENT_ID);
  console.log(`\nExisting Rounds in DB: ${rounds?.length}`);

  // 4. Matches
  const roundIds = rounds?.map((r: any) => r.id) || [];
  const { data: matchesByTourney } = await (supabase.from('matches') as any)
    .select('id, status, score_a, score_b, round_id, scheduled_time')
    .eq('tournament_id', TOURNAMENT_ID);

  let matchesByRound: any[] = [];
  if (roundIds.length > 0) {
    const { data: mbr } = await (supabase.from('matches') as any)
      .select('id, status, score_a, score_b, round_id, scheduled_time')
      .in('round_id', roundIds);
    matchesByRound = mbr || [];
  }

  const allMatches = matchesByTourney && matchesByTourney.length > 0 ? matchesByTourney : matchesByRound;
  console.log(`Existing Matches in DB: ${allMatches.length}`);

  const matchStats = {
    total: allMatches.length,
    completed: allMatches.filter((m: any) => m.status === 'completed' || m.status === 'walkover').length,
    pending: allMatches.filter((m: any) => m.status === 'pending' || m.status === 'scheduled').length,
    in_progress: allMatches.filter((m: any) => m.status === 'in_progress' || m.status === 'live').length,
    disputed: allMatches.filter((m: any) => m.status === 'disputed' || m.status === 'result_pending_admin').length,
  };

  console.log('- Completed Matches:', matchStats.completed);
  console.log('- Pending Matches:', matchStats.pending);
  console.log('- In-Progress Matches:', matchStats.in_progress);
  console.log('- Disputed Matches:', matchStats.disputed);

  // 5. Existing Disputes
  const { data: disputes, error: dErr } = await (supabase.from('match_disputes') as any)
    .select('*')
    .eq('tournament_id', TOURNAMENT_ID);
  console.log(`\nExisting Disputes in DB: ${disputes?.length || 0}`);

  // Save report artifact
  const inspectionArtifact = {
    timestamp: new Date().toISOString(),
    tournament_id: TOURNAMENT_ID,
    tournament_metadata: tourney,
    confirmed_participant_count: parts?.length,
    qa_account_count: qaCount,
    is_qa_contaminated: qaCount > 0,
    readiness_flag: qaCount > 0 ? 'NOT READY FOR PUBLIC KICKOFF (QA Contaminated)' : 'READY',
    rounds_count: rounds?.length,
    matches_summary: matchStats,
    disputes_count: disputes?.length || 0,
    participant_details: participantAnalysis,
  };

  fs.writeFileSync('qa/artifacts/production_database_inspection.json', JSON.stringify(inspectionArtifact, null, 2));
  console.log('\n✓ Production database inspection saved to qa/artifacts/production_database_inspection.json');
}

inspect().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
