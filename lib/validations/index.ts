import { z } from 'zod';

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
 * Shared Gmail email schema for signup and recovery flows.
 */
export const gmailSchema = z
  .string()
  .trim()
  .min(1, 'Email address is required')
  .email('Please enter a valid email address')
  .refine(
    (val) => isGmailAddress(val),
    { message: 'Only @gmail.com addresses are accepted (e.g. player@gmail.com)' }
  );

/**
 * E.164-compatible international WhatsApp phone validation schema.
 */
export const whatsappNumberSchema = z
  .string()
  .trim()
  .min(1, 'WhatsApp number is required')
  .regex(
    /^\+[1-9]\d{6,14}$/,
    'Please enter a valid WhatsApp number with country code in E.164 format (e.g. +919876543210)'
  );

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

/**
 * Canonical eFootball ID Zod Schema with auto-normalization and strict regex enforcement
 */
export const efootballIdSchema = z
  .string()
  .trim()
  .min(1, 'eFootball ID is required')
  .transform(normalizeEfootballId)
  .refine(isValidEfootballId, {
    message: 'eFootball ID must match format ABCD-123-456-789 (4 uppercase letters, then 9 digits in groups of 3)',
  });

/**
 * Minimum 12 characters password schema for new accounts.
 */
export const signupPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long');

/**
 * Public User Signup Schema
 */
export const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(80, 'Full name cannot exceed 80 characters'),
  email: gmailSchema,
  password: signupPasswordSchema,
  efootballId: efootballIdSchema,
  whatsappNumber: whatsappNumberSchema,
});

export type SignupInput = z.infer<typeof signupSchema>;

/**
 * Player Profile Update Schema
 */
export const profileUpdateSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(80, 'Full name cannot exceed 80 characters'),
  efootballId: efootballIdSchema,
  whatsappNumber: whatsappNumberSchema,
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/**
 * Forgot Password Schema
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email address is required')
    .email('Please enter a valid email address'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * Reset Password Schema
 */
export const resetPasswordSchema = z
  .object({
    password: signupPasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const tournamentSchema = z
  .object({
    name: z
      .string()
      .min(3, 'Tournament name must be at least 3 characters')
      .max(100, 'Tournament name must not exceed 100 characters'),
    description: z.string().optional().nullable(),
    format: z.enum(['knockout', 'league', 'group_knockout', 'single_league_knockout'], {
      message: 'Please select a valid tournament format',
    }),
    status: z.enum(['draft', 'registration', 'ongoing', 'completed'], {
      message: 'Please select a valid status',
    }),
    start_date: z.string().optional().nullable(),
    end_date: z.string().optional().nullable(),
    registration_deadline: z.string().optional().nullable(),
    rules_text: z.string().optional().nullable(),
    banner_image: z
      .string()
      .refine(
        (val) => !val || val === '' || val.startsWith('/') || /^https?:\/\//i.test(val),
        { message: 'Banner image must be a valid URL or image path (e.g. /images/banner1.jpg)' }
      )
      .optional()
      .nullable(),
    max_participants: z
      .number({ message: 'Max participants is required' })
      .int('Must be a whole integer')
      .min(2, 'Minimum 2 participants required')
      .max(1024, 'Maximum 1024 participants allowed'),
    rounds_per_pair: z
      .number({ message: 'Rounds per pair must be a number' })
      .int('Must be a whole integer')
      .min(1, 'Minimum 1 round required')
      .max(4, 'Maximum 4 rounds allowed')
      .optional()
      .nullable(),
    qualifiers_per_group: z
      .number({ message: 'Qualifiers per group must be a number' })
      .int('Must be a whole integer')
      .min(1, 'Minimum 1 qualifier required')
      .max(8, 'Maximum 8 qualifiers allowed')
      .optional()
      .nullable(),
    is_paid: z.boolean().default(false),
    entry_fee_rupees: z
      .number()
      .min(0, 'Entry fee cannot be negative')
      .max(50000, 'Entry fee cannot exceed ₹50,000')
      .optional()
      .nullable(),
    entry_fee_paise: z.number().int().min(0).optional().nullable(),
    prize_pool_rupees: z
      .number()
      .min(0, 'Prize pool cannot be negative')
      .max(10000000, 'Prize pool cannot exceed ₹1,00,00,000')
      .optional()
      .nullable(),
    prize_pool_paise: z.number().int().min(0).optional().nullable(),
    currency: z.string().default('INR').optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.start_date && data.end_date) {
        return new Date(data.end_date) >= new Date(data.start_date);
      }
      return true;
    },
    {
      message: 'End date cannot be earlier than start date',
      path: ['end_date'],
    }
  )
  .refine(
    (data) => {
      if (data.registration_deadline && data.start_date) {
        return new Date(data.registration_deadline) <= new Date(data.start_date);
      }
      return true;
    },
    {
      message: 'Registration deadline cannot be after tournament start date',
      path: ['registration_deadline'],
    }
  )
  .refine(
    (data) => {
      if (data.is_paid && data.status === 'registration') {
        const hasFeeRupees = typeof data.entry_fee_rupees === 'number' && data.entry_fee_rupees > 0;
        const hasFeePaise = typeof data.entry_fee_paise === 'number' && data.entry_fee_paise > 0;
        return hasFeeRupees || hasFeePaise;
      }
      return true;
    },
    {
      message: 'Paid tournaments open for registration must specify an entry fee greater than ₹0',
      path: ['entry_fee_rupees'],
    }
  );

export type TournamentInput = z.infer<typeof tournamentSchema>;

export const participantSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, 'Username / Gamertag must be at least 2 characters')
    .max(50, 'Username / Gamertag must not exceed 50 characters'),
  real_name: z.string().max(100, 'Real name must not exceed 100 characters').optional().nullable(),
  contact_info: z.string().max(100, 'Contact information must not exceed 100 characters').optional().nullable(),
  seed_number: z
    .number({ message: 'Seed must be a valid number' })
    .int('Seed must be a whole integer')
    .positive('Seed number must be positive')
    .max(1024, 'Seed number cannot exceed 1024')
    .optional()
    .nullable(),
});

export type ParticipantInput = z.infer<typeof participantSchema>;

export const matchResultSchema = z
  .object({
    score_a: z
      .number({ message: 'Score for Participant A is required' })
      .int('Score must be a whole number')
      .min(0, 'Score cannot be negative'),
    score_b: z
      .number({ message: 'Score for Participant B is required' })
      .int('Score must be a whole number')
      .min(0, 'Score cannot be negative'),
    decided_by: z.enum(['normal', 'penalties', 'extra_time']).optional().nullable(),
    penalty_score_a: z
      .number({ message: 'Penalty score A must be a number' })
      .int('Penalty score A must be a whole number')
      .min(0, 'Penalty score cannot be negative')
      .optional()
      .nullable(),
    penalty_score_b: z
      .number({ message: 'Penalty score B must be a number' })
      .int('Penalty score B must be a whole number')
      .min(0, 'Penalty score cannot be negative')
      .optional()
      .nullable(),
    result_type: z.enum(['normal', 'walkover', 'disqualification'], {
      message: 'Please select a valid result type',
    }),
    walkover_winner_id: z.string().optional().nullable(),
    notes: z.string().max(500, 'Notes must not exceed 500 characters').optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.result_type === 'normal' && data.decided_by === 'penalties') {
        if (data.penalty_score_a === null || data.penalty_score_a === undefined) return false;
        if (data.penalty_score_b === null || data.penalty_score_b === undefined) return false;
        if (data.penalty_score_a === data.penalty_score_b) return false;
      }
      return true;
    },
    {
      message: 'Penalty shootout scores are required and cannot be tied.',
      path: ['penalty_score_a'],
    }
  );

export type MatchResultInput = z.infer<typeof matchResultSchema>;
