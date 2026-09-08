import { closeSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The single data-access boundary of the pilot provisioner.
 *
 * Every stage (preflight / apply / verify / reset) talks to a `store` object
 * with the method set below and nothing else, so tests run the real stage
 * code against an in-memory fake and the CLI wires the Supabase-JS
 * implementation ONLY after target-guard.mjs has accepted the target.
 *
 * Store interface (all async):
 *   probeColumns(table, columns)              -> { ok, error? }   read-only schema probe
 *   readSchool(id)                            -> row | null
 *   readGrades()                              -> ab_grades rows
 *   readTemplatesByGrades(gradeIds)           -> assessment_templates rows for those grades
 *   readRows(table, column, values, columns)  -> rows where column IN values
 *   readMigrationPlan(schoolId)               -> ab_migration_plan rows
 *   countRows(table, column, values)          -> number of rows where column IN values
 *   countReferencing(table, column, values)   -> like countRows over DESCENDANT_COUNT_TABLES (head count, no content)
 *   readSchemaAttestation()                   -> the pilot_schema_attestation() payload (R10)
 *   insertRows(table, rows)                   -> number inserted
 *   publishTemplate(templateId)               -> shared publish-service result
 *   deleteRows(table, column, values)         -> number deleted (synthetic reset only)
 *   acquireLock(name) / releaseLock(name)
 *
 * Tables are restricted to the allowlists below; the Supabase implementation
 * refuses any other name, so a stage bug cannot reach a table the plan never
 * declared. `assessment_instances`, `school_course_*`, `profiles`, `user_roles`
 * and `auth` are READ (counted) only; they are never in a write allowlist.
 */

export const READ_TABLES = Object.freeze([
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
  'school_course_structure',
  'school_course_docente_assignments',
  'school_transversal_context',
  'profiles',
  'user_roles',
]);

/**
 * R9: every table that holds a foreign key to a table the synthetic reset
 * deletes from (schools, templates and their descendants). The reset COUNTS
 * rows in these tables (never reads their content, never writes them) to
 * refuse when anything not owned by the manifest hangs off an owned parent.
 * Kept in step with CASCADE_EDGES in reset.mjs and cross-checked at run time
 * against the attested foreign-key graph.
 */
export const DESCENDANT_COUNT_TABLES = Object.freeze([
  'ab_migration_plan',
  'assessment_assignments',
  'assessment_context_questions',
  'assessment_demo_access',
  'assessment_entity_year_weights',
  'assessment_indicators',
  'assessment_instances',
  'assessment_modules',
  'assessment_objectives',
  'assessment_sub_questions',
  'assessment_submissions',
  'assessment_template_snapshots',
  'assessment_year_expectations',
  'assignment_instances',
  'clientes',
  'consultant_assignments',
  'consultor_sessions',
  'context_general_responses',
  'dev_role_sessions',
  'generations',
  'group_assignment_groups',
  'growth_communities',
  'learning_paths',
  'licitaciones',
  'profiles',
  'program_enrollments',
  'red_escuelas',
  'school_change_history',
  'school_course_structure',
  'school_plan_completion_status',
  'school_transversal_context',
  'session_hour_overrides',
  'session_meetings_public',
  'supervisor_auditorias',
  'tractor_signups',
  'transformation_assessments',
  'user_roles',
  'zoom_attendance',
]);

export const WRITE_TABLES = Object.freeze([
  'schools',
  'ab_migration_plan',
  'assessment_templates',
  'assessment_objectives',
  'assessment_modules',
  'assessment_indicators',
  'assessment_year_expectations',
  'assessment_entity_year_weights',
]);

/** Reset may additionally delete the snapshots the publish service created for owned templates. */
export const DELETE_TABLES = Object.freeze([...WRITE_TABLES, 'assessment_template_snapshots']);

const IDENTIFIER_RE = /^[a-z][a-z0-9_]*$/;
const CHUNK = 200;

function assertTable(table, allow, verb) {
  if (!allow.includes(table)) throw new Error(`refusing ${verb} on table outside the provisioning allowlist: ${table}`);
}

function assertColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0 || columns.some((c) => !IDENTIFIER_RE.test(c))) {
    throw new Error('refusing invalid column list');
  }
}

function chunks(values) {
  const out = [];
  for (let i = 0; i < values.length; i += CHUNK) out.push(values.slice(i, i + CHUNK));
  return out;
}

function fail(operation, error) {
  return new Error(`${operation} failed: ${error?.message ?? String(error)}`);
}

/**
 * Local exclusive lock (O_EXCL create). Protects an operator machine from
 * running two write verbs of the same manifest concurrently; PostgREST offers
 * no advisory locks, so this is the documented limitation of the lock.
 */
export function createFileLock(lockDir) {
  const held = new Map();
  return {
    async acquireLock(name) {
      if (!/^[a-z0-9:_.-]+$/i.test(name)) throw new Error('lock name is invalid');
      mkdirSync(lockDir, { recursive: true });
      const path = join(lockDir, `${name.replace(/[^a-z0-9_.-]/gi, '_')}.lock`);
      let fd;
      try {
        fd = openSync(path, 'wx');
      } catch (error) {
        if (error?.code === 'EEXIST') throw new Error(`refusing: lock ${name} is already held (${path})`);
        throw error;
      }
      closeSync(fd);
      held.set(name, path);
    },
    async releaseLock(name) {
      const path = held.get(name);
      if (!path) return;
      held.delete(name);
      try {
        unlinkSync(path);
      } catch {
        /* already gone */
      }
    },
  };
}

/**
 * Supabase-JS implementation. Requires an already-constructed service-role
 * client (the CLI builds it only after the guard passed), the shared publish
 * service function, and the actor id recorded as snapshot_data.published_by.
 */
export function createSupabaseStore({ client, publishTemplate, actorId, lockDir }) {
  if (!client || typeof client.from !== 'function') throw new Error('supabase store requires a client');
  if (typeof publishTemplate !== 'function') throw new Error('supabase store requires the shared publish service');
  if (typeof actorId !== 'string' || actorId === '') throw new Error('supabase store requires an actor id');
  const lock = createFileLock(lockDir ?? join(process.cwd(), '.pilot-provisioning', 'locks'));

  async function selectIn(table, column, values, columns) {
    assertTable(table, READ_TABLES, 'read');
    assertColumns(columns);
    if (!IDENTIFIER_RE.test(column)) throw new Error('refusing invalid column');
    const rows = [];
    for (const part of chunks(values)) {
      if (part.length === 0) continue;
      const { data, error } = await client.from(table).select(columns.join(',')).in(column, part);
      if (error) throw fail(`read ${table}`, error);
      rows.push(...(data ?? []));
    }
    return rows;
  }

  return {
    kind: 'supabase',

    async probeColumns(table, columns) {
      assertTable(table, READ_TABLES, 'probe');
      assertColumns(columns);
      const { error } = await client.from(table).select(columns.join(',')).limit(0);
      return error ? { ok: false, error: error.message } : { ok: true };
    },

    async readSchool(id) {
      const { data, error } = await client.from('schools').select('id,name,tenant_kind').eq('id', id).maybeSingle();
      if (error) throw fail('read schools', error);
      return data ?? null;
    },

    async readGrades() {
      const { data, error } = await client.from('ab_grades').select('id,name,sort_order,is_always_gt').order('sort_order');
      if (error) throw fail('read ab_grades', error);
      return data ?? [];
    },

    async readTemplatesByGrades(gradeIds) {
      return selectIn('assessment_templates', 'grade_id', gradeIds, [
        'id',
        'area',
        'grade_id',
        'version',
        'name',
        'description',
        'status',
        'is_archived',
        'scoring_config',
      ]);
    },

    async readRows(table, column, values, columns) {
      return selectIn(table, column, values, columns);
    },

    async readMigrationPlan(schoolId) {
      const { data, error } = await client
        .from('ab_migration_plan')
        .select('id,school_id,year_number,grade_id,generation_type')
        .eq('school_id', schoolId);
      if (error) throw fail('read ab_migration_plan', error);
      return data ?? [];
    },

    async countRows(table, column, values) {
      assertTable(table, READ_TABLES, 'count');
      if (!IDENTIFIER_RE.test(column)) throw new Error('refusing invalid column');
      let total = 0;
      for (const part of chunks(values)) {
        if (part.length === 0) continue;
        const { count, error } = await client.from(table).select('id', { count: 'exact', head: true }).in(column, part);
        if (error) throw fail(`count ${table}`, error);
        total += count ?? 0;
      }
      return total;
    },

    async countReferencing(table, column, values) {
      assertTable(table, DESCENDANT_COUNT_TABLES, 'count-referencing');
      if (!IDENTIFIER_RE.test(column)) throw new Error('refusing invalid column');
      let total = 0;
      for (const part of chunks(values)) {
        if (part.length === 0) continue;
        // head + exact count: no row content ever leaves the database.
        const { count, error } = await client.from(table).select('*', { count: 'exact', head: true }).in(column, part);
        if (error) throw fail(`count ${table}`, error);
        total += count ?? 0;
      }
      return total;
    },

    async readSchemaAttestation() {
      const { data, error } = await client.rpc('pilot_schema_attestation');
      if (error) throw fail('read pilot_schema_attestation', error);
      return data;
    },

    async insertRows(table, rows) {
      assertTable(table, WRITE_TABLES, 'insert');
      if (rows.length === 0) return 0;
      const { error } = await client.from(table).insert(rows);
      if (error) throw fail(`insert ${table}`, error);
      return rows.length;
    },

    async publishTemplate(templateId) {
      return publishTemplate(client, templateId, { id: actorId });
    },

    async deleteRows(table, column, values) {
      assertTable(table, DELETE_TABLES, 'delete');
      if (!IDENTIFIER_RE.test(column)) throw new Error('refusing invalid column');
      let deleted = 0;
      for (const part of chunks(values)) {
        if (part.length === 0) continue;
        const { data, error } = await client.from(table).delete().in(column, part).select('id');
        if (error) throw fail(`delete ${table}`, error);
        deleted += (data ?? []).length;
      }
      return deleted;
    },

    acquireLock: lock.acquireLock,
    releaseLock: lock.releaseLock,
  };
}
