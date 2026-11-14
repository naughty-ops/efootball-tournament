import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
const env: Record<string, string> = {};
for (const line of envContent.split(/\r?\n/)) {
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

async function run() {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 50 });
  if (error) {
    console.error('Error listing users:', error);
    return;
  }
  console.log(`Found ${data.users.length} users:`);
  for (const u of data.users) {
    console.log(`- ${u.email} (confirmed: ${!!u.email_confirmed_at}, last_sign_in: ${u.last_sign_in_at})`);
  }
}

run();
