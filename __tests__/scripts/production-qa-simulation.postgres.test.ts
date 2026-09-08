// @vitest-environment node
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import {
  buildSimulationManifest,
  expectedCounts,
} from '../../scripts/production-qa-simulation/manifest.mjs';
import {
  resetManifest,
  seedManifest,
  verifyManifest,
} from '../../scripts/production-qa-simulation/engine.mjs';
import { createPostgresSimulationStore } from '../../scripts/production-qa-simulation/postgres-store.mjs';
import { assertProductionQaTarget } from '../../scripts/production-qa-simulation/target-guard.mjs';

const RUN_LOCAL_DATABASE_TEST = process.env.SM_SIM_LOCAL_DATABASE_TEST === '1';

function requireLocalSimulationDatabase(rawUrl: string | undefined): string {
  if (!rawUrl) throw new Error('local simulation database URL is required');
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('local simulation database URL is invalid');
  }
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol)
    || !localHosts.has(url.hostname)
    || url.port !== '54322'
    || url.pathname !== '/postgres'
  ) {
    throw new Error('refusing non-local simulation integration database');
  }
  return rawUrl;
}

function guardedTarget() {
  return assertProductionQaTarget({
    supabaseUrl: 'https://sxlogxqzmarhqsblxmtj.supabase.co',
    schoolIds: [257, 259],
  });
}

describe('production QA simulation local database guard', () => {
  it('refuses a hosted integration-test database before a pool is built', () => {
    expect(() => requireLocalSimulationDatabase('postgresql://db.example.test:5432/postgres'))
      .toThrow('refusing non-local');
  });
});

describe.runIf(RUN_LOCAL_DATABASE_TEST)('production QA simulation PostgreSQL round trip', () => {
  it('seeds, verifies, and resets real column types inside an always-rolled-back transaction', async () => {
    const databaseUrl = requireLocalSimulationDatabase(process.env.SM_SIM_LOCAL_DATABASE_URL);
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const transactionClient = await pool.connect();

    try {
      await transactionClient.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await transactionClient.query("SET LOCAL statement_timeout = '8s'");
      await transactionClient.query(
        `INSERT INTO public.schools
           (id, name, has_generations, tenant_kind, internal_zoom_testing_enabled)
         VALUES
           (257, '__sm_sim_local_primary__', false, 'qa', false),
           (259, '__sm_sim_local_control__', false, 'qa', false)
         ON CONFLICT (id) DO UPDATE
         SET has_generations = false,
             tenant_kind = 'qa',
             internal_zoom_testing_enabled = false`,
      );

      const manifest = buildSimulationManifest();
      const store = createPostgresSimulationStore(pool, { transactionClient });

      const first = await seedManifest({ store, manifest, guardedTarget: guardedTarget() });
      expect(first.inserted).toEqual({
        generations: 2,
        program_enrollments: 2,
        licitaciones: 1,
        transformation_assessments: 2,
      });

      const second = await seedManifest({ store, manifest, guardedTarget: guardedTarget() });
      expect(Object.values(second.inserted).reduce((total: number, count: unknown) => total + Number(count), 0)).toBe(0);

      await expect(verifyManifest({ store, manifest, guardedTarget: guardedTarget() }))
        .resolves.toEqual({ counts: expectedCounts(manifest), digest: manifest.digest });

      const roundTrip = await transactionClient.query(
        `SELECT pe.start_date, pe.end_date,
                ta.conversation_history, ta.context_metadata, ta.grades
         FROM public.program_enrollments pe
         CROSS JOIN public.transformation_assessments ta
         WHERE pe.id = $1::uuid AND ta.id = $2::uuid`,
        [manifest.tables[1].rows[0].id, manifest.tables[3].rows[0].id],
      );
      expect(roundTrip.rows[0].start_date).toBeInstanceOf(Date);
      expect(roundTrip.rows[0].end_date).toBeInstanceOf(Date);
      expect(roundTrip.rows[0].conversation_history).toEqual([]);
      expect(roundTrip.rows[0].grades).toEqual([]);
      expect(roundTrip.rows[0].context_metadata).toMatchObject({ manifestVersion: 'sm-sim-v1' });

      const afterSeedSchools = await transactionClient.query(
        'SELECT id, has_generations FROM public.schools WHERE id = ANY($1::integer[]) ORDER BY id',
        [[257, 259]],
      );
      expect(afterSeedSchools.rows).toEqual([
        { id: 257, has_generations: true },
        { id: 259, has_generations: true },
      ]);

      // Real-column drift probes. Each mutation is contained by its own savepoint so
      // the enclosing transaction — which is rolled back unconditionally below — never
      // carries drift into the reset assertions and leaves no residue behind.
      const assessmentId = manifest.tables[3].rows[0].id;
      const driftProbes = [
        {
          label: 'extra nested JSON property',
          sql: `UPDATE public.transformation_assessments
                SET context_metadata = context_metadata || '{"injectedProperty":"drift"}'::jsonb
                WHERE id = $1::uuid`,
        },
        {
          label: 'altered JSON array contents',
          sql: `UPDATE public.transformation_assessments
                SET grades = '[{"area":"aprendizaje","score":5}]'::jsonb
                WHERE id = $1::uuid`,
        },
      ];

      for (const probe of driftProbes) {
        await transactionClient.query('SAVEPOINT sm_sim_drift_probe');
        const mutated = await transactionClient.query(probe.sql, [assessmentId]);
        expect(mutated.rowCount, probe.label).toBe(1);

        await expect(verifyManifest({ store, manifest, guardedTarget: guardedTarget() }), probe.label)
          .rejects.toThrow('manifest-owned row drift detected in transformation_assessments');
        await expect(resetManifest({ store, manifest, guardedTarget: guardedTarget() }), probe.label)
          .rejects.toThrow('manifest-owned row drift detected in transformation_assessments');

        await transactionClient.query('ROLLBACK TO SAVEPOINT sm_sim_drift_probe');
        await transactionClient.query('RELEASE SAVEPOINT sm_sim_drift_probe');
      }

      const afterProbes = await transactionClient.query(
        'SELECT context_metadata, grades FROM public.transformation_assessments WHERE id = $1::uuid',
        [assessmentId],
      );
      expect(afterProbes.rows[0].context_metadata).not.toHaveProperty('injectedProperty');
      expect(afterProbes.rows[0].grades).toEqual([]);
      await expect(verifyManifest({ store, manifest, guardedTarget: guardedTarget() }))
        .resolves.toEqual({ counts: expectedCounts(manifest), digest: manifest.digest });

      const reset = await resetManifest({ store, manifest, guardedTarget: guardedTarget() });
      expect(reset.deleted).toEqual({
        transformation_assessments: 2,
        licitaciones: 1,
        program_enrollments: 2,
        generations: 2,
      });

      const remaining = await transactionClient.query(
        `SELECT count(*)::integer AS count
         FROM (
           SELECT id FROM public.generations WHERE id = ANY($1::uuid[])
           UNION ALL SELECT id FROM public.program_enrollments WHERE id = ANY($1::uuid[])
           UNION ALL SELECT id FROM public.licitaciones WHERE id = ANY($1::uuid[])
           UNION ALL SELECT id FROM public.transformation_assessments WHERE id = ANY($1::uuid[])
         ) manifest_rows`,
        [manifest.tables.flatMap((table) => table.rows.map((row) => row.id))],
      );
      expect(remaining.rows[0].count).toBe(0);

      const afterResetSchools = await transactionClient.query(
        'SELECT id, has_generations FROM public.schools WHERE id = ANY($1::integer[]) ORDER BY id',
        [[257, 259]],
      );
      expect(afterResetSchools.rows).toEqual([
        { id: 257, has_generations: false },
        { id: 259, has_generations: false },
      ]);
    } finally {
      await transactionClient.query('ROLLBACK').catch(() => undefined);
      transactionClient.release();
      await pool.end();
    }
  });
});
