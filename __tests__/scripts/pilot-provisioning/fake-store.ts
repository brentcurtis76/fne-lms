/**
 * In-memory store implementing the pilot-provisioning store interface
 * (scripts/pilot-provisioning/store.mjs). Every table is a Map by id; the
 * publish path mirrors the shared service's observable effects (draft check,
 * frequency gate, snapshot insert, status flip to minor+1) and records each
 * call so tests can prove publication went through the store's service hook
 * and never through a direct write.
 */
import { validateFrequencyConfigShape, publishedVersionFor } from '../../../scripts/pilot-provisioning/manifest.mjs';
import { buildSnapshotFromRows } from '../../../scripts/pilot-provisioning/snapshot.mjs';
import { CASCADE_EDGES } from '../../../scripts/pilot-provisioning/reset.mjs';
import { computeSchemaDigest, sectionDigests } from '../../../scripts/pilot-provisioning/schema-attestation.mjs';

export type Row = Record<string, any>;

export interface FakeStoreOptions {
  grades?: Row[];
  missingColumns?: Record<string, string[]>;
  seed?: Record<string, Row[]>;
  actorId?: string;
  /** Overrides the attestation payload the fake database returns (R10 drift tests). */
  schemaAttestation?: Row | (() => Row);
  /** When set, readSchemaAttestation throws (function missing / privilege missing). */
  schemaAttestationError?: string;
}

const REQUIRED_TABLES = [
  'schools', 'ab_grades', 'ab_migration_plan', 'assessment_templates', 'assessment_template_snapshots',
  'assessment_objectives', 'assessment_modules', 'assessment_indicators', 'assessment_sub_questions',
  'assessment_year_expectations', 'assessment_entity_year_weights', 'assessment_context_questions',
  'assessment_demo_access', 'assessment_instances', 'assessment_instance_assignees', 'assessment_responses',
  'school_course_structure', 'school_course_docente_assignments', 'school_transversal_context', 'profiles', 'user_roles',
];

/**
 * A deterministic attestation payload shaped like pilot_schema_attestation():
 * the required tables (with RLS on and one representative policy), the
 * referencing foreign-key graph derived from CASCADE_EDGES, and the required
 * functions. Tests derive the expectation from it and mutate copies to
 * simulate drift.
 */
export function fakeSchemaAttestation(): Row {
  return {
    attestation_version: 1,
    missing_tables: [],
    missing_functions: [],
    tables: REQUIRED_TABLES.map((name) => ({
      name,
      rls_enabled: true,
      rls_forced: false,
      columns: [{ name: 'id', type: 'uuid', not_null: true, default: null }],
      policies: [{ name: `${name}_select`, command: 'r', permissive: true, roles: ['public'], using: 'true', with_check: null }],
      privileges: [{ grantee: 'service_role', privilege: 'SELECT' }],
      foreign_keys: [],
      unique_indexes: [],
      triggers: [],
    })),
    referencing_foreign_keys: (CASCADE_EDGES as readonly (readonly string[])[]).map(([child, column, parent, onDelete]) => ({
      name: `${child}_${column}_fkey`,
      child,
      columns: [column],
      parent,
      ref_columns: ['id'],
      on_delete: onDelete,
      on_update: 'NO ACTION',
    })),
    functions: ['auth_is_assessment_admin', 'auth_is_school_directivo', 'assessment_instance_progress_flags', 'replace_course_docente',
      'save_transversal_context', 'transversal_grade_sort_order', 'pilot_schema_attestation'].map((name) => ({
      name, arguments: '', returns: 'jsonb', language: 'sql', security_definer: false, volatility: 's', config: null,
      body_md5: `md5-${name}`, privileges: [{ grantee: 'service_role', privilege: 'EXECUTE' }],
    })),
  };
}

/** The expectation config that matches fakeSchemaAttestation(). */
export function fakeSchemaExpectation(payload: Row = fakeSchemaAttestation()) {
  return Object.freeze({
    schemaVersion: 1,
    attestationVersion: 1,
    expectedDigest: computeSchemaDigest(payload),
    sections: sectionDigests(payload),
  });
}

export const DEFAULT_GRADES: Row[] = [
  { id: 1, name: 'Pre-Kinder', sort_order: 3, is_always_gt: true },
  { id: 2, name: 'Kinder', sort_order: 4, is_always_gt: true },
  { id: 5, name: '1° Básico', sort_order: 5, is_always_gt: true },
  { id: 6, name: '2° Básico', sort_order: 6, is_always_gt: true },
  { id: 9, name: '5° Básico', sort_order: 9, is_always_gt: false },
];

const TABLES = [
  'schools',
  'ab_grades',
  'ab_migration_plan',
  'assessment_templates',
  'assessment_template_snapshots',
  'assessment_objectives',
  'assessment_modules',
  'assessment_indicators',
  'assessment_year_expectations',
  'assessment_entity_year_weights',
  'assessment_instances',
  'assessment_instance_assignees',
  'assessment_responses',
  'school_course_structure',
  'school_course_docente_assignments',
  'school_transversal_context',
  'profiles',
  'user_roles',
];

let serial = 1000;

export function createFakeStore(options: FakeStoreOptions = {}) {
  const tables = new Map<string, Map<string | number, Row>>(TABLES.map((t) => [t, new Map()]));
  const writes: Array<{ op: string; table: string; rows: Row[] }> = [];
  const publishCalls: string[] = [];
  const lockEvents: string[] = [];

  // Tables are created lazily: the cascade graph reaches many tables the
  // provisioner never writes (R9), and a count on an empty one is 0.
  const table = (name: string) => {
    let t = tables.get(name);
    if (!t) {
      t = new Map();
      tables.set(name, t);
    }
    return t;
  };
  const put = (name: string, row: Row) => {
    const id = row.id ?? (serial += 1);
    table(name).set(id, { ...row, id });
    return id;
  };
  for (const grade of options.grades ?? DEFAULT_GRADES) put('ab_grades', grade);
  for (const [name, rows] of Object.entries(options.seed ?? {})) rows.forEach((r) => put(name, r));

  const store = {
    kind: 'fake',
    tables,
    writes,
    publishCalls,
    lockEvents,
    put,
    rows(name: string) {
      return [...table(name).values()];
    },

    async probeColumns(name: string, columns: string[]) {
      const missing = options.missingColumns?.[name] ?? [];
      const hit = columns.find((c) => missing.includes(c));
      return hit ? { ok: false, error: `column ${name}.${hit} does not exist` } : { ok: true };
    },
    async readSchool(id: number) {
      return table('schools').get(id) ?? null;
    },
    async readGrades() {
      return store.rows('ab_grades').sort((a, b) => a.sort_order - b.sort_order);
    },
    async readTemplatesByGrades(gradeIds: number[]) {
      return store.rows('assessment_templates').filter((t) => gradeIds.includes(t.grade_id));
    },
    async readRows(name: string, column: string, values: unknown[], columns: string[]) {
      return store
        .rows(name)
        .filter((r) => values.includes(r[column]))
        .map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null])));
    },
    async readMigrationPlan(schoolId: number) {
      return store.rows('ab_migration_plan').filter((r) => r.school_id === schoolId);
    },
    async countRows(name: string, column: string, values: unknown[]) {
      return store.rows(name).filter((r) => values.includes(r[column])).length;
    },
    async countReferencing(name: string, column: string, values: unknown[]) {
      return store.rows(name).filter((r) => values.includes(r[column])).length;
    },
    async readSchemaAttestation() {
      if (options.schemaAttestationError) throw new Error(options.schemaAttestationError);
      const source = options.schemaAttestation;
      return structuredClone(typeof source === 'function' ? source() : source ?? fakeSchemaAttestation());
    },
    async insertRows(name: string, rows: Row[]) {
      writes.push({ op: 'insert', table: name, rows: structuredClone(rows) });
      for (const row of rows) {
        if (row.id !== undefined && table(name).has(row.id)) throw new Error(`duplicate id in ${name}`);
        put(name, structuredClone(row));
      }
      return rows.length;
    },
    async publishTemplate(templateId: string) {
      publishCalls.push(templateId);
      const template = table('assessment_templates').get(templateId);
      if (!template) return { ok: false, status: 404, error: 'Template no encontrado' };
      if (template.status !== 'draft') return { ok: false, status: 400, error: 'Solo los templates en estado borrador pueden ser publicados.' };
      const modules = store.rows('assessment_modules').filter((m) => m.template_id === templateId);
      if (modules.length === 0) return { ok: false, status: 400, error: 'El template debe tener al menos un módulo' };
      const indicators = store.rows('assessment_indicators').filter((i) => modules.some((m) => m.id === i.module_id));
      if (indicators.length === 0) return { ok: false, status: 400, error: 'El template debe tener al menos un indicador' };
      const badFrequency = indicators.filter((i) => i.category === 'frecuencia' && validateFrequencyConfigShape(i.frequency_config).length > 0);
      if (badFrequency.length > 0) return { ok: false, status: 400, error: 'No se puede publicar', code: 'invalid_frequency_config' };
      const newVersion = publishedVersionFor(template.version);
      const snapshotId = `snap-${templateId}-${newVersion}`;
      // The REAL payload shape (snapshot.mjs is proven equal to the service by
      // snapshot-parity.test.ts), including the volatile fields.
      const grade = table('ab_grades').get(template.grade_id) ?? null;
      const snapshotData = buildSnapshotFromRows({
        template: { ...template, created_at: template.created_at ?? '2026-09-07T11:00:00.000Z' },
        grade,
        objectives: store.rows('assessment_objectives').filter((o) => o.template_id === templateId),
        modules,
        indicators,
        expectations: store.rows('assessment_year_expectations').filter((e) => e.template_id === templateId),
        yearWeights: store.rows('assessment_entity_year_weights').filter((w) => w.template_id === templateId),
        actorId: options.actorId ?? '00000000-0000-0000-0000-000000000000',
        publishedAt: `2026-09-07T12:00:00.${String(publishCalls.length).padStart(3, '0')}Z`,
      });
      put('assessment_template_snapshots', {
        id: snapshotId,
        template_id: templateId,
        version: newVersion,
        snapshot_data: JSON.parse(JSON.stringify(snapshotData)),
        created_at: '2026-09-07T12:00:00.000Z',
      });
      table('assessment_templates').set(templateId, { ...template, status: 'published', version: newVersion });
      return {
        ok: true,
        newVersion,
        isAlwaysGT: true,
        requiresDualExpectations: false,
        template: { id: templateId, name: template.name, area: template.area, status: 'published', version: newVersion },
        snapshot: { id: snapshotId, version: newVersion, createdAt: '2026-09-07T12:00:00.000Z' },
        warnings: [],
      };
    },
    /**
     * Models the real foreign keys (CASCADE_EDGES): CASCADE deletes the
     * children recursively, SET NULL nulls the referencing column, RESTRICT /
     * NO ACTION throws like Postgres would. Every cascaded deletion is
     * recorded as a write so a test can prove what a reset would have
     * destroyed.
     */
    async deleteRows(name: string, column: string, values: unknown[]) {
      const victims = store.rows(name).filter((r) => values.includes(r[column]));
      writes.push({ op: 'delete', table: name, rows: structuredClone(victims) });
      const cascade = (parentTable: string, parentIds: unknown[]) => {
        for (const [child, fkColumn, parent, onDelete] of CASCADE_EDGES as readonly (readonly string[])[]) {
          if (parent !== parentTable) continue;
          const referencing = store.rows(child).filter((r) => parentIds.includes(r[fkColumn]));
          if (referencing.length === 0) continue;
          if (onDelete === 'CASCADE') {
            writes.push({ op: 'delete', table: child, rows: structuredClone(referencing), cascadedFrom: parentTable } as any);
            for (const r of referencing) table(child).delete(r.id);
            cascade(child, referencing.map((r) => r.id));
          } else if (onDelete === 'SET NULL') {
            writes.push({ op: 'set-null', table: child, rows: structuredClone(referencing), cascadedFrom: parentTable } as any);
            for (const r of referencing) table(child).set(r.id, { ...r, [fkColumn]: null });
          } else {
            throw new Error(`fake store: delete on ${parentTable} violates foreign key ${child}.${fkColumn} (${onDelete})`);
          }
        }
      };
      for (const v of victims) table(name).delete(v.id);
      cascade(name, victims.map((v) => v.id));
      return victims.length;
    },
    async acquireLock(name: string) {
      lockEvents.push(`acquire:${name}`);
    },
    async releaseLock(name: string) {
      lockEvents.push(`release:${name}`);
    },
  };
  return store;
}

export type FakeStore = ReturnType<typeof createFakeStore>;
