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

async function verifyGlich() {
  const supabase = createAdminClient();

  const { data: tourney } = await (supabase.from('tournaments') as any)
    .select('*')
    .ilike('name', 'glich')
    .single();

  const { data: participants } = await (supabase.from('participants') as any)
    .select('*')
    .eq('tournament_id', tourney.id)
    .order('seed_number', { ascending: true });

  console.log('Tournament:', tourney.name, 'Max:', tourney.max_participants, 'Confirmed:', tourney.confirmed_slots_count);
  console.log('Participants count:', participants?.length);
  for (const p of participants || []) {
    console.log(`Seed ${p.seed_number}: ${p.username} (${p.real_name}) [user_id: ${p.user_id}]`);
  }
}

verifyGlich().catch(console.error);
