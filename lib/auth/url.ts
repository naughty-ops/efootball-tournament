/**
 * Centralized Application and Auth URL Resolution Helper
 * 
 * Handles URL generation for authentication callbacks, email redirects,
 * and recovery workflows across local development, Vercel preview environments,
 * and production deployment.
 */

export function getAppUrl(): string {
  // If running in browser, origin is always authoritative for the current user's session
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  // Explicit site URL configured in environment
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  }

  // Vercel deployment URL (preview or production)
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL.replace(/\/+$/, '')}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, '')}`;
  }

  // Production fallback
  return 'https://efootball-tournament-cyan.vercel.app';
}

/**
 * Returns an absolute URL for authentication redirect endpoints.
 * @param path Relative path starting with '/', e.g. '/auth/callback?type=recovery'
 */
export function getAuthRedirectUrl(path: string = '/'): string {
  const baseUrl = getAppUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}
