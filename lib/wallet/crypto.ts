import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Derives a consistent 32-byte (256-bit) encryption key from server environment secrets.
 * Never exposed to the browser or logged in stdout.
 */
function getDerivedKey(): Buffer {
  const secret = process.env.WALLET_ENCRYPTION_SECRET || process.env.WALLET_ENCRYPTION_KEY;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL SECURITY ERROR: Dedicated WALLET_ENCRYPTION_SECRET is required in production environment. Refusing to operate with missing or fallback credentials.'
      );
    }
    throw new Error(
      'WALLET_ENCRYPTION_SECRET is not configured in environment. Dedicated financial encryption secret is required.'
    );
  }

  return crypto.createHash('sha256').update(`efootball-wallet-kdf:${secret}`).digest();
}

/**
 * Encrypts a sensitive string (such as a bank account number) using AES-256-GCM.
 * Output format: iv:authTag:ciphertext (hex encoded)
 */
export function encryptSensitiveField(plainText: string): string {
  if (!plainText || typeof plainText !== 'string') {
    throw new Error('Invalid plainText for encryption');
  }

  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText.trim(), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an encrypted sensitive string using AES-256-GCM.
 * Validates the authentication tag to prevent tampering.
 */
export function decryptSensitiveField(encryptedPayload: string): string {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') {
    throw new Error('Invalid payload for decryption');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Corrupted or invalid encrypted payload structure');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getDerivedKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Masks an account number for safe display in interfaces.
 * Never logs or exposes full digits.
 * Example: "123456789012" -> "XXXX XXXX 9012"
 */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '');
  if (digits.length <= 4) {
    return `XXXX ${digits}`;
  }
  const last4 = digits.slice(-4);
  return `XXXX XXXX ${last4}`;
}

/**
 * Validates Indian bank account number (typically 9 to 18 digits).
 */
export function isValidAccountNumber(accountNumber: string): boolean {
  const cleaned = accountNumber.replace(/[\s-]/g, '');
  return /^\d{9,18}$/.test(cleaned);
}

/**
 * Validates Indian Financial System Code (IFSC).
 * 11 characters: 4 letters + '0' + 6 alphanumeric characters.
 * Example: SBIN0001234, HDFC0000001
 */
export function isValidIfscCode(ifsc: string): boolean {
  if (!ifsc) return false;
  const normalized = ifsc.trim().toUpperCase();
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalized);
}

/**
 * Validates UPI ID / Google Pay handle.
 * Format: username@provider (e.g., agraj@okaxis, player@upi, 9207516227@paytm)
 */
export function isValidUpiId(upiId: string): boolean {
  if (!upiId) return false;
  const normalized = upiId.trim();
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(normalized);
}
