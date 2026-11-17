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
  const adminClient = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

  // Get a test user
  const { data: { users }, error: uErr } = await adminClient.auth.admin.listUsers();
  if (uErr || !users || users.length === 0) {
    console.error('No users found');
    return;
  }

  const user = users[0];
  console.log('Testing with user:', user.id, user.email);

  // Generate a sign-in token or session for this user
  const { data: linkData, error: lErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email!,
  });

  if (lErr || !linkData) {
    console.error('Failed to generate link:', lErr);
    return;
  }

  // Create client with anon key and set session with the token hash
  const client = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  const { data: sessionData, error: verifyErr } = await client.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (verifyErr || !sessionData.session) {
    console.error('Failed to verify OTP session:', verifyErr);
    return;
  }

  console.log('Authenticated successfully as:', sessionData.user?.id);

  // Now attempt upload to payment-proofs under user.id folder
  const storagePath = `${user.id}/test_${Date.now()}.png`;
  const { data: uploadData, error: uploadErr } = await client.storage
    .from('payment-proofs')
    .upload(storagePath, Buffer.from('test-image-content'), {
      contentType: 'image/png',
      upsert: false,
    });

  if (uploadErr) {
    console.error('Authenticated user upload error:', uploadErr);
  } else {
    console.log('Authenticated user upload SUCCESS:', uploadData);
    // Cleanup
    await adminClient.storage.from('payment-proofs').remove([storagePath]);
    console.log('Cleaned up test file.');
  }
}

run();
