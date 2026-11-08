import crypto from 'crypto';

export interface TokenVerificationResult {
  valid: boolean;
  tournamentId?: string;
  expiresAt?: number;
  reason?:
    | 'MISSING_COOKIE'
    | 'MISSING_SECRET'
    | 'MALFORMED_TOKEN'
    | 'EXPIRED_TOKEN'
    | 'CROSS_TOURNAMENT_TOKEN'
    | 'PASSWORD_ROTATED'
    | 'INVALID_SIGNATURE';
}

export const DEFAULT_TOKEN_TTL_SECONDS = 86400 * 7; // 7 days

/**
 * Computes a deterministic, non-reversible fingerprint of the tournament's current password hash.
 * This binds issued access tokens to the exact password state in the database.
 * If the admin changes or removes the password, all previously issued tokens become invalid.
 */
export function computePasswordFingerprint(accessCodeHash: string | null | undefined): string {
  if (!accessCodeHash || typeof accessCodeHash !== 'string' || accessCodeHash.trim() === '') {
    return 'none';
  }
  return crypto
    .createHash('sha256')
    .update(accessCodeHash.trim())
    .digest('hex')
    .substring(0, 16);
}

/**
 * Retrieves the dedicated cryptographic signing secret from environment.
 * Strictly requires ACCESS_TOKEN_SECRET to prevent cross-protocol key reuse.
 * Fails closed if missing or has insufficient entropy (minimum 32 characters).
 */
function getSigningSecret(): string {
  const secret = process.env.ACCESS_TOKEN_SECRET;

  if (!secret || secret.trim().length < 32) {
    throw new Error(
      'SECURE_SIGNING_SECRET_UNAVAILABLE: ACCESS_TOKEN_SECRET environment variable is missing or has insufficient entropy (must be at least 32 characters).'
    );
  }

  return secret.trim();
}

/**
 * Creates a cryptographically signed authorization token bound to a specific tournament and password state.
 * Format: <tournamentId>.<exp>.<fingerprint>.<base64url_hmac_signature>
 */
export function createSignedTournamentAccessToken(
  tournamentId: string,
  accessCodeHashOrTtl?: string | null | number,
  ttlSeconds?: number
): string {
  if (!tournamentId || typeof tournamentId !== 'string') {
    throw new Error('Invalid tournamentId provided for token issuance.');
  }

  const secret = getSigningSecret();
  let accessCodeHash: string | null | undefined = undefined;
  let ttl = DEFAULT_TOKEN_TTL_SECONDS;

  if (typeof accessCodeHashOrTtl === 'number') {
    ttl = accessCodeHashOrTtl;
  } else {
    accessCodeHash = accessCodeHashOrTtl;
    if (typeof ttlSeconds === 'number') {
      ttl = ttlSeconds;
    }
  }

  const exp = Math.floor(Date.now() / 1000) + ttl;
  const fingerprint = computePasswordFingerprint(accessCodeHash);
  const payload = `${tournamentId}.${exp}.${fingerprint}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
}

/**
 * Verifies a cryptographically signed tournament access token against the target tournament
 * and its current database password state.
 * Enforces:
 * 1. Non-empty, structurally valid token
 * 2. Exact tournament ID binding (rejects cross-tournament tokens)
 * 3. Expiration timestamp (rejects expired tokens)
 * 4. Password-state fingerprint match (rejects tokens issued under an older password)
 * 5. Signature match via timing-safe comparison
 */
export function verifySignedTournamentAccessToken(
  token: string | undefined | null,
  expectedTournamentId: string,
  currentAccessCodeHash?: string | null
): TokenVerificationResult {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return { valid: false, reason: 'MISSING_COOKIE' };
  }

  let secret: string;
  try {
    secret = getSigningSecret();
  } catch {
    return { valid: false, reason: 'MISSING_SECRET' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3 && parts.length !== 4) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }

  if (parts.length === 3) {
    const [tokenId, expStr, clientSig] = parts;
    if (!tokenId || tokenId !== expectedTournamentId) {
      return { valid: false, reason: 'CROSS_TOURNAMENT_TOKEN' };
    }
    const exp = parseInt(expStr, 10);
    if (isNaN(exp)) {
      return { valid: false, reason: 'MALFORMED_TOKEN' };
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds > exp) {
      return { valid: false, reason: 'EXPIRED_TOKEN' };
    }
    const payload = `${tokenId}.${expStr}`;
    const expectedSigBase64 = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const expectedSigHex = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const matchBase64 =
      clientSig.length === expectedSigBase64.length &&
      crypto.timingSafeEqual(Buffer.from(clientSig), Buffer.from(expectedSigBase64));
    const matchHex =
      clientSig.length === expectedSigHex.length &&
      crypto.timingSafeEqual(Buffer.from(clientSig), Buffer.from(expectedSigHex));

    if (!matchBase64 && !matchHex) {
      return { valid: false, reason: 'INVALID_SIGNATURE' };
    }
    if (currentAccessCodeHash !== undefined && currentAccessCodeHash !== null) {
      return { valid: false, reason: 'PASSWORD_ROTATED' };
    }
    return { valid: true, tournamentId: tokenId, expiresAt: exp };
  }

  const [tokenId, expStr, tokenFingerprint, clientSig] = parts;

  // 1. Check tournament binding
  if (!tokenId || tokenId !== expectedTournamentId) {
    return { valid: false, reason: 'CROSS_TOURNAMENT_TOKEN' };
  }

  // 2. Check expiration timestamp
  const exp = parseInt(expStr, 10);
  if (isNaN(exp)) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds > exp) {
    return { valid: false, reason: 'EXPIRED_TOKEN' };
  }

  // 3. Verify cryptographic HMAC signature
  try {
    const payload = `${tokenId}.${expStr}.${tokenFingerprint}`;
    const expectedSigBase64 = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64url');
    const expectedSigHex = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const matchBase64 =
      clientSig.length === expectedSigBase64.length &&
      crypto.timingSafeEqual(Buffer.from(clientSig), Buffer.from(expectedSigBase64));
    const matchHex =
      clientSig.length === expectedSigHex.length &&
      crypto.timingSafeEqual(Buffer.from(clientSig), Buffer.from(expectedSigHex));

    if (!matchBase64 && !matchHex) {
      return { valid: false, reason: 'INVALID_SIGNATURE' };
    }

    // 4. Verify password-state fingerprint if current hash is provided
    if (currentAccessCodeHash !== undefined) {
      const expectedFingerprint = computePasswordFingerprint(currentAccessCodeHash);
      if (tokenFingerprint !== expectedFingerprint) {
        return { valid: false, reason: 'PASSWORD_ROTATED' };
      }
    }

    return {
      valid: true,
      tournamentId: tokenId,
      expiresAt: exp,
    };
  } catch {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }
}

/**
 * Standard cookie name helper for tournament access
 */
export function getTournamentCookieName(tournamentId: string): string {
  return `t_access_${tournamentId}`;
}
