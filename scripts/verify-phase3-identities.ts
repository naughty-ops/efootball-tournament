import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const TOURNAMENT_ID = 'f8b4c365-ad14-4ef7-b2aa-8a7d1be93dce';

async function run() {
  console.log('🔍 Inspecting Participants for Tournament:', TOURNAMENT_ID);
  const { data: participants, error: pErr } = await supabase
    .from('participants')
    .select('*')
    .eq('tournament_id', TOURNAMENT_ID)
    .order('created_at', { ascending: true });

  if (pErr) {
    console.error('Error fetching participants:', pErr);
    return;
  }

  console.log(`Found ${participants.length} participants.`);

  // Get all auth users
  const { data: authData, error: aErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (aErr) {
    console.error('Error fetching auth users:', aErr);
    return;
  }

  const authUsersById = new Map(authData.users.map(u => [u.id, u]));
  console.log(`Total auth users in Supabase: ${authData.users.length}`);

  // Fetch profiles
  const userIds = participants.map(p => p.user_id).filter(Boolean);
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, display_name, email, efootball_id, account_status')
    .in('id', userIds);

  if (profErr) {
    console.error('Error fetching profiles:', profErr);
  }

  const profilesById = new Map(profiles?.map(p => [p.id, p]) || []);

  const report = [];

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const authUser = authUsersById.get(p.user_id);
    const profile = profilesById.get(p.user_id);

    report.push({
      index: i + 1,
      participant_id: p.id,
      user_id: p.user_id,
      display_name: profile?.display_name || p.username,
      efootball_id: profile?.efootball_id || p.efootball_id,
      has_profile: !!profile,
      has_auth_user: !!authUser,
      auth_email: authUser?.email || 'N/A',
      auth_confirmed_at: authUser?.email_confirmed_at ? 'YES' : 'NO',
      account_status: profile?.account_status || 'unknown',
      participant_status: p.status,
    });
  }

  console.table(report);

  const distinctUsers = new Set(participants.map(p => p.user_id));
  const distinctEmails = new Set(report.map(r => r.auth_email));
  const distinctEfootballIds = new Set(report.map(r => r.efootball_id));

  console.log('--- VALIDATION SUMMARY ---');
  console.log('Distinct user_ids in participants:', distinctUsers.size, '/ 20');
  console.log('Distinct confirmed emails:', distinctEmails.size, '/ 20');
  console.log('Distinct eFootball IDs:', distinctEfootballIds.size, '/ 20');
  console.log('Profiles matched:', report.filter(r => r.has_profile).length, '/ 20');
  console.log('Auth accounts matched:', report.filter(r => r.has_auth_user).length, '/ 20');

  // Output JSON report
  fs.writeFileSync('qa/artifacts/phase3_participant_identities.json', JSON.stringify({
    tournament_id: TOURNAMENT_ID,
    total_participants: participants.length,
    distinct_user_ids: distinctUsers.size,
    distinct_emails: distinctEmails.size,
    distinct_efootball_ids: distinctEfootballIds.size,
    profiles_matched: report.filter(r => r.has_profile).length,
    auth_accounts_matched: report.filter(r => r.has_auth_user).length,
    participants: report
  }, null, 2));

  console.log('✅ Identity audit successfully saved to qa/artifacts/phase3_participant_identities.json');
}

run();
