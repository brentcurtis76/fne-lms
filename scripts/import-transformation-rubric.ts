/**
 * Importa la rúbrica de Vías de Transformación desde un Excel a Supabase.
 *
 * Uso:
 *   npx tsx scripts/import-transformation-rubric.ts [rutaExcel] [nombreHoja] [areaSlug]
 *
 * Ejemplo:
 *   npx tsx scripts/import-transformation-rubric.ts PROGRESION.xlsx Personalización personalizacion
 */

import 'dotenv/config';

import path from 'path';
import fs from 'fs';
import process from 'process';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

type DimensionKey = 'cobertura' | 'frecuencia' | 'profundidad';

interface ExcelRow {
  OBJETIVOS?: string | null;
  ACCION?: string | null;
  REFERENTE?: string | null;
  COBERTURA?: string | null;
  FRECUENCIA?: string | null;
  PROFUNDIDAD?: string | null;
}

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
    throw new Error(`Faltan variables de entorno para ejecutar el importador: ${missing.join(', ')}`);
  }
}

function normaliseQuestions(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split('?')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => `${segment}?`);
}

function parseLevels(raw?: string | null) {
  const template = {
    incipiente: '',
    desarrollo: '',
    avanzado: '',
    consolidado: '',
  };

  if (!raw) {
    return template;
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/^incipiente:/i.test(line)) {
      template.incipiente = line.replace(/^incipiente:\s*/i, '').trim();
    } else if (/^en desarrollo:/i.test(line)) {
      template.desarrollo = line.replace(/^en desarrollo:\s*/i, '').trim();
    } else if (/^avanzado:/i.test(line)) {
      template.avanzado = line.replace(/^avanzado:\s*/i, '').trim();
    } else if (/^consolidado:/i.test(line)) {
      template.consolidado = line.replace(/^consolidado:\s*/i, '').trim();
    }
  }

  return template;
}

function resolveArgs() {
  const rawArgs = process.argv.slice(2);
  const positional: string[] = [];
  const flags = new Set<string>();

  for (const arg of rawArgs) {
    if (arg.startsWith('--')) {
      flags.add(arg);
    } else {
      positional.push(arg);
    }
  }

  const filePath = positional[0] ?? 'PROGRESION.xlsx';
  const sheetName = positional[1] ?? 'PERSONALIZACION';
  const areaSlug = positional[2] ?? 'personalizacion';
  const force = flags.has('--force');

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`No se encontró el archivo de Excel en ${absolutePath}`);
  }

  const KNOWN_AREAS = [
    'personalizacion',
    'evaluacion',
    'colaboracion',
    'pedagogia',
    'tecnologia',
    'liderazgo',
    'comunidad',
  ];

  if (!KNOWN_AREAS.includes(areaSlug)) {
    console.warn(
      `⚠️  Advertencia: el área "${areaSlug}" no está en la lista conocida (${KNOWN_AREAS.join(', ')}).`
    );
  }

  return { absolutePath, sheetName, areaSlug, force };
}

async function importRubric(): Promise<void> {
  assertEnv();
  const { absolutePath, sheetName, areaSlug, force } = resolveArgs();

  console.log('📥 Importando rúbrica de transformación');
  console.log('   • Archivo:', absolutePath);
  console.log('   • Hoja:', sheetName);
  console.log('   • Área destino:', areaSlug);
  console.log('   • Modo forzado:', force ? 'sí' : 'no');

  const workbook = XLSX.readFile(absolutePath);
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`La hoja "${sheetName}" no existe en el Excel`);
  }

  const rows: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet, { range: 0, defval: null });
  if (rows.length === 0) {
    console.warn('⚠️  Hoja sin datos. No se generarán registros.');
    return;
  }

  const requiredColumns: Array<keyof ExcelRow> = [
    'OBJETIVOS',
    'ACCION',
    'REFERENTE',
    'COBERTURA',
    'FRECUENCIA',
    'PROFUNDIDAD',
  ];
  const actualColumns = Object.keys(rows[0] ?? {});
  const missingColumns = requiredColumns.filter((column) => !actualColumns.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`Columnas faltantes en Excel: ${missingColumns.join(', ')}`);
  }

  let currentObjective: string | null = null;
  let objectiveNumber = 0;
  let actionNumber = 0;
  let displayOrder = 0;
  const records: RubricRecord[] = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const nextRow = rows[index + 1];

    if (row.OBJETIVOS) {
      const trimmedObjective = row.OBJETIVOS.trim();
      if (trimmedObjective.length > 0 && trimmedObjective !== currentObjective) {
        currentObjective = trimmedObjective;
        objectiveNumber += 1;
        actionNumber = 0;
      }
    }

    if (row.ACCION && row.REFERENTE && currentObjective) {
      actionNumber += 1;

      const dimensions: DimensionKey[] = ['cobertura', 'frecuencia', 'profundidad'];
      for (const dimension of dimensions) {
        const maturityText = row[dimension.toUpperCase() as keyof ExcelRow];
        if (!maturityText) continue;

        const questionText = nextRow?.[dimension.toUpperCase() as keyof ExcelRow];
        const questions = normaliseQuestions(questionText as string | undefined);
        const levels = parseLevels(maturityText as string);

        displayOrder += 1;

        records.push({
          area: areaSlug,
          objective_number: objectiveNumber,
          objective_text: currentObjective,
          action_number: actionNumber,
          action_text: row.ACCION.trim(),
          dimension,
          level_1_descriptor: levels.incipiente,
          level_2_descriptor: levels.desarrollo,
          level_3_descriptor: levels.avanzado,
          level_4_descriptor: levels.consolidado,
          initial_questions: questions,
          display_order: displayOrder,
        });
      }

      // Las preguntas están en la fila siguiente, que debemos omitir en el loop principal.
      if (nextRow && !nextRow.REFERENTE) {
        index += 1;
      }
    }
  }

  if (records.length === 0) {
    throw new Error(
      `⚠️  No se generaron registros para el área "${areaSlug}". Verifica que la hoja "${sheetName}" tenga datos en las columnas requeridas.`
    );
  }

  console.log(`🗑️  Eliminando registros previos del área "${areaSlug}"...`);

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (!force) {
    const { data: existingRubric, error: existingRubricError } = await serviceSupabase
      .from('transformation_rubric')
      .select('id')
      .eq('area', areaSlug);

    if (existingRubricError) {
      throw new Error(
        `No se pudo obtener el estado actual del área ${areaSlug}: ${existingRubricError.message}`
      );
    }

    const rubricIds = (existingRubric ?? []).map((row) => row.id);

    if (rubricIds.length > 0) {
      const { count, error: existingResultsError } = await serviceSupabase
        .from('transformation_results')
        .select('id', { count: 'exact', head: true })
        .in('rubric_item_id', rubricIds);

      if (existingResultsError) {
        throw new Error(
          `No se pudo verificar si existen resultados asociados: ${existingResultsError.message}`
        );
      }

      if ((count ?? 0) > 0) {
        throw new Error(
          `❌ No se puede reimportar el área "${areaSlug}" porque existen ${count} resultados asociados.\n` +
            '   Usa el flag --force si confirmas que deseas eliminar los datos históricos.'
        );
      }
    }
  }

  const { error: deleteError } = await serviceSupabase
    .from('transformation_rubric')
    .delete()
    .eq('area', areaSlug);

  if (deleteError) {
    throw new Error(`No se pudo limpiar el área ${areaSlug}: ${deleteError.message}`);
  }

  console.log(`📝 Insertando ${records.length} registros...`);
  const { error: insertError } = await serviceSupabase
    .from('transformation_rubric')
    .insert(records, { returning: 'minimal' });

  if (insertError) {
    throw insertError;
  }

  console.log('✅ Importación completada con éxito.');
}

importRubric().catch((error) => {
  console.error('❌ Error durante la importación:', error);
  process.exit(1);
});
