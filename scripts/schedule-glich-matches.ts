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
import { getTournamentGroups } from '../services/groupService';

async function scheduleMatches() {
  const supabase = createAdminClient();

  const { data: tourney } = await (supabase.from('tournaments') as any)
    .select('*')
    .ilike('name', 'glich')
    .single();

  const overview = await getTournamentGroups(tourney.id);
  const groupIds = overview.groups.map((g) => g.group.id);

  const { data: matches } = await (supabase.from('matches') as any)
    .select('id, group_id, match_position')
    .in('group_id', groupIds)
    .order('match_position', { ascending: true });

  console.log(`Found ${(matches || []).length} matches across groups.`);

  const startTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  for (let i = 0; i < (matches || []).length; i++) {
    const m = matches[i];
    const matchTime = new Date(startTime.getTime() + i * 30 * 60 * 1000).toISOString();
    const roomCode = `GLICH-RM-${String(i + 1).padStart(2, '0')}`;

    await (supabase.from('matches') as any)
      .update({
        scheduled_time: matchTime,
        live_room_name: roomCode,
        status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', m.id);
  }

  console.log('✅ Successfully scheduled all 40 group matches with 30-min intervals and room codes.');
}

scheduleMatches().catch(console.error);
