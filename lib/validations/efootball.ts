/**
 * Pure, lightweight validation and normalization helpers for eFootball credentials and email.
 * ZERO external dependencies (e.g. Zod-free) to keep client bundle sizes minimal.
 */

/**
 * Validates that an email address has exactly a "gmail.com" domain (case-insensitive).
 */
export function isGmailAddress(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length === 0) return false;
  return domain === 'gmail.com';
}

/**
 * Standard eFootball ID Pattern: Exactly 4 uppercase letters followed by 9 digits in groups of 3
 * e.g. ABCD-123-456-789
 */
export const EFOOTBALL_ID_REGEX = /^[A-Z]{4}-[0-9]{3}-[0-9]{3}-[0-9]{3}$/;

/**
 * Canonical normalizer for eFootball IDs.
 * Strips superfluous whitespace, converts letters to uppercase,
 * and formats continuous 13-character strings (4 letters + 9 digits) with hyphens.
 */
export function normalizeEfootballId(val: string): string {
  if (!val || typeof val !== 'string') return '';
  const trimmed = val.trim().toUpperCase();
  // Auto-format 13 continuous chars (e.g. ABCD123456789 -> ABCD-123-456-789)
  if (/^[A-Z]{4}[0-9]{9}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 7)}-${trimmed.slice(7, 10)}-${trimmed.slice(10, 13)}`;
  }
  return trimmed;
}

/**
 * Pure validator testing against the exact eFootball ID regex: ^[A-Z]{4}-[0-9]{3}-[0-9]{3}-[0-9]{3}$
 */
export function isValidEfootballId(val: string): boolean {
  if (!val || typeof val !== 'string') return false;
  return EFOOTBALL_ID_REGEX.test(normalizeEfootballId(val));
}
