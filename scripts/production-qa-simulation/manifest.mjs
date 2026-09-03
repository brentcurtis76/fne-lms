import { createHash } from 'node:crypto';
import { v5 as uuidv5, validate as validateUuid } from 'uuid';

import { loadSimulationTargetConfig } from './target-guard.mjs';

export const SIMULATION_NAMESPACE = '5d88253c-784b-5e0b-8752-c37e8a65e634';
export const SCENARIO_EPOCH = '2026-09-03T12:00:00.000Z';

const idFor = (key) => uuidv5(`sm-sim-v1:${key}`, SIMULATION_NAMESPACE);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function digestManifest(manifest) {
  const digestable = {
    version: manifest.version,
    scenarioEpoch: manifest.scenarioEpoch,
    targetSchoolIds: manifest.targetSchoolIds,
    tables: manifest.tables,
    documentedSideEffects: manifest.documentedSideEffects,
    deferredGaps: manifest.deferredGaps,
  };
  return createHash('sha256').update(canonicalJson(digestable)).digest('hex');
}

export function buildSimulationManifest() {
  const config = loadSimulationTargetConfig();
  const [primarySchoolId, controlSchoolId] = config.qaSchoolIds;

  const tables = [
    {
      name: 'generations',
      naturalKey: [],
      rows: [
        {
          id: idFor('generation:primary'),
          school_id: primarySchoolId,
          name: 'Generación sintética QA 01',
          grade_range: 'Personas adultas',
          description: `${config.label} · ${config.manifestVersion}`,
          created_at: SCENARIO_EPOCH,
          updated_at: SCENARIO_EPOCH,
        },
        {
          id: idFor('generation:control'),
          school_id: controlSchoolId,
          name: 'Generación sintética QA control',
          grade_range: 'Personas adultas',
          description: `${config.label} · ${config.manifestVersion}`,
          created_at: SCENARIO_EPOCH,
          updated_at: SCENARIO_EPOCH,
        },
      ],
    },
    {
      name: 'program_enrollments',
      naturalKey: ['school_id', 'program_type', 'academic_year'],
      rows: [
        {
          id: idFor('program-enrollment:primary'),
          school_id: primarySchoolId,
          program_type: 'sm-sim-v1-primary',
          program_year: 1,
          academic_year: '2026-SM-SIM-V1',
          start_date: '2026-03-01',
          end_date: '2026-12-15',
          contracted_hours: 24,
          status: 'active',
          notes: `${config.label} · manifest-owned`,
          created_at: SCENARIO_EPOCH,
          updated_at: SCENARIO_EPOCH,
        },
        {
          id: idFor('program-enrollment:control'),
          school_id: controlSchoolId,
          program_type: 'sm-sim-v1-control',
          program_year: 1,
          academic_year: '2026-SM-SIM-V1',
          start_date: '2026-03-01',
          end_date: '2026-12-15',
          contracted_hours: 8,
          status: 'active',
          notes: `${config.label} · manifest-owned`,
          created_at: SCENARIO_EPOCH,
          updated_at: SCENARIO_EPOCH,
        },
      ],
    },
    {
      name: 'licitaciones',
      naturalKey: ['numero_licitacion'],
      rows: [
        {
          id: idFor('licitacion:primary'),
          numero_licitacion: 'SM-SIM-V1-QA-001',
          school_id: primarySchoolId,
          cliente_id: null,
          programa_id: 'sm-sim-v1-primary',
          nombre_licitacion: 'Proceso sintético QA sin validez',
          year: 2026,
          estado: 'borrador',
          email_licitacion: `licitacion.${config.manifestVersion}@${config.reservedEmailDomain}`,
          monto_minimo: 0,
          monto_maximo: 0,
          duracion_minima: '0 meses — solo QA sintético',
          duracion_maxima: '0 meses — solo QA sintético',
          peso_evaluacion_tecnica: 50,
          peso_evaluacion_economica: 50,
          notas: `${config.label} · SIN VALIDEZ`,
          created_by: null,
          created_at: SCENARIO_EPOCH,
          updated_at: SCENARIO_EPOCH,
        },
      ],
    },
    {
      name: 'transformation_assessments',
      naturalKey: [],
      jsonColumns: ['conversation_history', 'context_metadata', 'grades'],
      rows: [
        {
          id: idFor('transformation-assessment:primary'),
          growth_community_id: null,
          area: 'aprendizaje',
          status: 'in_progress',
          conversation_history: [],
          context_metadata: {
            manifestVersion: config.manifestVersion,
            evidenceClass: 'NO CERRANTE',
            syntheticAdultsOnly: true,
          },
          started_at: SCENARIO_EPOCH,
          completed_at: null,
          created_by: null,
          updated_at: SCENARIO_EPOCH,
          school_id: primarySchoolId,
          grades: [],
        },
        {
          id: idFor('transformation-assessment:control'),
          growth_community_id: null,
          area: 'evaluacion',
          status: 'in_progress',
          conversation_history: [],
          context_metadata: {
            manifestVersion: config.manifestVersion,
            evidenceClass: 'NO CERRANTE',
            syntheticAdultsOnly: true,
          },
          started_at: SCENARIO_EPOCH,
          completed_at: null,
          created_by: null,
          updated_at: SCENARIO_EPOCH,
          school_id: controlSchoolId,
          grades: [],
        },
      ],
    },
  ];

  const manifest = {
    schemaVersion: 1,
    version: config.manifestVersion,
    scenarioEpoch: SCENARIO_EPOCH,
    namespace: SIMULATION_NAMESPACE,
    label: config.label,
    reservedEmailDomain: config.reservedEmailDomain,
    targetSchoolIds: [...config.qaSchoolIds],
    tables,
    documentedSideEffects: [
      {
        sourceTable: 'generations',
        trigger: 'update_school_generations_on_insert/delete',
        targetTable: 'schools',
        targetSchoolIds: [...config.qaSchoolIds],
        columns: ['has_generations'],
        behavior: 'Recomputes has_generations after manifest generation inserts and deletes; tenant controls are untouched.',
      },
    ],
    deferredGaps: [
      {
        lane: 'network_membership',
        reason: 'Requires a separately authorized existing adult admin actor binding.',
      },
      {
        lane: 'learning_path_assignment_progress',
        reason: 'Deferred while W-B2c remains open; no global learning path is created.',
      },
      {
        lane: 'assessment_submissions',
        reason: 'Requires separately authorized existing adult user and template bindings.',
      },
      {
        lane: 'zoom_attendance',
        reason: 'Provider-owned attendance write paths are not bypassed by this seeder.',
      },
    ],
  };

  assertManifestSafety(manifest);
  return deepFreeze({ ...manifest, digest: digestManifest(manifest) });
}

export function expectedCounts(manifest = buildSimulationManifest()) {
  const byTable = Object.fromEntries(manifest.tables.map((table) => [table.name, table.rows.length]));
  return Object.freeze({ byTable: Object.freeze(byTable), total: Object.values(byTable).reduce((a, b) => a + b, 0) });
}

export function manifestOwnedIds(manifest = buildSimulationManifest()) {
  return new Map(manifest.tables.map((table) => [table.name, new Set(table.rows.map((row) => row.id))]));
}

export function assertManifestSafety(manifest) {
  const config = loadSimulationTargetConfig();
  if (manifest.version !== config.manifestVersion) throw new Error('manifest version drift');
  if (canonicalJson(manifest.targetSchoolIds) !== canonicalJson(config.qaSchoolIds)) {
    throw new Error('manifest school allowlist drift');
  }
  if (!validateUuid(manifest.namespace) || uuidv5('probe', manifest.namespace) === manifest.namespace) {
    throw new Error('manifest UUID namespace is invalid');
  }

  const seenIds = new Set();
  const serialized = canonicalJson(manifest.tables).toLowerCase();
  const prohibited = [
    'santa marta',
    '@gmail.',
    '@hotmail.',
    '@outlook.',
    '@fne.cl',
    'estudiante',
    'alumno',
    'apoderado',
    'rut',
    'teléfono',
    'telefono',
  ];
  for (const term of prohibited) {
    if (serialized.includes(term)) throw new Error(`manifest contains prohibited fixture term: ${term}`);
  }

  for (const table of manifest.tables) {
    if (!/^[a-z][a-z0-9_]*$/.test(table.name)) throw new Error('manifest table name is invalid');
    const rowColumns = new Set(table.rows.flatMap((row) => Object.keys(row)));
    for (const column of table.jsonColumns ?? []) {
      if (!/^[a-z][a-z0-9_]*$/.test(column) || !rowColumns.has(column)) {
        throw new Error(`manifest JSON column is invalid in ${table.name}`);
      }
    }
    for (const row of table.rows) {
      if (!validateUuid(row.id)) throw new Error(`manifest row id is invalid in ${table.name}`);
      if (seenIds.has(row.id)) throw new Error('manifest row ids must be globally unique');
      seenIds.add(row.id);
      if ('school_id' in row && !config.qaSchoolIds.includes(row.school_id)) {
        throw new Error(`manifest row targets a non-allowlisted school in ${table.name}`);
      }
      for (const [key, value] of Object.entries(row)) {
        if (key.includes('email') && value !== null) {
          if (typeof value !== 'string' || !value.toLowerCase().endsWith(`@${config.reservedEmailDomain}`)) {
            throw new Error(`manifest email is not on the reserved domain in ${table.name}`);
          }
        }
      }
    }
  }
  return true;
}
