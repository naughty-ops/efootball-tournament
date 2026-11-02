/**
 * LiveKit Token Route Alias
 * Re-exports the canonical LiveKit token handler to maintain backward compatibility
 * with clients invoking /api/live/token.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export { GET, POST, OPTIONS } from '@/app/api/livekit/token/route';
