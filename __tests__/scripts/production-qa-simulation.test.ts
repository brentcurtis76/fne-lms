import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { assertLegacySeederIsNotProduction } from '../../lib/simulation/legacy-seeder-guard';

import {
  buildSimulationManifest,
  digestManifest,
  expectedCounts,
} from '../../scripts/production-qa-simulation/manifest.mjs';
import {
  resetManifest,
  seedManifest,
  verifyManifest,
} from '../../scripts/production-qa-simulation/engine.mjs';
import {
  dryRunSummary,
  parseArguments,
  run,
} from '../../scripts/production-qa-simulation/cli.mjs';
import {
  assertProductionQaDatabaseTarget,
  assertProductionQaTarget,
  projectRefFromDatabaseUrl,
} from '../../scripts/production-qa-simulation/target-guard.mjs';

const clone = <T>(value: T): T => structuredClone(value);

function buildFakeStore(options: { foreignReferences?: unknown[] } = {}) {
  const manifest = buildSimulationManifest();
  const data = new Map(manifest.tables.map((table) => [table.name, new Map<string, any>()]));
  const calls: string[] = [];
  const qaRows = manifest.targetSchoolIds.map((id) => ({ id, tenant_kind: 'qa' }));

  const store = {
    data,
    calls,
    async transaction<T>(callback: () => Promise<T>) {
      calls.push('transaction');
      const before = clone([...data].map(([table, rows]) => [table, [...rows]]));
      try {
        return await callback();
      } catch (error) {
        data.clear();
        for (const [table, rows] of before as Array<[string, Array<[string, any]>]>) {
          data.set(table, new Map(rows));
        }
        throw error;
      }
    },
    async acquireManifestLock() {
      calls.push('lock');
    },
    async readQaTenants() {
      calls.push('preflight');
      return qaRows;
    },
    async readByIds(table: string, ids: string[]) {
      return ids.flatMap((id) => {
        const row = data.get(table)?.get(id);
        return row ? [clone(row)] : [];
      });
    },
    async findNaturalKeyCollisions(table: string, keys: string[], rows: any[]) {
      if (keys.length === 0) return [];
      return [...(data.get(table)?.values() ?? [])].filter((existing) =>
        rows.some((row) => keys.every((key) => existing[key] === row[key])),
      );
    },
    async insertMissing(table: string, rows: any[]) {
      calls.push(`insert:${table}:${rows.length}`);
      for (const row of rows) {
        if (!data.get(table)?.has(row.id)) data.get(table)?.set(row.id, clone(row));
      }
    },
    async findForeignReferences() {
      calls.push('foreign-references');
      return options.foreignReferences ?? [];
    },
    async deleteByIds(table: string, ids: string[]) {
      let deleted = 0;
      for (const id of ids) {
        if (data.get(table)?.delete(id)) deleted += 1;
      }
      calls.push(`delete:${table}:${deleted}`);
      return deleted;
    },
  };
  return store;
}

function guardedTarget() {
  return assertProductionQaTarget({
    supabaseUrl: 'https://sxlogxqzmarhqsblxmtj.supabase.co',
    schoolIds: [257, 259],
  });
}

describe('production QA simulation manifest', () => {
  it('is deterministic, versioned, gap-only, and has fixed counts', () => {
    const first = buildSimulationManifest();
    const second = buildSimulationManifest();

    expect(first).toEqual(second);
    expect(first.version).toBe('sm-sim-v1');
    expect(first.scenarioEpoch).toBe('2026-09-03T12:00:00.000Z');
    expect(first.targetSchoolIds).toEqual([257, 259]);
    expect(expectedCounts(first)).toEqual({
      byTable: {
        generations: 2,
        program_enrollments: 2,
        licitaciones: 1,
        transformation_assessments: 2,
      },
      total: 7,
    });
    expect(first.digest).toBe(digestManifest(first));
    expect(first.deferredGaps.map((gap) => gap.lane)).toEqual([
      'network_membership',
      'learning_path_assignment_progress',
      'assessment_submissions',
      'zoom_attendance',
    ]);
  });

  it('contains only allowlisted school rows, reserved e-mail addresses, and synthetic-adult labels', () => {
    const manifest = buildSimulationManifest();
    const serialized = JSON.stringify(manifest).toLowerCase();
    const schoolIds = manifest.tables.flatMap((table) => table.rows.flatMap((row) => 'school_id' in row ? [row.school_id] : []));
    const emails = manifest.tables.flatMap((table) => table.rows.flatMap((row) =>
      Object.entries(row).filter(([key]) => key.includes('email')).map(([, value]) => value),
    ));

    expect(new Set(schoolIds)).toEqual(new Set([257, 259]));
    expect(emails).toEqual(['licitacion.sm-sim-v1@example.test']);
    expect(serialized).not.toContain('santa marta');
    expect(serialized).not.toContain('estudiante');
    expect(serialized).not.toContain('@fne.cl');
  });
});

describe('production QA simulation engine', () => {
  it('seeds idempotently and verifies the exact manifest digest', async () => {
    const manifest = buildSimulationManifest();
    const store = buildFakeStore();

    const first = await seedManifest({ store, manifest, guardedTarget: guardedTarget() });
    const second = await seedManifest({ store, manifest, guardedTarget: guardedTarget() });
    const verified = await verifyManifest({ store, manifest, guardedTarget: guardedTarget() });

    expect(Object.values(first.inserted).reduce((total, count) => total + count, 0)).toBe(7);
    expect(Object.values(second.inserted).reduce((total, count) => total + count, 0)).toBe(0);
    expect(verified).toEqual({ counts: expectedCounts(manifest), digest: manifest.digest });
  });

  it('refuses seed when a deterministic id is occupied by a drifted row', async () => {
    const manifest = buildSimulationManifest();
    const store = buildFakeStore();
    const expected = manifest.tables[0].rows[0];
    store.data.get(manifest.tables[0].name)?.set(expected.id, { ...clone(expected), name: 'foreign drift' });

    await expect(seedManifest({ store, manifest, guardedTarget: guardedTarget() }))
      .rejects.toThrow('manifest-owned row drift');
    expect(store.calls.some((call) => call.startsWith('insert:'))).toBe(false);
  });

  it('refuses reset on any foreign reference and rolls back without deleting', async () => {
    const manifest = buildSimulationManifest();
    const store = buildFakeStore({ foreignReferences: [{ table: 'foreign_table', count: 1 }] });
    await seedManifest({ store, manifest, guardedTarget: guardedTarget() });
    const before = clone([...store.data].map(([table, rows]) => [table, [...rows]]));

    await expect(resetManifest({ store, manifest, guardedTarget: guardedTarget() }))
      .rejects.toThrow('foreign or unowned rows');
    expect([...store.data].map(([table, rows]) => [table, [...rows]])).toEqual(before);
    expect(store.calls.some((call) => call.startsWith('delete:'))).toBe(false);
  });

  it('deletes only exact manifest ids in reverse dependency order', async () => {
    const manifest = buildSimulationManifest();
    const store = buildFakeStore();
    await seedManifest({ store, manifest, guardedTarget: guardedTarget() });
    const foreignId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    store.data.get('generations')?.set(foreignId, { id: foreignId, school_id: 257, name: 'pre-existing QA row' });

    const result = await resetManifest({ store, manifest, guardedTarget: guardedTarget() });

    expect(Object.values(result.deleted).reduce((total, count) => total + count, 0)).toBe(7);
    expect(store.data.get('generations')?.get(foreignId)).toBeTruthy();
    expect(store.calls.filter((call) => call.startsWith('delete:')).map((call) => call.split(':')[1])).toEqual([
      'transformation_assessments',
      'licitaciones',
      'program_enrollments',
      'generations',
    ]);
  });

  it('fails closed before inserts when either target school is not classified qa', async () => {
    const manifest = buildSimulationManifest();
    const store = buildFakeStore();
    store.readQaTenants = vi.fn(async () => [
      { id: 257, tenant_kind: 'qa' },
      { id: 259, tenant_kind: 'client' },
    ]);

    await expect(seedManifest({ store, manifest, guardedTarget: guardedTarget() }))
      .rejects.toThrow('school 259 is not classified qa');
    expect(store.calls.some((call) => call.startsWith('insert:'))).toBe(false);
  });
});

describe('production QA simulation CLI and database guard', () => {
  const syntheticDatabaseUrl = (username: string, host: string, port: number) => {
    const url = new URL(`postgresql://${host}:${port}/postgres`);
    url.username = username;
    url.password = 'synthetic-fixture';
    return url.toString();
  };

  it('is offline dry-run by default for every requested mutation', async () => {
    const createStore = vi.fn();
    const result = await run(['seed'], {}, { createStore });

    expect(result).toMatchObject({ dryRun: true, requestedAction: 'seed', counts: { total: 7 } });
    expect(createStore).not.toHaveBeenCalled();
    expect(dryRunSummary('reset').dryRun).toBe(true);
  });

  it('has no force, wipe, unknown-target, or confirmation bypass', () => {
    expect(() => parseArguments(['reset', '--force'])).toThrow('unknown argument');
    expect(() => parseArguments(['reset', '--wipe'])).toThrow('unknown argument');
    expect(() => parseArguments(['seed', '--confirm=x'])).toThrow('--confirm is valid only with --execute');
    expect(() => parseArguments(['plan', '--execute'])).toThrow('plan never accepts --execute');
  });

  it('extracts the exact project ref from direct and pooler URLs only', () => {
    expect(projectRefFromDatabaseUrl(syntheticDatabaseUrl('postgres', 'db.sxlogxqzmarhqsblxmtj.supabase.co', 5432)))
      .toBe('sxlogxqzmarhqsblxmtj');
    expect(projectRefFromDatabaseUrl(syntheticDatabaseUrl('postgres.sxlogxqzmarhqsblxmtj', 'aws-0-us-east-1.pooler.supabase.com', 6543)))
      .toBe('sxlogxqzmarhqsblxmtj');
    expect(projectRefFromDatabaseUrl(syntheticDatabaseUrl('postgres', 'localhost', 5432))).toBeNull();
    expect(() => assertProductionQaDatabaseTarget(syntheticDatabaseUrl('postgres', 'db.other.supabase.co', 5432)))
      .toThrow('project ref is not allowlisted');
  });

  it('requires the exact confirmation before constructing a network store', async () => {
    const createStore = vi.fn();
    await expect(run(['seed', '--execute', '--confirm=wrong'], {
      SM_SIM_DATABASE_URL: syntheticDatabaseUrl('postgres', 'db.sxlogxqzmarhqsblxmtj.supabase.co', 5432),
    }, { createStore })).rejects.toThrow('exact execution confirmation');
    expect(createStore).not.toHaveBeenCalled();
  });
});

describe('legacy remote seeder Production prohibition', () => {
  it('refuses every URL form for the Production project and permits a non-Production target', () => {
    expect(() => assertLegacySeederIsNotProduction('https://sxlogxqzmarhqsblxmtj.supabase.co'))
      .toThrow('prohibited against Production');
    expect(() => assertLegacySeederIsNotProduction('https://sxlogxqzmarhqsblxmtj.supabase.co/'))
      .toThrow('prohibited against Production');
    expect(() => assertLegacySeederIsNotProduction('http://127.0.0.1:54321')).not.toThrow();
    expect(() => assertLegacySeederIsNotProduction('https://different.supabase.co')).not.toThrow();
  });

  it('guards every inventoried legacy script before its first client call', () => {
    const root = resolve(__dirname, '../..');
    const files = [
      'scripts/demo-data/seed-demo.ts',
      'scripts/demo-data/cleanup-demo.ts',
      'lib/propuestas/scripts/seed-db.ts',
      'scripts/import-qa-role-scenarios.js',
      'scripts/populate-qa-scenarios.js',
      'scripts/seed-consultant-rates-qa.mjs',
      'scripts/seed-docente-qa-test-data.js',
      'scripts/seed-hour-tracking-qa-data.mjs',
      'scripts/seed-qa-phase2.js',
      'scripts/seed-qa-phase2-final.js',
      'scripts/seed-qa-phase2-retest.js',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(root, file), 'utf8');
      const guardCall = source.indexOf('assertLegacySeederIsNotProduction(');
      const clientCall = source.indexOf('createClient(');
      expect(guardCall, file).toBeGreaterThan(-1);
      expect(guardCall, file).toBeLessThan(clientCall);
    }
  });

  it('refuses the deployed legacy QA seed route before its first network operation', () => {
    const source = readFileSync(resolve(__dirname, '../../pages/api/qa/seed-codebase-index.ts'), 'utf8');
    const guardCall = source.lastIndexOf('assertLegacySeederIsNotProduction(');
    const firstNetworkOperation = source.indexOf('supabaseAdmin.auth.getUser(');
    expect(guardCall).toBeGreaterThan(-1);
    expect(guardCall).toBeLessThan(firstNetworkOperation);
  });
});
