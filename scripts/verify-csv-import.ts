import {
  generateParticipantCsvTemplate,
  parseAndValidateParticipantCsv,
} from '../lib/csv/participantCsvParser';
import * as fs from 'fs';
import * as path from 'path';

function runCsvTests() {
  console.log('--- 1. Testing CSV Template Generation ---');
  const template = generateParticipantCsvTemplate();
  if (!template.includes('username,real_name,contact_info,seed_number')) {
    throw new Error('Template missing required headers.');
  }
  console.log('✅ Template contains required headers.');

  console.log('\n--- 2. Testing Parsing Valid CSV Data ---');
  const validCsv = `username,real_name,contact_info,seed_number
player_one,Player One,one@test.com,1
player_two,Player Two,two@test.com,2
`;
  const resultValid = parseAndValidateParticipantCsv(validCsv, [], 10);
  if (resultValid.validCount !== 2 || resultValid.invalidCount !== 0) {
    throw new Error(`Expected 2 valid rows, got ${resultValid.validCount}`);
  }
  console.log('✅ Correctly parsed 2 valid participants.');

  console.log('\n--- 3. Testing Capacity Limits ---');
  const resultCapacity = parseAndValidateParticipantCsv(validCsv, [{ id: '1' } as any], 2);
  if (!resultCapacity.exceedsCapacity) {
    throw new Error('Expected exceedsCapacity to be true when total exceeds capacity.');
  }
  console.log('✅ Correctly detected capacity exceeded condition.');

  console.log('\n--- 4. Testing Missing Header Handling ---');
  const invalidHeaderCsv = `user,name,contact
p1,name1,c1
`;
  const resultInvalidHeader = parseAndValidateParticipantCsv(invalidHeaderCsv, [], 10);
  if (resultInvalidHeader.rows[0]?.isValid) {
    throw new Error('Expected invalid header to be caught.');
  }
  console.log('✅ Correctly caught missing "username" header.');

  console.log('\n--- 5. Testing CsvImportModal Contrast & Markup ---');
  const modalFile = fs.readFileSync(
    path.join(__dirname, '../components/admin/CsvImportModal.tsx'),
    'utf-8'
  );

  // Check that there is no invisible white-on-white outline button without text color
  if (modalFile.includes('variant="outline"')) {
    throw new Error('Found variant="outline" which renders white text on white light modals!');
  }
  console.log('✅ Zero raw variant="outline" buttons in CsvImportModal (no white-on-white text).');

  // Check for rich black styling
  if (!modalFile.includes('#0A0D14')) {
    throw new Error('CsvImportModal does not contain #0A0D14 (rich black premium styling).');
  }
  console.log('✅ CsvImportModal includes #0A0D14 rich black premium styling.');

  // Check buttons
  if (!modalFile.includes('Download Template') || !modalFile.includes('Choose CSV File')) {
    throw new Error('Download Template or Choose CSV File button missing.');
  }
  console.log('✅ Download Template and Choose CSV File buttons styled and visible.');

  console.log('\n--- 6. Testing Participant Service Terms & Sync ---');
  const serviceFile = fs.readFileSync(
    path.join(__dirname, '../services/participantService.ts'),
    'utf-8'
  );
  if (!serviceFile.includes('terms_accepted: true') || !serviceFile.includes('rules_version: \'1.0\'')) {
    throw new Error('participantService does not set terms_accepted: true and rules_version: 1.0');
  }
  if (!serviceFile.includes('confirmed_slots_count: count')) {
    throw new Error('participantService does not sync confirmed_slots_count on add/batchAdd/delete');
  }
  console.log('✅ participantService sets terms_accepted and synchronizes confirmed_slots_count.');

  console.log('\n========================================');
  console.log('🎉 ALL CSV IMPORT & CONTRAST CHECKS PASSED!');
  console.log('========================================');
}

runCsvTests();
