/**
 * Utility functions for generating WhatsApp links and coordination messages
 * for tournament fixtures.
 */

export interface MatchWhatsAppParams {
  opponentName: string;
  yourName: string;
  tournamentName: string;
  matchIdentifier: string; // e.g. "Match #2" or "GLICH-RM-07"
  scheduledTime?: string | null;
}

/**
 * Strips non-digit characters from a phone number string for WhatsApp wa.me URLs.
 * e.g. "+91 92075-16227" -> "919207516227"
 */
export function cleanWhatsAppNumber(phone: string): string {
  if (!phone) return '';
  return phone.replace(/[^0-9]/g, '');
}

/**
 * Formats a clean date string (e.g., "Thursday, Oct 29, 2026") from an ISO date string.
 * Returns null if the date is invalid.
 */
export function formatScheduledDate(isoString: string): string | null {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

/**
 * Formats a clean time string (e.g., "04:30 PM") from an ISO date string.
 * Returns null if the date is invalid.
 */
export function formatScheduledTime(isoString: string): string | null {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return null;
  }
}

/**
 * Generates the standardized WhatsApp coordination message.
 * If match date or time is not scheduled, those lines are omitted completely
 * without displaying null, undefined, or placeholders.
 */
export function generateMatchWhatsAppMessage(params: MatchWhatsAppParams): string {
  const opponentName = params.opponentName.trim() || 'Opponent';
  const yourName = params.yourName.trim() || 'Competitor';
  const tournamentName = params.tournamentName.trim() || 'Tournament';
  const matchId = params.matchIdentifier.trim() || 'Upcoming Match';

  let dateLine = '';
  let timeLine = '';

  if (params.scheduledTime) {
    const formattedDate = formatScheduledDate(params.scheduledTime);
    const formattedTime = formatScheduledTime(params.scheduledTime);

    if (formattedDate) {
      dateLine = `\n📅 Scheduled Date: ${formattedDate}`;
    }
    if (formattedTime) {
      timeLine = `\n🕒 Scheduled Time: ${formattedTime}`;
    }
  }

  return (
    `Hey ${opponentName}! 👋⚽\n\n` +
    `I'm ${yourName} from the **${tournamentName}** tournament.\n\n` +
    `Our upcoming match details:\n` +
    `🏆 Tournament: ${tournamentName}\n` +
    `⚔️ Match: ${matchId}\n` +
    `👤 Player 1: ${yourName}\n` +
    `👤 Opponent: ${opponentName}` +
    dateLine +
    timeLine +
    `\n\nHey! When are you free to play our match? Please message me with a suitable time so we can coordinate and complete it smoothly. 😊🎮\n\n` +
    `Good luck, and see you on the pitch! 🔥`
  );
}

/**
 * Builds the complete wa.me URL with properly encoded message.
 */
export function buildWhatsAppMatchUrl(phone: string, params: MatchWhatsAppParams): string {
  const cleanPhone = cleanWhatsAppNumber(phone);
  const message = generateMatchWhatsAppMessage(params);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
