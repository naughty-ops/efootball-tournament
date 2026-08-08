import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const tournamentSchema = z
  .object({
    name: z
      .string()
      .min(3, 'Tournament name must be at least 3 characters')
      .max(100, 'Tournament name must not exceed 100 characters'),
    description: z.string().optional().nullable(),
    format: z.enum(['knockout', 'league', 'group_knockout'], {
      message: 'Please select a valid tournament format',
    }),
    status: z.enum(['draft', 'registration', 'ongoing', 'completed'], {
      message: 'Please select a valid status',
    }),
    start_date: z.string().optional().nullable(),
    end_date: z.string().optional().nullable(),
    rules_text: z.string().optional().nullable(),
    banner_image: z
      .string()
      .url('Please enter a valid URL for the banner image')
      .or(z.literal(''))
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

export const matchResultSchema = z.object({
  score_a: z
    .number({ message: 'Score for Participant A is required' })
    .int('Score must be a whole number')
    .min(0, 'Score cannot be negative'),
  score_b: z
    .number({ message: 'Score for Participant B is required' })
    .int('Score must be a whole number')
    .min(0, 'Score cannot be negative'),
  result_type: z.enum(['normal', 'walkover', 'disqualification'], {
    message: 'Please select a valid result type',
  }),
  walkover_winner_id: z.string().optional().nullable(),
  notes: z.string().max(500, 'Notes must not exceed 500 characters').optional().nullable(),
});

export type MatchResultInput = z.infer<typeof matchResultSchema>;
