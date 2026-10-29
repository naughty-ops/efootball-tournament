// Strict server-side execution guard to ensure secrets are never exposed to browser bundles
if (typeof window !== 'undefined') {
  throw new Error('Razorpay server module cannot be imported from browser/client code.');
}

import Razorpay from 'razorpay';
import crypto from 'crypto';

/**
 * Custom error thrown when Razorpay credentials or configuration are missing or invalid.
 */
export class RazorpayConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RazorpayConfigurationError';
  }
}

export interface RazorpayServerConfig {
  keyId: string;
  isTestMode: boolean;
  hasWebhookSecret: boolean;
}

/**
 * Checks whether server-side Razorpay credentials (KEY_ID and KEY_SECRET) are configured.
 * Does NOT throw errors and does NOT crash during build time.
 */
export function isRazorpayConfigured(): boolean {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  return Boolean(keyId && keySecret);
}

/**
 * Validates and retrieves server Razorpay configuration.
 * Throws RazorpayConfigurationError ONLY when invoked if credentials are missing.
 */
export function getRazorpayConfig(): RazorpayServerConfig {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();

  if (!keyId || !keySecret) {
    throw new RazorpayConfigurationError(
      'Razorpay server credentials are not configured. Please define RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your environment.'
    );
  }

  // Validate key format: Razorpay keys begin with 'rzp_test_' or 'rzp_live_'
  const isTestMode = keyId.startsWith('rzp_test_');
  const isLiveMode = keyId.startsWith('rzp_live_');

  if (!isTestMode && !isLiveMode) {
    console.warn(
      `[Razorpay Warning] RAZORPAY_KEY_ID does not start with 'rzp_test_' or 'rzp_live_'. Key prefix: "${keyId.slice(0, 8)}..."`
    );
  }

  return {
    keyId,
    isTestMode,
    hasWebhookSecret: Boolean(webhookSecret),
  };
}

let _razorpayInstance: Razorpay | null = null;

/**
 * Lazily instantiates and returns the official Razorpay SDK client.
 * Safe for build time: will only validate and instantiate when actively called by payment workflows.
 */
export function getServerRazorpayClient(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (!keyId || !keySecret) {
    throw new RazorpayConfigurationError(
      'Cannot instantiate Razorpay client: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in environment variables.'
    );
  }

  if (!_razorpayInstance) {
    _razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  return _razorpayInstance;
}

/**
 * Cryptographically verifies Razorpay payment signature returned upon checkout completion.
 * Verification string: `${orderId}|${paymentId}`
 * Algorithm: HMAC-SHA256 with RAZORPAY_KEY_SECRET
 * Timing attack protected via crypto.timingSafeEqual.
 */
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { orderId, paymentId, signature } = params;
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (!keySecret) {
    throw new RazorpayConfigurationError(
      'Cannot verify payment signature: RAZORPAY_KEY_SECRET is not configured.'
    );
  }

  if (!orderId || !paymentId || !signature) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const actualBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch (err) {
    console.error('Error verifying Razorpay payment signature:', err);
    return false;
  }
}

/**
 * Cryptographically verifies incoming Razorpay webhook signature.
 * Header: x-razorpay-signature
 * Payload: raw webhook request body string
 * Algorithm: HMAC-SHA256 with RAZORPAY_WEBHOOK_SECRET
 * Timing attack protected via crypto.timingSafeEqual.
 */
export function verifyWebhookSignature(params: {
  rawBody: string;
  signature: string;
}): boolean {
  const { rawBody, signature } = params;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    throw new RazorpayConfigurationError(
      'Cannot verify webhook signature: RAZORPAY_WEBHOOK_SECRET is not configured.'
    );
  }

  if (!rawBody || !signature) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const actualBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch (err) {
    console.error('Error verifying Razorpay webhook signature:', err);
    return false;
  }
}
