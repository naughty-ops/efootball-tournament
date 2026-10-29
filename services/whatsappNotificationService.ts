/**
 * WhatsApp Business Cloud API Integration Service
 * Sends post-verification notifications to the configured administrator number.
 * 
 * Required Server-Only Environment Variables:
 * - WHATSAPP_ADMIN_NUMBER: International format (e.g. +919876543210 or 919876543210)
 * - WHATSAPP_ACCESS_TOKEN: Meta Cloud API System User access token
 * - WHATSAPP_PHONE_NUMBER_ID: Meta Cloud API Business Phone Number ID
 */

export interface WhatsAppRegistrationPayload {
  fullName: string;
  verifiedEmail: string;
  efootballId: string;
  whatsappNumber: string;
  userId: string;
}

export interface WhatsAppNotificationResult {
  status: 'sent' | 'skipped_unconfigured' | 'failed';
  message: string;
  metaMessageId?: string;
}

export async function sendAdminRegistrationNotification(
  payload: WhatsAppRegistrationPayload
): Promise<WhatsAppNotificationResult> {
  const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  // Validate configuration presence
  if (!adminNumber || !accessToken || !phoneNumberId) {
    const missing: string[] = [];
    if (!adminNumber) missing.push('WHATSAPP_ADMIN_NUMBER');
    if (!accessToken) missing.push('WHATSAPP_ACCESS_TOKEN');
    if (!phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');

    console.warn(
      `[WhatsAppNotification] Skipped: Missing server environment configuration (${missing.join(', ')}). Notification registered for user ${payload.userId}.`
    );

    return {
      status: 'skipped_unconfigured',
      message: `WhatsApp notification skipped: Missing server environment configuration (${missing.join(', ')}).`,
    };
  }

  // Sanitize destination number (digits only for WhatsApp Cloud API)
  const recipient = adminNumber.replace(/\D/g, '');

  const textBody =
`🎮 *New eFootball Platform Registration*

Hello Admin!

A new user has successfully verified their email on the eFootball Tournament Platform.

*Full Name:* ${payload.fullName}
*Email:* ${payload.verifiedEmail}
*eFootball ID:* ${payload.efootballId}
*WhatsApp Number:* ${payload.whatsappNumber}
*Email Status:* Verified

Please review the registration details.

— _eFootball Tournament Platform_`;

  try {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: {
          preview_url: false,
          body: textBody,
        },
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(
        '[WhatsAppNotification] Cloud API error response:',
        response.status,
        result?.error?.message || 'Unknown provider error'
      );
      return {
        status: 'failed',
        message: `WhatsApp API error: ${result?.error?.message || response.statusText}`,
      };
    }

    const messageId = result?.messages?.[0]?.id;
    return {
      status: 'sent',
      message: 'WhatsApp notification sent successfully.',
      metaMessageId: messageId,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Network error';
    console.error('[WhatsAppNotification] Failed to dispatch notification:', errMsg);
    return {
      status: 'failed',
      message: `Network error sending WhatsApp notification: ${errMsg}`,
    };
  }
}
