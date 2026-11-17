import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2] || '';
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    env[match[1]] = val.trim();
  }
});

async function run() {
  const anonClient = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  const path = `test/test_${Date.now()}.png`;

  console.log('Testing upload with ANON key...');
  const { data: d1, error: e1 } = await anonClient.storage
    .from('payment-proofs')
    .upload(path, Buffer.from('test'), { contentType: 'image/png' });

  console.log('Anon upload result error:', e1?.message);
}

run();
