import { NextResponse } from 'next/server';
import { testSupabaseConnection } from '@/lib/supabase/test-connection';

export async function GET() {
  const testResult = await testSupabaseConnection();
  
  if (!testResult.success) {
    return NextResponse.json(testResult, { status: 500 });
  }

  return NextResponse.json(testResult, { status: 200 });
}
