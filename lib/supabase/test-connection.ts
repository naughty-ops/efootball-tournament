import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  hasUrl: boolean;
  hasKey: boolean;
  tournamentsCount?: number;
  errorDetails?: string;
}

export async function testSupabaseConnection(): Promise<ConnectionTestResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const hasUrl = Boolean(url && url.length > 0 && !url.includes('your-project-id'));
  const hasKey = Boolean(key && key.length > 0 && !key.includes('your-anon-key'));

  if (!hasUrl || !hasKey) {
    const missing: string[] = [];
    if (!hasUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!hasKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

    return {
      success: false,
      message: `Configuration Error: Missing or unconfigured environment variables (${missing.join(', ')}).`,
      hasUrl,
      hasKey,
    };
  }

  try {
    const client = createClient<Database>(url!, key!);

    const { error, count } = await client
      .from('tournaments')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return {
        success: false,
        message: `Database Connection Failed: ${error.message}`,
        hasUrl,
        hasKey,
        errorDetails: error.details || error.hint || error.code,
      };
    }

    const tournamentsCount = count ?? 0;

    return {
      success: true,
      message: `Database Connection Successful! Handled tournaments table cleanly (${tournamentsCount} records found).`,
      hasUrl,
      hasKey,
      tournamentsCount,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Unexpected Error during Supabase connection test: ${errorMessage}`,
      hasUrl,
      hasKey,
      errorDetails: errorMessage,
    };
  }
}
