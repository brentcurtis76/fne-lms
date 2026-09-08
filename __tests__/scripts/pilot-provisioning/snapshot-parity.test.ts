// @vitest-environment node
/**
 * R8 — the pilot provisioner attests snapshot CONTENT by reproducing the
 * publish service's payload (scripts/pilot-provisioning/snapshot.mjs). This
 * test runs the REAL TypeScript service (publishTemplate) over the synthetic
 * manifest's desired rows through a minimal in-memory Supabase client and
 * asserts that what it inserts into assessment_template_snapshots equals
 * buildSnapshotFromRows / buildExpectedSnapshot once the documented volatile
 * fields are removed. If the service changes its payload, this fails.
 */
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { publishTemplate } from '../../../lib/services/assessment-builder/publishTemplate';
import { buildDesiredState, loadManifest } from '../../../scripts/pilot-provisioning/manifest.mjs';
import {
  VOLATILE_SNAPSHOT_FIELDS,
  attestSnapshotContent,
  buildExpectedSnapshot,
  buildSnapshotFromRows,
  canonicalizeObservedSnapshot,
  snapshotDifferences,
} from '../../../scripts/pilot-provisioning/snapshot.mjs';
import { DEFAULT_GRADES } from './fake-store';

const SYNTHETIC = resolve(__dirname, '../../../config/pilot-manifests/pc-pilot-synthetic-v1.json');
const manifest = loadManifest(SYNTHETIC);
const gradeIdByKey = new Map(manifest.grades.map((g: any) => [g.key, DEFAULT_GRADES.find((r) => r.sort_order === g.sortOrder)!.id]));
const state = buildDesiredState(manifest, gradeIdByKey);
const ACTOR = '00000000-0000-0000-0000-000000000000';

type Row = Record<string, any>;

/**
 * Minimal supabase-js query builder over Maps: select/eq/in/order/single,
 * insert().select().single(), update().eq().select().single(), delete().eq().
 * Embeds `grade:ab_grades(...)` on assessment_templates like PostgREST does.
 */
function fakeClient(tables: Record<string, Row[]>) {
  let serial = 0;
  const from = (table: string) => {
    const state = { filters: [] as Array<(r: Row) => boolean>, op: 'select' as 'select' | 'insert' | 'update' | 'delete', payload: null as any, single: false, order: null as null | { column: string; ascending: boolean } };
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: unknown) => { state.filters.push((r) => r[col] === val); return chain; },
      in: (col: string, vals: unknown[]) => { state.filters.push((r) => vals.includes(r[col])); return chain; },
      order: (column: string, opts?: { ascending?: boolean }) => { state.order = { column, ascending: opts?.ascending ?? true }; return chain; },
      single: () => { state.single = true; return chain; },
      insert: (payload: Row | Row[]) => { state.op = 'insert'; state.payload = payload; return chain; },
      update: (payload: Row) => { state.op = 'update'; state.payload = payload; return chain; },
      delete: () => { state.op = 'delete'; return chain; },
      then: (resolve: (v: unknown) => void) => {
        const rows = tables[table] ?? (tables[table] = []);
        const matches = () => rows.filter((r) => state.filters.every((f) => f(r)));
        let result: Row[] = [];
        if (state.op === 'insert') {
          const list = Array.isArray(state.payload) ? state.payload : [state.payload];
          for (const row of list) {
            const inserted = { id: row.id ?? `gen-${(serial += 1)}`, created_at: `2026-09-07T12:00:0${serial}.000Z`, ...row };
            rows.push(inserted);
            result.push(inserted);
          }
        } else if (state.op === 'update') {
          for (const row of matches()) Object.assign(row, state.payload);
          result = matches();
        } else if (state.op === 'delete') {
          const victims = matches();
          for (const v of victims) rows.splice(rows.indexOf(v), 1);
          result = victims;
        } else {
          result = matches();
          if (state.order) {
            const { column, ascending } = state.order;
            result = [...result].sort((a, b) => (a[column] > b[column] ? 1 : a[column] < b[column] ? -1 : 0) * (ascending ? 1 : -1));
          }
          if (table === 'assessment_templates') {
            result = result.map((t) => ({ ...t, grade: (tables.ab_grades ?? []).find((g) => g.id === t.grade_id) ?? null }));
          }
        }
        if (state.single) {
          if (result.length !== 1) return resolve({ data: null, error: { code: 'PGRST116', message: `${result.length} rows` } });
          return resolve({ data: result[0], error: null });
        }
        return resolve({ data: result, error: null });
      },
    };
    return chain;
  };
  return { from, tables };
}

function seedTables(templateKey: string) {
  const template = state.templates.find((t: any) => t.key === templateKey)!;
  const moduleIds = new Set(state.modules.filter((m: any) => m.template_id === template.id).map((m: any) => m.id));
  return {
    ab_grades: DEFAULT_GRADES.map((g) => ({ ...g })),
    assessment_templates: [{
      id: template.id, area: template.area, grade_id: template.grade_id, version: template.draft_version, name: template.name,
      description: template.description, status: 'draft', is_archived: false, scoring_config: template.scoring_config,
      created_at: '2026-09-07T11:00:00.000Z',
    }],
    assessment_objectives: state.objectives.filter((o: any) => o.template_id === template.id).map((o: any) => ({ ...o })),
    // Reverse the stored order on purpose: the service orders by display_order.
    assessment_modules: state.modules.filter((m: any) => m.template_id === template.id).map((m: any) => ({ ...m })).reverse(),
    assessment_indicators: state.indicators.filter((i: any) => moduleIds.has(i.module_id)).map((i: any) => ({ ...i })).reverse(),
    assessment_year_expectations: state.expectations.filter((e: any) => e.template_id === template.id).map((e: any) => ({ ...e })),
    // Shuffle year weights: the service groups them from an unordered read.
    assessment_entity_year_weights: state.yearWeights.filter((w: any) => w.template_id === template.id).map((w: any) => ({ ...w })).reverse(),
    assessment_template_snapshots: [] as Row[],
  };
}

describe('snapshot content parity with the real publish service (R8)', () => {
  it.each(manifest.templates.map((t: any) => [t.key, t.gradeKey]))(
    'template %s: the service payload equals buildSnapshotFromRows and buildExpectedSnapshot once volatile fields are removed',
    async (templateKey, gradeKey) => {
      const tables = seedTables(templateKey);
      const client = fakeClient(tables);
      const template = state.templates.find((t: any) => t.key === templateKey)!;

      const result = await publishTemplate(client as any, template.id, { id: ACTOR });
      expect(result.ok).toBe(true);
      const stored = tables.assessment_template_snapshots[0].snapshot_data;

      // Volatile fields are present in what the service writes …
      expect(stored.published_by).toBe(ACTOR);
      expect(typeof stored.published_at).toBe('string');
      expect(stored.template.created_at).toBe('2026-09-07T11:00:00.000Z');
      expect(VOLATILE_SNAPSHOT_FIELDS).toEqual(['published_at', 'published_by', 'template.created_at']);

      // … and are the ONLY difference from the reproduction.
      const gradeRow = DEFAULT_GRADES.find((g) => g.id === gradeIdByKey.get(gradeKey))!;
      const expected = buildExpectedSnapshot(state, templateKey, gradeRow);
      const canonical = canonicalizeObservedSnapshot(stored, expected);
      expect(snapshotDifferences(canonical, expected)).toEqual([]);
      expect(canonical).toEqual(expected);

      // The full attestation accepts the real payload …
      expect(attestSnapshotContent({ row: { snapshot_data: stored }, expected, templateId: template.id })).toMatchObject({ ok: true, failures: [] });

      // … and buildSnapshotFromRows with the volatile inputs reproduces it byte for byte.
      const moduleIds = new Set(tables.assessment_modules.map((m) => m.id));
      const reproduced = buildSnapshotFromRows({
        template: { ...tables.assessment_templates[0] },
        grade: gradeRow,
        objectives: tables.assessment_objectives,
        modules: tables.assessment_modules,
        indicators: tables.assessment_indicators.filter((i) => moduleIds.has(i.module_id)),
        expectations: tables.assessment_year_expectations,
        yearWeights: tables.assessment_entity_year_weights,
        actorId: ACTOR,
        publishedAt: stored.published_at,
      });
      expect(canonicalizeObservedSnapshot(reproduced, expected)).toEqual(canonical);
      // Byte-for-byte with the volatile fields included, modulo the documented yearWeights ordering.
      const storedJson = JSON.parse(JSON.stringify(stored));
      const reproducedJson = JSON.parse(JSON.stringify(reproduced));
      expect({ ...reproducedJson, yearWeights: undefined }).toEqual({ ...storedJson, yearWeights: undefined });
      expect(canonicalizeObservedSnapshot(storedJson, expected).yearWeights).toEqual(reproducedJson.yearWeights);
    },
  );

  it('a tampered, stale or foreign payload is rejected with the differing paths named', () => {
    const templateKey = manifest.templates[0].key;
    const gradeRow = DEFAULT_GRADES.find((g) => g.id === gradeIdByKey.get(manifest.templates[0].gradeKey))!;
    const template = state.templates.find((t: any) => t.key === templateKey)!;
    const expected = buildExpectedSnapshot(state, templateKey, gradeRow);

    const tampered = structuredClone(expected) as any;
    tampered.objectives[0].modules[0].indicators[0].weight = 9;
    tampered.published_at = '2026-01-01T00:00:00.000Z';
    const verdict = attestSnapshotContent({ row: { snapshot_data: tampered }, expected, templateId: template.id });
    expect(verdict.ok).toBe(false);
    expect(verdict.failures[0]).toContain('objectives[0].modules[0].indicators[0].weight');

    const stale = structuredClone(expected) as any;
    delete stale.objectives[0].modules[0].indicators[0].expectations_gt;
    expect(attestSnapshotContent({ row: { snapshot_data: stale }, expected, templateId: template.id }).ok).toBe(false);

    const foreign = structuredClone(expected) as any;
    foreign.template.id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const foreignVerdict = attestSnapshotContent({ row: { snapshot_data: foreign }, expected, templateId: template.id });
    expect(foreignVerdict.failures[0]).toContain('foreign or stale');

    expect(attestSnapshotContent({ row: { snapshot_data: null }, expected, templateId: template.id }).ok).toBe(false);
    expect(attestSnapshotContent({ row: {}, expected, templateId: template.id }).ok).toBe(false);
  });

  it('the digest is stable across reruns and across the volatile fields', () => {
    const templateKey = manifest.templates[0].key;
    const gradeRow = DEFAULT_GRADES.find((g) => g.id === gradeIdByKey.get(manifest.templates[0].gradeKey))!;
    const template = state.templates.find((t: any) => t.key === templateKey)!;
    const expected = buildExpectedSnapshot(state, templateKey, gradeRow);
    const a = attestSnapshotContent({ row: { snapshot_data: { ...expected, published_at: 'x', published_by: 'a' } }, expected, templateId: template.id });
    const b = attestSnapshotContent({ row: { snapshot_data: { ...expected, published_at: 'y', published_by: 'b' } }, expected, templateId: template.id });
    expect(a.ok && b.ok).toBe(true);
    expect(a.digest).toBe(b.digest);
    expect(a.digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
