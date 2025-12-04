/**
 * Import Evaluación rubric from PROGRESION-EVALUACION.md to Supabase
 *
 * Usage:
 *   npx tsx scripts/import-evaluacion-from-md.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { parseEvaluacionMD, getFlattenedSections } from '../utils/parseEvaluacionQuestions';

type DimensionKey = 'cobertura' | 'frecuencia' | 'profundidad';

interface RubricRecord {
  area: string;
  objective_number: number;
  objective_text: string;
  action_number: number;
  action_text: string;
  dimension: DimensionKey;
  level_1_descriptor: string;
  level_2_descriptor: string;
  level_3_descriptor: string;
  level_4_descriptor: string;
  initial_questions: string[];
  display_order: number;
}

const REQUIRED_ENV_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

function assertEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}

async function importEvaluacionRubric(): Promise<void> {
  assertEnv();

  const mdPath = path.join(process.cwd(), 'Progresión', 'PROGRESION-EVALUACION.md');
  console.log('📥 Importing Evaluación rubric from markdown');
  console.log('   • File:', mdPath);

  if (!fs.existsSync(mdPath)) {
    throw new Error(`Markdown file not found: ${mdPath}`);
  }

  const content = fs.readFileSync(mdPath, 'utf-8');
  const parsed = parseEvaluacionMD(content);
  const sections = getFlattenedSections(parsed);

  console.log(`   • Parsed ${sections.length} sections`);

  const records: RubricRecord[] = [];
  let displayOrder = 0;

  for (const item of sections) {
    // Skip the 'accion' section type - we only want cobertura, frecuencia, profundidad
    if (item.section.type === 'accion') {
      continue;
    }

    displayOrder++;

    // Extract level descriptors from the section's levels array
    const levels = {
      incipiente: '',
      desarrollo: '',
      avanzado: '',
      consolidado: '',
    };

    if (item.section.levels) {
      for (const levelOpt of item.section.levels) {
        if (levelOpt.value === 'incipiente') {
          levels.incipiente = levelOpt.description;
        } else if (levelOpt.value === 'en_desarrollo') {
          levels.desarrollo = levelOpt.description;
        } else if (levelOpt.value === 'avanzado') {
          levels.avanzado = levelOpt.description;
        } else if (levelOpt.value === 'consolidado') {
          levels.consolidado = levelOpt.description;
        }
      }
    }

    records.push({
      area: 'evaluacion',
      objective_number: item.objetivoNumber,
      objective_text: item.objetivoTitle,
      action_number: item.accionNumber,
      action_text: item.accionDescription,
      dimension: item.section.type as DimensionKey,
      level_1_descriptor: levels.incipiente,
      level_2_descriptor: levels.desarrollo,
      level_3_descriptor: levels.avanzado,
      level_4_descriptor: levels.consolidado,
      initial_questions: item.section.questions || [],
      display_order: displayOrder,
    });
  }

  if (records.length === 0) {
    throw new Error('No records generated from markdown file');
  }

  console.log(`📝 Generated ${records.length} rubric records`);

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check for existing Evaluación records
  console.log('🔍 Checking for existing Evaluación rubric data...');
  const { data: existing, error: existingError } = await serviceSupabase
    .from('transformation_rubric')
    .select('id')
    .eq('area', 'evaluacion');

  if (existingError) {
    throw new Error(`Failed to check existing data: ${existingError.message}`);
  }

  if (existing && existing.length > 0) {
    console.log(`⚠️  Found ${existing.length} existing Evaluación records`);
    console.log('🗑️  Deleting existing records...');

    const { error: deleteError } = await serviceSupabase
      .from('transformation_rubric')
      .delete()
      .eq('area', 'evaluacion');

    if (deleteError) {
      throw new Error(`Failed to delete existing records: ${deleteError.message}`);
    }
  }

  console.log(`📝 Inserting ${records.length} records...`);
  const { error: insertError } = await serviceSupabase
    .from('transformation_rubric')
    .insert(records);

  if (insertError) {
    throw new Error(`Failed to insert records: ${insertError.message}`);
  }

  console.log('✅ Evaluación rubric imported successfully!');
  console.log(`   • Total records: ${records.length}`);
  console.log(`   • Objectives: ${Math.max(...records.map(r => r.objective_number))}`);
  console.log(`   • Actions: ${records.filter(r => r.dimension === 'cobertura').length}`);
}

importEvaluacionRubric().catch((error) => {
  console.error('❌ Import failed:', error);
  process.exit(1);
});
