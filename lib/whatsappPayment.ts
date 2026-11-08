/**
 * WhatsApp Payment URL utilities for manual tournament registration
 */

export interface WhatsAppPaymentMessageParams {
  adminWhatsAppNumber: string;
  tournamentName: string;
  tournamentId: string;
  registrationId: string;
  userName: string;
  efootballId: string;
  userPhone?: string;
  entryFeeINR: number;
}

/**
 * Generates a prefilled WhatsApp link directing the user directly to the admin's WhatsApp
 * with tournament name & ID, registration ID, player name, eFootball ID, and entry fee.
 */
export function generateWhatsAppPaymentLink(params: WhatsAppPaymentMessageParams): string {
  const cleanPhone = (params.adminWhatsAppNumber || '+919207516227').replace(/\D/g, '');

  const text =
`🎮 *eFootball Tournament Registration*

🏆 *Tournament:* ${params.tournamentName}
🆔 *Tournament ID:* ${params.tournamentId}
📋 *Registration ID:* ${params.registrationId}
👤 *Player Name:* ${params.userName}
⚽ *eFootball ID:* ${params.efootballId}
💰 *Entry Fee:* ₹${params.entryFeeINR}

Hello Admin! I would like to pay the entry fee and confirm my registration for this tournament.`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * Generates an admin WhatsApp link to chat directly with a player regarding their registration.
 */
export function generateAdminContactPlayerLink(params: {
  playerPhone: string;
  tournamentName: string;
  registrationId: string;
  playerName: string;
}): string {
  const cleanPhone = (params.playerPhone || '').replace(/\D/g, '');
  const text = `Hello ${params.playerName}! Regarding your registration (${params.registrationId.slice(0, 8)}) for *${params.tournamentName}*: `;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}
