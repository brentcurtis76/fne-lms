/**
 * Server-only: what a teacher's registro needs, read in two steps (N1, part 1).
 *
 * 1. The gate runs with the CALLER's own client: the caller must hold a row in
 *    assessment_instance_assignees for that instance (`assertInstanceAssignee`).
 * 2. Only after the gate passes, the stored version of the instrument
 *    (assessment_template_snapshots) and the expected levels
 *    (assessment_year_expectations) are read with the SERVER's service client,
 *    so the teacher's routes do not depend on the teacher's own right to read
 *    them. The expected levels never leave the server before the registro is
 *    sent: `loadActiveIndicatorIds` turns them into a set of ids, and
 *    `stripExpectations` removes them from the stored content.
 *
 * Never import this module from a page or a component: the service client it
 * is handed bypasses the database's read rules.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type ReadClient = Pick<SupabaseClient, 'from'>;

/**
 * The gate every teacher route already applies: the caller's own assignee row
 * for this instance, read with the caller's client. Returns the row, or null
 * when the caller is not an assignee (or the read fails) — each route answers
 * null with its own status and message, exactly as before.
 */
export async function assertInstanceAssignee(
  callerClient: ReadClient,
  instanceId: string,
  userId: string
): Promise<Record<string, any> | null> {
  const { data: assignee, error: assigneeError } = await callerClient
    .from('assessment_instance_assignees')
    .select('*')
    .eq('instance_id', instanceId)
    .eq('user_id', userId)
    .single();

  if (assigneeError || !assignee) return null;
  return assignee as Record<string, any>;
}

export interface RegistroSnapshot {
  id: string;
  template_id: string;
  version: string;
  snapshot_data: any;
  created_at?: string;
}

const SNAPSHOT_COLUMNS = 'id, template_id, version, snapshot_data, created_at';

/**
 * The stored version of one instance, read with the service client.
 * `snapshot` is null when the instance names no stored version or the row is
 * not there; `error` is set when the read itself failed.
 */
export async function loadSnapshotForInstance(
  serviceClient: ReadClient,
  instance: { template_snapshot_id?: string | null }
): Promise<{ snapshot: RegistroSnapshot | null; error: unknown }> {
  const snapshotId = instance?.template_snapshot_id;
  if (!snapshotId) return { snapshot: null, error: null };

  const { data, error } = await serviceClient
    .from('assessment_template_snapshots')
    .select(SNAPSHOT_COLUMNS)
    .eq('id', snapshotId)
    .maybeSingle();

  if (error) return { snapshot: null, error };
  return { snapshot: (data as RegistroSnapshot | null) ?? null, error: null };
}

/**
 * The stored versions of several instances (the teacher's list), read with the
 * service client in one query, keyed by snapshot id.
 */
export async function loadSnapshotsForInstances(
  serviceClient: ReadClient,
  instances: Array<{ template_snapshot_id?: string | null }>
): Promise<{ snapshots: Map<string, RegistroSnapshot>; error: unknown }> {
  const ids = Array.from(
    new Set(instances.map((i) => i?.template_snapshot_id).filter((id): id is string => !!id))
  );
  const snapshots = new Map<string, RegistroSnapshot>();
  if (ids.length === 0) return { snapshots, error: null };

  const { data, error } = await serviceClient
    .from('assessment_template_snapshots')
    .select(SNAPSHOT_COLUMNS)
    .in('id', ids);

  if (error) return { snapshots, error };
  for (const row of (data as RegistroSnapshot[] | null) || []) {
    snapshots.set(row.id, row);
  }
  return { snapshots, error: null };
}

/**
 * The ids of the indicators that have an expected level for the instance's
 * year and generation type (read with the service client). This is the
 * computation the form route and the send route made inline before:
 * - no template id or no year: nothing is read, `ids` is null;
 * - the read fails: `ids` is null and `error` is set (each route decides);
 * - no rows: `ids` is null (legacy instrument without expected levels);
 * - otherwise: the ids whose `year_<N>_expected` is neither null nor undefined.
 */
export async function loadActiveIndicatorIds(
  serviceClient: ReadClient,
  instance: {
    templateId?: string | null;
    transformationYear?: number | null;
    generationType: string;
  }
): Promise<{ ids: Set<string> | null; error: unknown }> {
  const { templateId, transformationYear, generationType } = instance;
  if (!templateId || !transformationYear) return { ids: null, error: null };

  const yearKey = `year_${transformationYear}_expected`;
  const { data: expData, error: expError } = await serviceClient
    .from('assessment_year_expectations')
    .select('indicator_id, ' + yearKey)
    .eq('template_id', templateId)
    .eq('generation_type', generationType);

  if (expError) return { ids: null, error: expError };
  if (!expData || expData.length === 0) return { ids: null, error: null };

  const ids = new Set<string>();
  for (const row of expData as any[]) {
    const expectedValue = row[yearKey];
    if (expectedValue !== null && expectedValue !== undefined) {
      ids.add(row.indicator_id);
    }
  }
  return { ids, error: null };
}

/**
 * Keys under which publishTemplate puts an indicator's expected levels into
 * the stored content (lib/services/assessment-builder/publishTemplate.ts,
 * buildIndicatorSnapshot): `expectations_gt`, `expectations_gi` and the legacy
 * `expectations`. Each holds year_1..5_expected, their units and the tolerance.
 */
export const EXPECTATION_KEYS: readonly string[] = ['expectations', 'expectations_gt', 'expectations_gi'];

/**
 * A deep copy of the stored content without any expected level: every
 * EXPECTATION_KEYS entry is removed wherever it appears (objectives → modules
 * → indicators, the flat modules list, and any older shape). The input is not
 * changed.
 */
export function stripExpectations<T>(snapshotData: T): T {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (EXPECTATION_KEYS.includes(key)) continue;
        out[key] = walk(child);
      }
      return out;
    }
    return value;
  };
  return walk(snapshotData) as T;
}
