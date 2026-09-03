const ALLOWED_TABLES = new Set([
  'generations',
  'program_enrollments',
  'licitaciones',
  'transformation_assessments',
]);

function identifier(value) {
  if (!ALLOWED_TABLES.has(value) && !/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error('refusing invalid SQL identifier');
  }
  return `"${value}"`;
}

function columnsSql(columns) {
  if (!Array.isArray(columns) || columns.length === 0 || columns.some((column) => !/^[a-z][a-z0-9_]*$/.test(column))) {
    throw new Error('refusing invalid SQL column list');
  }
  return columns.map(identifier).join(', ');
}

export function createPostgresSimulationStore(pool) {
  let transactionClient = null;

  function client() {
    if (!transactionClient) throw new Error('simulation store operation requires a transaction');
    return transactionClient;
  }

  return {
    async transaction(callback, options = {}) {
      if (transactionClient) return callback();
      const leased = await pool.connect();
      transactionClient = leased;
      try {
        await leased.query(`BEGIN ISOLATION LEVEL SERIALIZABLE${options.readOnly ? ' READ ONLY' : ''}`);
        await leased.query("SET LOCAL statement_timeout = '8s'");
        const result = await callback();
        await leased.query(options.readOnly ? 'ROLLBACK' : 'COMMIT');
        return result;
      } catch (error) {
        await leased.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        transactionClient = null;
        leased.release();
      }
    },

    async acquireManifestLock(version) {
      await client().query('SELECT pg_advisory_xact_lock(hashtext($1))', [`production-qa-simulation:${version}`]);
    },

    async readQaTenants(schoolIds) {
      const result = await client().query(
        'SELECT id, tenant_kind FROM public.schools WHERE id = ANY($1::integer[]) ORDER BY id',
        [schoolIds],
      );
      return result.rows;
    },

    async readByIds(table, ids, columns) {
      if (!ALLOWED_TABLES.has(table)) throw new Error('table is not in the simulation allowlist');
      const result = await client().query(
        `SELECT ${columnsSql(columns)} FROM public.${identifier(table)} WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [ids],
      );
      return result.rows;
    },

    async findNaturalKeyCollisions(table, naturalKey, rows) {
      if (!ALLOWED_TABLES.has(table)) throw new Error('table is not in the simulation allowlist');
      if (naturalKey.length === 0) return [];
      const found = [];
      for (const row of rows) {
        const clauses = naturalKey.map((column, index) => `${identifier(column)} IS NOT DISTINCT FROM $${index + 1}`);
        const result = await client().query(
          `SELECT id FROM public.${identifier(table)} WHERE ${clauses.join(' AND ')} LIMIT 2`,
          naturalKey.map((column) => row[column]),
        );
        found.push(...result.rows);
      }
      return found;
    },

    async insertMissing(table, rows) {
      if (!ALLOWED_TABLES.has(table)) throw new Error('table is not in the simulation allowlist');
      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
        await client().query(
          `INSERT INTO public.${identifier(table)} (${columnsSql(columns)}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
          columns.map((column) => row[column]),
        );
      }
    },

    async findForeignReferences(ownedIds) {
      const targetTables = [...ownedIds.keys()];
      const constraints = await client().query(
        `SELECT
           target.relname AS target_table,
           source_ns.nspname AS source_schema,
           source.relname AS source_table,
           source_col.attname AS source_column
         FROM pg_constraint constraint_row
         JOIN pg_class source ON source.oid = constraint_row.conrelid
         JOIN pg_namespace source_ns ON source_ns.oid = source.relnamespace
         JOIN pg_class target ON target.oid = constraint_row.confrelid
         JOIN pg_namespace target_ns ON target_ns.oid = target.relnamespace
         JOIN LATERAL unnest(constraint_row.conkey, constraint_row.confkey)
           AS key_pair(source_attnum, target_attnum) ON true
         JOIN pg_attribute source_col
           ON source_col.attrelid = source.oid AND source_col.attnum = key_pair.source_attnum
         JOIN pg_attribute target_col
           ON target_col.attrelid = target.oid AND target_col.attnum = key_pair.target_attnum
         WHERE constraint_row.contype = 'f'
           AND target_ns.nspname = 'public'
           AND target.relname = ANY($1::text[])
           AND target_col.attname = 'id'`,
        [targetTables],
      );

      const references = [];
      for (const constraint of constraints.rows) {
        const ids = [...(ownedIds.get(constraint.target_table) ?? [])];
        if (ids.length === 0) continue;
        const result = await client().query(
          `SELECT count(*)::integer AS count FROM ${identifier(constraint.source_schema)}.${identifier(constraint.source_table)} WHERE ${identifier(constraint.source_column)} = ANY($1::uuid[])`,
          [ids],
        );
        if (result.rows[0]?.count > 0) {
          references.push({ table: constraint.source_table, count: result.rows[0].count });
        }
      }
      return references;
    },

    async deleteByIds(table, ids) {
      if (!ALLOWED_TABLES.has(table)) throw new Error('table is not in the simulation allowlist');
      const result = await client().query(
        `DELETE FROM public.${identifier(table)} WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      return result.rowCount ?? 0;
    },
  };
}
