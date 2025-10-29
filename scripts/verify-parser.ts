/**
 * Verification script for parsePersonalizacionQuestions
 * Run with: npx ts-node scripts/verify-parser.ts
 */

import fs from 'fs';
import path from 'path';
import { parsePersonalizacionMD, getFlattenedSections } from '../utils/parsePersonalizacionQuestions';

// Read the file content
const filePath = path.join(process.cwd(), 'PERSONALIZACION.md');
const fileContent = fs.readFileSync(filePath, 'utf-8');

try {
  console.log('🔍 Parsing PERSONALIZACION.md...\n');

  // Parse the content
  const result = parsePersonalizacionMD(fileContent);

  console.log('✅ Parser completed successfully!\n');
  console.log(`📊 Total ACCIONes found: ${result.acciones.length}`);
  console.log(`📊 Total sections returned: ${result.totalSections}\n`);

  // Check objective distribution
  const objetivoCounts: Record<number, number> = {};
  result.acciones.forEach(accion => {
    objetivoCounts[accion.objetivoNumber] = (objetivoCounts[accion.objetivoNumber] || 0) + 1;
  });

  console.log('📈 Objective distribution:');
  for (let i = 1; i <= 6; i++) {
    const count = objetivoCounts[i] || 0;
    const status = count > 0 ? '✅' : '❌';
    console.log(`   ${status} Objetivo ${i}: ${count} ACCIÓN(es)`);
  }
  console.log('');

  // Check sections per acción
  console.log('📋 Sections per ACCIÓN:');
  result.acciones.forEach(accion => {
    const sectionTypes = accion.sections.map(s => s.type).join(', ');
    const status = accion.sections.length === 4 ? '✅' : '❌';
    console.log(`   ${status} ${accion.id}: ${accion.sections.length} sections (${sectionTypes})`);
  });
  console.log('');

  // Get flattened sections
  const flattened = getFlattenedSections(result);
  console.log(`📊 Flattened sections: ${flattened.length}\n`);

  // Verify all sections have required fields
  const invalidSections = flattened.filter(s =>
    !s.section.type || !s.section.questions || s.section.questions.length === 0
  );

  if (invalidSections.length > 0) {
    console.log(`❌ Found ${invalidSections.length} invalid sections:\n`);
    invalidSections.forEach(s => {
      console.log(`   - ${s.accionId}_${s.section.type}: missing ${!s.section.type ? 'type' : 'questions'}`);
    });
  } else {
    console.log('✅ All sections have required fields');
  }

  // Final validation
  console.log('\n🎯 Final Validation:');
  console.log(`   ${result.acciones.length === 11 ? '✅' : '❌'} Expected 11 ACCIONes: ${result.acciones.length === 11 ? 'PASS' : `FAIL (got ${result.acciones.length})`}`);
  console.log(`   ${result.totalSections === 44 ? '✅' : '❌'} Expected 44 sections: ${result.totalSections === 44 ? 'PASS' : `FAIL (got ${result.totalSections})`}`);
  console.log(`   ${flattened.length === 44 ? '✅' : '❌'} Flattened to 44: ${flattened.length === 44 ? 'PASS' : `FAIL (got ${flattened.length})`}`);

  const allHave4Sections = result.acciones.every(a => a.sections.length === 4);
  console.log(`   ${allHave4Sections ? '✅' : '❌'} All ACCIONes have 4 sections: ${allHave4Sections ? 'PASS' : 'FAIL'}`);

  const allObjectivesPresent = [1, 2, 3, 4, 5, 6].every(n => objetivoCounts[n] > 0);
  console.log(`   ${allObjectivesPresent ? '✅' : '❌'} All objectives present: ${allObjectivesPresent ? 'PASS' : 'FAIL'}`);

  // Quality score
  let score = 0;
  if (result.acciones.length === 11) score += 2;
  if (result.totalSections === 44) score += 2;
  if (flattened.length === 44) score += 2;
  if (allHave4Sections) score += 2;
  if (allObjectivesPresent) score += 2;

  console.log(`\n📊 Code quality score: ${score}/10\n`);

  if (score === 10) {
    console.log('🎉 ALL VALIDATIONS PASSED! Parser is working correctly.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some validations failed. Please review the issues above.\n');
    process.exit(1);
  }

} catch (error) {
  console.error('\n❌ Parser validation FAILED:\n');
  if (error instanceof Error) {
    console.error(`   ${error.message}\n`);
  } else {
    console.error('   Unknown error\n');
  }
  process.exit(1);
}
