import { createClient } from '@supabase/supabase-js';
import { ENV } from './environments';

export interface TestIdentity {
  index: number;
  email: string;
  password: string;
  displayName: string;
  efootballId: string;
  whatsapp: string;
  userId?: string;
  verified: boolean;
}

// 20 Deterministic QA Competitor Identities
export const QA_20_PLAYERS: TestIdentity[] = Array.from({ length: 20 }, (_, i) => {
  const num = String(i + 1).padStart(2, '0');
  return {
    index: i + 1,
    email: `qa_player_${num}@test.internal`,
    password: `QaPassword2026!#${num}`,
    displayName: `QA Athlete ${num}`,
    efootballId: `QAPL-100-200-${String(100 + i + 1)}`,
    whatsapp: `+9198765432${num}`,
    verified: true,
  };
});

export const QA_ADMIN_IDENTITY = {
  email: ENV.adminEmail,
  userId: ENV.adminUserId,
  displayName: 'Platform Administrator',
};

/**
 * Ensures all 20 QA player identities exist in Supabase auth & profiles
 * Safe and idempotent.
 */
export async function ensureTestIdentities(): Promise<TestIdentity[]> {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceKey) {
    console.warn('⚠️ Supabase credentials missing from ENV; running with in-memory identities only.');
    return QA_20_PLAYERS;
  }

  const supabase = createClient(ENV.supabaseUrl, ENV.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const resolvedPlayers: TestIdentity[] = [];

  // Fetch all existing users ONCE outside the loop
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 100 });
  const userMap = new Map<string, any>();
  if (users) {
    for (const u of users) {
      if (u.email) userMap.set(u.email.toLowerCase(), u);
    }
  }

  for (const player of QA_20_PLAYERS) {
    try {
      let existingUser = userMap.get(player.email.toLowerCase());

      if (!existingUser) {
        // Create user in Supabase auth
        const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
          email: player.email,
          password: player.password,
          email_confirm: true,
          user_metadata: {
            full_name: player.displayName,
            efootball_id: player.efootballId,
          },
        });

        if (createErr) {
          console.warn(`Failed to create test user ${player.email}:`, createErr.message);
          resolvedPlayers.push(player);
          continue;
        }
        existingUser = createData.user;
      }

      if (existingUser) {
        player.userId = existingUser.id;

        // Ensure profile exists in player_profiles or profiles table
        const { data: profile } = await supabase
          .from('player_profiles')
          .select('id, efootball_id')
          .eq('id', existingUser.id)
          .maybeSingle();

        if (!profile) {
          await supabase.from('player_profiles').insert({
            id: existingUser.id,
            display_name: player.displayName,
            efootball_id: player.efootballId,
            efootball_id_verified: true,
            whatsapp_number: player.whatsapp,
            phone_number: player.whatsapp,
          });
        } else {
          await supabase.from('player_profiles').update({
            display_name: player.displayName,
            efootball_id: player.efootballId,
            efootball_id_verified: true,
          }).eq('id', existingUser.id);
        }
      }

      resolvedPlayers.push(player);
    } catch (err: any) {
      console.warn(`Error ensuring identity ${player.email}:`, err.message);
      resolvedPlayers.push(player);
    }
  }

  return resolvedPlayers;
}
