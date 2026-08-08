import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    name: 'eFootball Tournament Platform API',
    version: '1.0.0',
    status: 'healthy',
  });
}
