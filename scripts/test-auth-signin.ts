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
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, anonKey);

async function checkPass(email: string, pass: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
  if (error) {
    console.log(`Failed for ${email} with pass "${pass}": ${error.message}`);
    return false;
  }
  console.log(`SUCCESS for ${email} with pass "${pass}"! Session token acquired.`);
  return true;
}

async function run() {
  const passwords = [
    'QaPassword2026!#01',
    'TestPassword123!',
    'Password123!',
    'password123',
    'admin123',
    'Agraj@123',
  ];
  for (const p of passwords) {
    const ok = await checkPass('qa_player_01@test.internal', p);
    if (ok) break;
  }
}

run();
