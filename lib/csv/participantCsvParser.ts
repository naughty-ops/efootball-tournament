import type { ParticipantInput } from '@/lib/validations';
import type { Participant } from '@/types/database';

export interface CsvParsedRow {
  rowIndex: number;
  rawUsername: string;
  rawRealName: string;
  rawContactInfo: string;
  rawSeedNumber: string;
  parsedInput: ParticipantInput | null;
  isValid: boolean;
  errorMessage: string | null;
}

export interface CsvValidationResult {
  rows: CsvParsedRow[];
  validCount: number;
  invalidCount: number;
  availableCapacity: number;
  exceedsCapacity: boolean;
}

/**
 * Generate CSV template content for download
 */
export function generateParticipantCsvTemplate(): string {
  return `username,real_name,contact_info,seed_number
Player_Alex,Alex Mercer,alex@example.com,1
Pro_Sam,Sam Wilson,sam@example.com,2
Shadow_Rider,Chris Vance,,3
Gamer_Z,,gamerz@example.com,
`;
}

/**
 * Helper to split CSV lines taking quoted values into account
 */
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values.map((val) => val.replace(/^"|"$/g, '').trim());
}

/**
 * Parse and validate raw CSV string against existing tournament participants and capacity limits
 */
export function parseAndValidateParticipantCsv(
  csvContent: string,
  existingParticipants: Participant[],
  maxParticipants: number
): CsvValidationResult {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      rows: [],
      validCount: 0,
      invalidCount: 0,
      availableCapacity: Math.max(0, maxParticipants - existingParticipants.length),
      exceedsCapacity: false,
    };
  }

  // Parse header line
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const usernameIdx = headers.indexOf('username');
  const realNameIdx = headers.indexOf('real_name');
  const contactInfoIdx = headers.indexOf('contact_info');
  const seedNumberIdx = headers.indexOf('seed_number');

  if (usernameIdx === -1) {
    return {
      rows: [
        {
          rowIndex: 1,
          rawUsername: '',
          rawRealName: '',
          rawContactInfo: '',
          rawSeedNumber: '',
          parsedInput: null,
          isValid: false,
          errorMessage: 'CSV Header Error: Missing required "username" column.',
        },
      ],
      validCount: 0,
      invalidCount: 1,
      availableCapacity: Math.max(0, maxParticipants - existingParticipants.length),
      exceedsCapacity: false,
    };
  }

  // Sets to track duplicates
  const existingUsernamesSet = new Set(existingParticipants.map((p) => p.username.toLowerCase()));
  const existingSeedsSet = new Set(
    existingParticipants
      .filter((p) => p.seed_number !== null && p.seed_number !== undefined)
      .map((p) => p.seed_number as number)
  );

  const seenCsvUsernames = new Set<string>();
  const seenCsvSeeds = new Set<number>();

  const parsedRows: CsvParsedRow[] = [];
  let validCount = 0;
  let invalidCount = 0;

  // Process data lines
  for (let i = 1; i < lines.length; i++) {
    const rawCols = parseCsvLine(lines[i]);
    const rawUsername = (rawCols[usernameIdx] || '').trim();
    const rawRealName = realNameIdx !== -1 ? (rawCols[realNameIdx] || '').trim() : '';
    const rawContactInfo = contactInfoIdx !== -1 ? (rawCols[contactInfoIdx] || '').trim() : '';
    const rawSeedStr = seedNumberIdx !== -1 ? (rawCols[seedNumberIdx] || '').trim() : '';

    let isValid = true;
    let errorMessage: string | null = null;
    let seedNum: number | null = null;

    // 1. Username Validation
    if (!rawUsername) {
      isValid = false;
      errorMessage = 'Username / Gamertag is required.';
    } else if (rawUsername.length < 2) {
      isValid = false;
      errorMessage = 'Username must be at least 2 characters.';
    } else if (rawUsername.length > 50) {
      isValid = false;
      errorMessage = 'Username exceeds maximum length of 50.';
    } else if (existingUsernamesSet.has(rawUsername.toLowerCase())) {
      isValid = false;
      errorMessage = `Participant "${rawUsername}" already exists in this tournament.`;
    } else if (seenCsvUsernames.has(rawUsername.toLowerCase())) {
      isValid = false;
      errorMessage = `Duplicate username "${rawUsername}" found within CSV file.`;
    }

    // 2. Seed Number Validation
    if (isValid && rawSeedStr) {
      const parsedSeed = parseInt(rawSeedStr, 10);
      if (isNaN(parsedSeed) || parsedSeed <= 0) {
        isValid = false;
        errorMessage = `Invalid seed number "${rawSeedStr}". Must be a positive integer.`;
      } else if (existingSeedsSet.has(parsedSeed)) {
        isValid = false;
        errorMessage = `Seed number ${parsedSeed} is already assigned to another participant in this tournament.`;
      } else if (seenCsvSeeds.has(parsedSeed)) {
        isValid = false;
        errorMessage = `Duplicate seed number ${parsedSeed} found within CSV file.`;
      } else {
        seedNum = parsedSeed;
      }
    }

    if (isValid) {
      seenCsvUsernames.add(rawUsername.toLowerCase());
      if (seedNum !== null) {
        seenCsvSeeds.add(seedNum);
      }
      validCount++;
    } else {
      invalidCount++;
    }

    parsedRows.push({
      rowIndex: i + 1,
      rawUsername,
      rawRealName,
      rawContactInfo,
      rawSeedNumber: rawSeedStr,
      parsedInput: isValid
        ? {
            username: rawUsername,
            real_name: rawRealName || null,
            contact_info: rawContactInfo || null,
            seed_number: seedNum,
          }
        : null,
      isValid,
      errorMessage,
    });
  }

  const currentCount = existingParticipants.length;
  const availableCapacity = Math.max(0, maxParticipants - currentCount);
  const exceedsCapacity = currentCount + validCount > maxParticipants;

  return {
    rows: parsedRows,
    validCount,
    invalidCount,
    availableCapacity,
    exceedsCapacity,
  };
}
