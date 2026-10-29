import * as fs from 'fs';
import * as path from 'path';

function verifyGroupsUiContrast() {
  console.log('--- Checking app/admin/tournaments/[id]/groups/page.tsx ---');
  const mainGroupsPage = fs.readFileSync(
    path.join(__dirname, '../app/admin/tournaments/[id]/groups/page.tsx'),
    'utf-8'
  );

  if (mainGroupsPage.includes('variant="outline"')) {
    throw new Error('Found variant="outline" in groups/page.tsx which renders invisible white text!');
  }
  console.log('✅ Zero variant="outline" found in groups/page.tsx.');

  if (!mainGroupsPage.includes('#0A0D14')) {
    throw new Error('groups/page.tsx missing #0A0D14 rich black styling.');
  }
  console.log('✅ Rich black #0A0D14 styling present in groups/page.tsx.');

  console.log('\n--- Checking components/group modals ---');
  const modalFiles = [
    'CustomGroupEditorModal.tsx',
    'EditGroupParticipantsModal.tsx',
    'EditPointsTableModal.tsx',
    'LeagueQualificationModal.tsx',
  ];

  for (const file of modalFiles) {
    const content = fs.readFileSync(path.join(__dirname, '../components/group', file), 'utf-8');
    if (content.includes('variant="outline"')) {
      throw new Error(`Found variant="outline" in components/group/${file}`);
    }
    console.log(`✅ Zero variant="outline" in components/group/${file}.`);
  }

  console.log('\n========================================');
  console.log('🎉 ALL GROUPS UI CONTRAST CHECKS PASSED!');
  console.log('========================================');
}

verifyGroupsUiContrast();
