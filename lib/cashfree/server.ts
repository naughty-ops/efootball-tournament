// Strict server-side execution guard to ensure secrets are never exposed to browser bundles
if (typeof window !== 'undefined') {
  throw new Error('Cashfree server module cannot be imported from browser/client code.');
}

import crypto from 'crypto';

/**
 * Custom error thrown when Cashfree credentials or configuration are missing or invalid.
 */
export class CashfreeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CashfreeConfigurationError';
  }
}

export class CashfreeApiError extends Error {
  public statusCode: number;
  public errorCode?: string;
  public errorType?: string;
  public requestId?: string | null;

  constructor(params: {
    message: string;
    statusCode: number;
    errorCode?: string;
    errorType?: string;
    requestId?: string | null;
  }) {
    super(params.message);
    this.name = 'CashfreeApiError';
    this.statusCode = params.statusCode;
    this.errorCode = params.errorCode;
    this.errorType = params.errorType;
    this.requestId = params.requestId;
  }
}

export interface CashfreeServerConfig {
  appId: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
  apiVersion: string;
  baseUrl: string;
  hasWebhookSecret: boolean;
}

export interface CashfreeCreateOrderParams {
  orderId: string;
  orderAmount: number; // In Rupees (e.g. 500.00)
  orderCurrency: string; // e.g. "INR"
  customerDetails: {
    customerId: string;
    customerName: string;
    customerEmail?: string;
    customerPhone: string; // 10 digits
  };
  orderMeta?: {
    returnUrl?: string;
    notifyUrl?: string;
  };
  orderNote?: string;
}

export interface CashfreeOrderResponse {
  cfOrderId?: string | number;
  orderId: string;
  orderAmount: number;
  orderCurrency: string;
  orderStatus: string;
  paymentSessionId: string;
}

export interface CashfreePaymentEntity {
  cfPaymentId: string | number;
  orderId: string;
  paymentAmount: number;
  paymentCurrency: string;
  paymentStatus: 'SUCCESS' | 'FAILED' | 'PENDING' | 'USER_DROPPED' | 'CANCELLED';
  paymentMessage?: string;
  paymentTime?: string;
  paymentMethod?: any;
  bankReference?: string;
}

/**
 * Resolves server-side Cashfree credentials with support for common alias conventions
 * (CASHFREE_APP_ID vs CASHFREE_CLIENT_ID, and CASHFREE_SECRET_KEY vs CASHFREE_CLIENT_SECRET).
 */
export function getResolvedCashfreeCredentials(): { appId?: string; secretKey?: string } {
  const appId = (
    process.env.CASHFREE_APP_ID ||
    process.env.CASHFREE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_CASHFREE_APP_ID ||
    process.env.NEXT_PUBLIC_CASHFREE_CLIENT_ID
  )?.trim();

  const secretKey = (
    process.env.CASHFREE_SECRET_KEY ||
    process.env.CASHFREE_CLIENT_SECRET
  )?.trim();

  return { 
    appId: appId || undefined, 
    secretKey: secretKey || undefined 
  };
}

/**
 * Normalizes environment selector string to 'sandbox' | 'production'.
 */
export function getCashfreeEnvironment(): 'sandbox' | 'production' {
  const env = (
    process.env.CASHFREE_ENV || 
    process.env.CASHFREE_ENVIRONMENT || 
    process.env.NEXT_PUBLIC_CASHFREE_ENV || 
    'sandbox'
  ).trim().toLowerCase();
  return env === 'production' || env === 'prod' ? 'production' : 'sandbox';
}

/**
 * Checks whether server-side Cashfree credentials (CASHFREE_APP_ID/CLIENT_ID and CASHFREE_SECRET_KEY/CLIENT_SECRET) are configured.
 * Does NOT throw errors and does NOT crash during build time.
 */
export function isCashfreeConfigured(): boolean {
  const { appId, secretKey } = getResolvedCashfreeCredentials();
  return Boolean(appId && secretKey);
}

/**
 * Returns Cashfree base API URL depending on current environment.
 */
export function getCashfreeBaseUrl(): string {
  const env = getCashfreeEnvironment();
  return env === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
}

/**
 * Retrieves Cashfree server configuration. Throws CashfreeConfigurationError only when invoked
 * if credentials are not configured.
 */
export function getCashfreeConfig(): CashfreeServerConfig {
  const { appId, secretKey } = getResolvedCashfreeCredentials();
  const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET?.trim() || secretKey;

  if (!appId || !secretKey) {
    throw new CashfreeConfigurationError(
      'Cashfree server credentials are not configured. Please define CASHFREE_APP_ID (or CASHFREE_CLIENT_ID) and CASHFREE_SECRET_KEY (or CASHFREE_CLIENT_SECRET) in your environment variables.'
    );
  }

  const environment = getCashfreeEnvironment();
  const apiVersion = process.env.CASHFREE_API_VERSION?.trim() || '2023-08-01';

  return {
    appId,
    secretKey,
    environment,
    apiVersion,
    baseUrl: getCashfreeBaseUrl(),
    hasWebhookSecret: Boolean(webhookSecret),
  };
}

/**
 * Prepares Cashfree API headers with proper client-id, client-secret, and API version.
 * If the App ID begins with 'CF' (Cashfree Merchant Account identifier), passes 'x-partner-merchantid'
 * to ensure Cashfree's gateway routes authentication correctly.
 */
export function getCashfreeAuthHeaders(config: CashfreeServerConfig, contentType = true): Record<string, string> {
  const headers: Record<string, string> = {
    'x-client-id': config.appId,
    'x-client-secret': config.secretKey,
    'x-api-version': config.apiVersion,
  };
  if (contentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (config.appId.startsWith('CF')) {
    headers['x-partner-merchantid'] = config.appId;
  }
  return headers;
}

/**
 * Formats a clean 10-digit Indian phone number required by Cashfree API.
 * Defaults to a safe sandbox test number if missing or invalid.
 */
export function sanitizeCashfreePhone(rawPhone?: string | null): string {
  if (!rawPhone) return '9999999999';
  const digits = rawPhone.replace(/[^0-9]/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return '9999999999';
}

/**
 * Server-to-server call: Creates an Order in Cashfree PG v3 and returns payment_session_id.
 */
export async function createCashfreeOrder(params: CashfreeCreateOrderParams): Promise<CashfreeOrderResponse> {
  const config = getCashfreeConfig();

  const url = `${config.baseUrl}/orders`;
  const payload = {
    order_id: params.orderId,
    order_amount: Number(params.orderAmount.toFixed(2)),
    order_currency: (params.orderCurrency || 'INR').toUpperCase(),
    customer_details: {
      customer_id: params.customerDetails.customerId.slice(0, 50),
      customer_name: params.customerDetails.customerName.slice(0, 50),
      customer_email: params.customerDetails.customerEmail?.slice(0, 100) || 'customer@efootball.local',
      customer_phone: sanitizeCashfreePhone(params.customerDetails.customerPhone),
    },
    order_meta: {
      return_url: params.orderMeta?.returnUrl,
      notify_url: params.orderMeta?.notifyUrl,
    },
    order_note: params.orderNote?.slice(0, 200),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: getCashfreeAuthHeaders(config, true),
    body: JSON.stringify(payload),
  });

  const responseBody = await response.json().catch(() => null);
  const requestId = response.headers.get('x-request-id');

  if (!response.ok || !responseBody?.payment_session_id) {
    const errorMsg = responseBody?.message || `Cashfree order creation failed with status ${response.status}`;
    console.error('[Cashfree API Diagnostic Log] Order creation failed:', {
      operation: 'POST /orders',
      status: response.status,
      code: responseBody?.code,
      type: responseBody?.type,
      message: responseBody?.message,
      requestId: requestId || 'N/A',
      baseUrl: config.baseUrl,
      apiVersion: config.apiVersion,
    });
    throw new CashfreeApiError({
      message: errorMsg,
      statusCode: response.status,
      errorCode: responseBody?.code,
      errorType: responseBody?.type,
      requestId,
    });
  }

  return {
    cfOrderId: responseBody.cf_order_id,
    orderId: responseBody.order_id,
    orderAmount: Number(responseBody.order_amount),
    orderCurrency: responseBody.order_currency,
    orderStatus: responseBody.order_status,
    paymentSessionId: responseBody.payment_session_id,
  };
}

/**
 * Server-to-server call: Fetches order payments status directly from Cashfree PG v3 API.
 */
export async function fetchCashfreeOrderPayments(orderId: string): Promise<CashfreePaymentEntity[]> {
  const config = getCashfreeConfig();

  const url = `${config.baseUrl}/orders/${encodeURIComponent(orderId)}/payments`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getCashfreeAuthHeaders(config, false),
  });

  const responseBody = await response.json().catch(() => null);

  if (!response.ok || !Array.isArray(responseBody)) {
    console.error('[Cashfree API Error] Fetch payments failed:', {
      orderId,
      status: response.status,
      body: responseBody,
    });
    return [];
  }

  return responseBody.map((item: any) => ({
    cfPaymentId: String(item.cf_payment_id || item.payment_id || ''),
    orderId: item.order_id || orderId,
    paymentAmount: Number(item.payment_amount),
    paymentCurrency: item.payment_currency || 'INR',
    paymentStatus: item.payment_status,
    paymentMessage: item.payment_message,
    paymentTime: item.payment_time,
    paymentMethod: item.payment_method,
    bankReference: item.bank_reference,
  }));
}

/**
 * Server-to-server call: Fetches overall order details from Cashfree PG v3.
 */
export async function fetchCashfreeOrder(orderId: string): Promise<{
  orderId: string;
  orderStatus: string;
  orderAmount: number;
  orderCurrency: string;
  cfOrderId?: string | number;
} | null> {
  const config = getCashfreeConfig();

  const url = `${config.baseUrl}/orders/${encodeURIComponent(orderId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getCashfreeAuthHeaders(config, false),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json().catch(() => null);
  if (!data || !data.order_id) {
    return null;
  }

  return {
    orderId: data.order_id,
    orderStatus: data.order_status,
    orderAmount: Number(data.order_amount),
    orderCurrency: data.order_currency,
    cfOrderId: data.cf_order_id,
  };
}

/**
 * Cryptographically verifies incoming Cashfree webhook signature.
 *
 * Header: x-webhook-signature
 * Header: x-webhook-timestamp
 * Payload: raw webhook request body string
 * Algorithm: HMAC-SHA256 with CASHFREE_SECRET_KEY over (timestamp + rawBody)
 * Comparison: constant-time timingSafeEqual
 */
export function verifyCashfreeWebhookSignature(params: {
  rawBody: string;
  signature: string;
  timestamp: string;
  secret?: string;
}): boolean {
  const { rawBody, signature, timestamp } = params;
  const config = getCashfreeConfig();
  const secret = params.secret || process.env.CASHFREE_WEBHOOK_SECRET || config.secretKey;

  if (!rawBody || !signature || !timestamp || !secret) {
    return false;
  }

  try {
    const dataToSign = timestamp + rawBody;
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(dataToSign)
      .digest('base64');

    const expectedBuffer = Buffer.from(computedSignature, 'utf8');
    const actualBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch (err) {
    console.error('Error verifying Cashfree webhook signature:', err);
    return false;
  }
}
