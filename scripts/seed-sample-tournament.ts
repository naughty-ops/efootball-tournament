/**
 * SEED SCRIPT: Sample Open Tournament
 * Provisioning: "V1.2 Open Registration Test Cup"
 *
 * Safety:
 * - Idempotent: checks for existence before attempting insertion.
 * - By default runs in SAFE / DRY-RUN mode.
 * - Supply --execute flag to perform insertion if Supabase credentials are configured.
 * - Always prints the canonical SQL statement for easy execution in Supabase SQL Editor.
 */

import fs from 'fs';
import path from 'path';

// Helper to safely load key-value pairs from .env or .env.local without external deps
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

import { createClient } from '@supabase/supabase-js';

const SAMPLE_TOURNAMENT = {
  name: 'V1.2 Open Registration Test Cup',
  description: 'Official sample tournament for V1.2. Free open registration for all verified players.',
  format: 'knockout',
  status: 'registration',
  max_participants: 16,
  qualifiers_per_group: 2,
  rounds_per_pair: 1,
  rules_text: 'Standard competitive eFootball knockout tournament. Best of 1 match per round with extra time and penalties enabled if tied. All registered players must have an active eFootball ID and WhatsApp number.',
  banner_image: '/images/banner1.jpg',
};

async function main() {
  console.log('================================================================');
  console.log('    SAMPLE TOURNAMENT SEED PROVISIONER — EFOOTBALL PLATFORM     ');
  console.log('================================================================\n');

  console.log('Target Tournament Details:');
  console.log(`  Name:             ${SAMPLE_TOURNAMENT.name}`);
  console.log(`  Format:           ${SAMPLE_TOURNAMENT.format}`);
  console.log(`  Status:           ${SAMPLE_TOURNAMENT.status}`);
  console.log(`  Max Participants: ${SAMPLE_TOURNAMENT.max_participants}`);
  console.log(`  Banner Image:     ${SAMPLE_TOURNAMENT.banner_image}`);
  console.log(`  Rules Summary:    ${SAMPLE_TOURNAMENT.rules_text.slice(0, 60)}...`);
  console.log('----------------------------------------------------------------\n');

  // Print raw SQL representation
  console.log('--- REPEATABLE / IDEMPOTENT SQL MIGRATION ---');
  console.log(`
INSERT INTO public.tournaments (
  name,
  description,
  format,
  status,
  max_participants,
  qualifiers_per_group,
  rounds_per_pair,
  rules_text,
  banner_image,
  created_at,
  updated_at
)
SELECT
  '${SAMPLE_TOURNAMENT.name}',
  '${SAMPLE_TOURNAMENT.description}',
  '${SAMPLE_TOURNAMENT.format}',
  '${SAMPLE_TOURNAMENT.status}',
  ${SAMPLE_TOURNAMENT.max_participants},
  ${SAMPLE_TOURNAMENT.qualifiers_per_group},
  ${SAMPLE_TOURNAMENT.rounds_per_pair},
  '${SAMPLE_TOURNAMENT.rules_text}',
  '${SAMPLE_TOURNAMENT.banner_image}',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.tournaments WHERE name = '${SAMPLE_TOURNAMENT.name}'
);
  `.trim());
  console.log('----------------------------------------------------------------\n');

  const isExecute = process.argv.includes('--execute');
  if (!isExecute) {
    console.log('[DRY-RUN MODE] No database changes were made.');
    console.log('To execute against the configured Supabase database, run with:');
    console.log('  npx tsx scripts/seed-sample-tournament.ts --execute\n');
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('ERROR: Missing Supabase credentials in environment.');
    console.error('Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Check if tournament already exists
  const { data: existing, error: checkErr } = await supabase
    .from('tournaments')
    .select('id, name, status, format, max_participants')
    .eq('name', SAMPLE_TOURNAMENT.name)
    .maybeSingle();

  if (checkErr) {
    console.error('Error querying tournaments:', checkErr.message);
    process.exit(1);
  }

  if (existing) {
    console.log(`[IDEMPOTENT CHECK] Tournament "${existing.name}" already exists!`);
    console.log(`  Tournament ID:    ${existing.id}`);
    console.log(`  Current Status:   ${existing.status}`);
    console.log(`  Max Participants: ${existing.max_participants}`);
    console.log('No modifications required.');
    return;
  }

  console.log(`Creating tournament "${SAMPLE_TOURNAMENT.name}"...`);
  const { data: created, error: insertErr } = await supabase
    .from('tournaments')
    .insert({
      name: SAMPLE_TOURNAMENT.name,
      description: SAMPLE_TOURNAMENT.description,
      format: SAMPLE_TOURNAMENT.format,
      status: SAMPLE_TOURNAMENT.status,
      max_participants: SAMPLE_TOURNAMENT.max_participants,
      qualifiers_per_group: SAMPLE_TOURNAMENT.qualifiers_per_group,
      rounds_per_pair: SAMPLE_TOURNAMENT.rounds_per_pair,
      rules_text: SAMPLE_TOURNAMENT.rules_text,
      banner_image: SAMPLE_TOURNAMENT.banner_image,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id, name, status, format, max_participants')
    .single();

  if (insertErr) {
    console.error('Failed to create sample tournament:', insertErr.message);
    process.exit(1);
  }

  console.log(`SUCCESS! Tournament created with ID: ${created.id}`);
  console.log(`Public registration link: /tournaments/${created.id}`);
}

main().catch((err) => {
  console.error('Unhandled script error:', err);
  process.exit(1);
});
