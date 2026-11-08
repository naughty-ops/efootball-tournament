/**
 * Canonical LiveKit room and identity resolution utilities for scheduled matches.
 * Shared between LiveKit token issuance and administrative streamer eviction.
 */

export interface MatchRoomIdentifiable {
  id: string;
  live_room_name?: string | null;
}

/**
 * Resolves the authoritative LiveKit room name for a given match.
 * Canonical resolution: match.live_room_name || match.id
 */
export function getCanonicalMatchRoomName(match: MatchRoomIdentifiable): string {
  if (match.live_room_name && match.live_room_name.trim() !== '') {
    return match.live_room_name.trim();
  }
  return match.id;
}

/**
 * Constructs the deterministic LiveKit broadcaster identity for a streamer.
 * Format: broadcaster-<streamerIdFirst8Chars>
 */
export function getBroadcasterIdentity(streamerId: string): string {
  if (!streamerId || typeof streamerId !== 'string') {
    throw new Error('Valid streamerId string is required to construct broadcaster identity.');
  }
  const normalizedId = streamerId.trim().toLowerCase();
  return `broadcaster-${normalizedId.substring(0, 8)}`;
}
