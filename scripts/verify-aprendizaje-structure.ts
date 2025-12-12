/**
 * Verification script for PROGRESION-APRENDIZAJE.md structure
 *
 * Expected structure:
 * - 6 OBJETIVOS total
 * - 17 ACCIONES distributed as:
 *   - Objetivo 1: 5 acciones
 *   - Objetivo 2: 4 acciones
 *   - Objetivo 3: 2 acciones
 *   - Objetivo 4: 2 acciones
 *   - Objetivo 5: 2 acciones
 *   - Objetivo 6: 2 acciones
 * - 68 total sections (17 acciones × 4 sections each)
 */

import fs from 'fs';
import path from 'path';

interface VerificationResult {
  success: boolean;
  objetivoCount: number;
  accionCount: number;
  accionesByObjetivo: Record<string, number>;
  totalSections: number;
  errors: string[];
}

function verifyAprendizajeStructure(): VerificationResult {
  const result: VerificationResult = {
    success: true,
    objetivoCount: 0,
    accionCount: 0,
    accionesByObjetivo: {},
    totalSections: 0,
    errors: [],
  };

  try {
    // Read the markdown file
    const filePath = path.join(process.cwd(), 'Progresión', 'PROGRESION-APRENDIZAJE.md');
    if (!fs.existsSync(filePath)) {
      result.success = false;
      result.errors.push(`File not found: ${filePath}`);
      return result;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let currentObjetivo = '';
    let accionesInCurrentObjetivo = 0;

    // Count OBJETIVOs and ACCIONEs
    for (const line of lines) {
      const trimmedLine = line.trim();

      // Match OBJETIVO pattern
      const objetivoMatch = trimmedLine.match(/^OBJETIVO\s+(\d+):/i);
      if (objetivoMatch) {
        // Save previous objetivo's action count
        if (currentObjetivo) {
          result.accionesByObjetivo[currentObjetivo] = accionesInCurrentObjetivo;
        }

        currentObjetivo = `objetivo${objetivoMatch[1]}`;
        accionesInCurrentObjetivo = 0;
        result.objetivoCount++;
        continue;
      }

      // Match ACCIÓN pattern
      const accionMatch = trimmedLine.match(/^ACCIÓN\s+(\d+):/i);
      if (accionMatch) {
        result.accionCount++;
        accionesInCurrentObjetivo++;
      }
    }

    // Save last objetivo's action count
    if (currentObjetivo) {
      result.accionesByObjetivo[currentObjetivo] = accionesInCurrentObjetivo;
    }

    // Calculate total sections (each acción has 4 sections)
    result.totalSections = result.accionCount * 4;

    // Validate expected values
    const expectedObjetivos = 6;
    const expectedAcciones = 17;
    const expectedSections = 68;
    const expectedDistribution: Record<string, number> = {
      objetivo1: 5,
      objetivo2: 4,
      objetivo3: 2,
      objetivo4: 2,
      objetivo5: 2,
      objetivo6: 2,
    };

    // Check objetivo count
    if (result.objetivoCount !== expectedObjetivos) {
      result.success = false;
      result.errors.push(
        `Expected ${expectedObjetivos} objetivos, found ${result.objetivoCount}`
      );
    }

    // Check acción count
    if (result.accionCount !== expectedAcciones) {
      result.success = false;
      result.errors.push(
        `Expected ${expectedAcciones} acciones, found ${result.accionCount}`
      );
    }

    // Check section count
    if (result.totalSections !== expectedSections) {
      result.success = false;
      result.errors.push(
        `Expected ${expectedSections} sections, calculated ${result.totalSections}`
      );
    }

    // Check distribution
    for (const [objetivo, expectedCount] of Object.entries(expectedDistribution)) {
      const actualCount = result.accionesByObjetivo[objetivo] || 0;
      if (actualCount !== expectedCount) {
        result.success = false;
        result.errors.push(
          `${objetivo}: expected ${expectedCount} acciones, found ${actualCount}`
        );
      }
    }

  } catch (error) {
    result.success = false;
    result.errors.push(`Error reading file: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

// Run verification
console.log('🔍 Verifying PROGRESION-APRENDIZAJE.md structure...\n');

const result = verifyAprendizajeStructure();

// Display results
console.log('📊 Results:');
console.log(`  Objetivos found: ${result.objetivoCount}`);
console.log(`  Acciones found: ${result.accionCount}`);
console.log(`  Total sections: ${result.totalSections}`);
console.log('\n📋 Distribution by Objetivo:');
for (const [objetivo, count] of Object.entries(result.accionesByObjetivo)) {
  console.log(`  ${objetivo}: ${count} acciones`);
}

if (result.success) {
  console.log('\n✅ VERIFICATION PASSED');
  console.log('Structure matches expected format:');
  console.log('  - 6 objetivos');
  console.log('  - 17 acciones');
  console.log('  - 68 total sections (17 × 4)');
  process.exit(0);
} else {
  console.log('\n❌ VERIFICATION FAILED');
  console.log('Errors:');
  result.errors.forEach(error => console.log(`  - ${error}`));
  process.exit(1);
}
