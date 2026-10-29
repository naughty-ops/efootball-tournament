/**
 * Client-Side Razorpay Configuration and Checkout Loader Helper
 *
 * NOTE: Only the public key ID (NEXT_PUBLIC_RAZORPAY_KEY_ID) should ever be referenced in client code.
 * NEVER import or expose RAZORPAY_KEY_SECRET or RAZORPAY_WEBHOOK_SECRET on the client side.
 */

/**
 * Returns the public Razorpay Key ID used for launching the Checkout modal.
 * Returns null if not yet defined.
 */
export function getClientRazorpayKeyId(): string | null {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim();
  return keyId || null;
}

/**
 * Indicates whether client-side Razorpay checkout can be initialized.
 */
export function isClientRazorpayAvailable(): boolean {
  return Boolean(getClientRazorpayKeyId());
}

/**
 * Interface representing Razorpay Checkout success handler response.
 */
export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

/**
 * Interface for Razorpay Checkout Options
 */
export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
    backdrop_color?: string;
  };
  modal?: {
    backdropclose?: boolean;
    escape?: boolean;
    handleback?: boolean;
    confirm_close?: boolean;
    ondismiss?: () => void;
  };
  handler?: (response: RazorpaySuccessResponse) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => {
      open: () => void;
      on: (event: string, callback: (response: any) => void) => void;
      close: () => void;
    };
  }
}

let scriptLoadingPromise: Promise<boolean> | null = null;

/**
 * Dynamically loads the official Razorpay Checkout SDK script (https://checkout.razorpay.com/v1/checkout.js).
 * Guaranteed singleton load with robust error handling and timeout.
 */
export function loadRazorpayScript(timeoutMs = 12000): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  if (window.Razorpay) {
    return Promise.resolve(true);
  }

  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise((resolve) => {
    // Check if script element already exists in document
    const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existingScript) {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      existingScript.addEventListener('load', () => resolve(true), { once: true });
      existingScript.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.crossOrigin = 'anonymous';

    const timeout = setTimeout(() => {
      console.error('[Razorpay Checkout] Script load timed out after', timeoutMs, 'ms');
      resolve(false);
    }, timeoutMs);

    script.onload = () => {
      clearTimeout(timeout);
      resolve(true);
    };

    script.onerror = () => {
      clearTimeout(timeout);
      console.error('[Razorpay Checkout] Failed to load checkout.js script');
      scriptLoadingPromise = null;
      resolve(false);
    };

    document.body.appendChild(script);
  });

  return scriptLoadingPromise;
}
