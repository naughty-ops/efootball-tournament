import { createAdminClient } from '../lib/supabase/admin';
import fs from 'fs';

// Read .env.local into process.env if not set
const envContent = fs.readFileSync('.env.local', 'utf-8');
envContent.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2] || '';
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    process.env[match[1]] = val.trim();
  }
});

async function testUpload() {
  const admin = createAdminClient();
  const testBuffer = Buffer.from('test');
  const path = `test/test_${Date.now()}.png`;

  console.log('Testing admin client storage upload to payment-proofs...');
  const { data, error } = await admin.storage
    .from('payment-proofs')
    .upload(path, testBuffer, { contentType: 'image/png' });

  if (error) {
    console.error('Upload Error:', error);
  } else {
    console.log('Upload Success:', data);
    // clean up
    await admin.storage.from('payment-proofs').remove([path]);
  }
}

testUpload();
