import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

async function test() {
  const { createAdminClient } = await import('../lib/supabase/admin');
  const adminClient = createAdminClient();

  const { data: m } = await adminClient
    .from('one_vs_one_matches')
    .select('id, match_code, status, room_id, room_password')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('Latest Match:', m);

  const { data: p } = await adminClient
    .from('one_vs_one_match_players')
    .select('user_id, player_position, ready_status, is_active')
    .eq('match_id', m.id);

  console.log('Players in Match:', p);
}

test().catch(console.error);
