/**
 * Client-Side Cashfree Checkout Loader Helper (SDK v3)
 *
 * NOTE: Only the environment mode ('sandbox' | 'production') is passed to the client SDK.
 * CASHFREE_SECRET_KEY must NEVER be imported or exposed to client code.
 */

export interface CashfreeCheckoutOptions {
  paymentSessionId: string;
  redirectTarget?: '_self' | '_blank' | '_modal' | '_top';
}

export interface CashfreeSDKInstance {
  checkout: (options: CashfreeCheckoutOptions) => Promise<any>;
}

declare global {
  interface Window {
    Cashfree?: (config: { mode: 'sandbox' | 'production' }) => CashfreeSDKInstance;
  }
}

let scriptLoadingPromise: Promise<boolean> | null = null;

/**
 * Dynamically loads the official Cashfree Checkout SDK v3 script:
 * https://sdk.cashfree.com/js/v3/cashfree.js
 *
 * Singleton loader with timeout and fallback handling.
 */
export function loadCashfreeScript(timeoutMs = 12000): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  if (window.Cashfree) {
    return Promise.resolve(true);
  }

  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise((resolve) => {
    const existingScript = document.querySelector('script[src="https://sdk.cashfree.com/js/v3/cashfree.js"]');
    if (existingScript) {
      if (window.Cashfree) {
        resolve(true);
        return;
      }
      existingScript.addEventListener('load', () => resolve(true), { once: true });
      existingScript.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;

    const timer = setTimeout(() => {
      console.warn(`[Cashfree Checkout] SDK script loading timed out after ${timeoutMs}ms.`);
      resolve(false);
    }, timeoutMs);

    script.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };

    script.onerror = (err) => {
      clearTimeout(timer);
      console.error('[Cashfree Checkout] Failed to load cashfree.js from CDN:', err);
      resolve(false);
    };

    document.body.appendChild(script);
  });

  return scriptLoadingPromise;
}

/**
 * Returns current Cashfree mode for client side.
 */
export function getClientCashfreeMode(): 'sandbox' | 'production' {
  const mode = (
    process.env.NEXT_PUBLIC_CASHFREE_MODE ||
    process.env.NEXT_PUBLIC_CASHFREE_ENV ||
    'sandbox'
  )
    .trim()
    .toLowerCase();
  return mode === 'production' || mode === 'prod' ? 'production' : 'sandbox';
}
