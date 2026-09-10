import { NextResponse } from 'next/server';
import { testSupabaseConnection } from '@/lib/supabase/test-connection';

export async function GET() {
  const testResult = await testSupabaseConnection();
  
  if (!testResult.success) {
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
