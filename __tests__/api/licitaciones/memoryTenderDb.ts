/**
 * A small in-memory stand-in for the service-role Supabase client, used by the
 * evaluation and Acta route tests (GENERA fixes F20b). It keeps rows per table
 * and understands the few query shapes those routes use: select / eq /
 * not(col,'is',null) / not(col,'in','(a,b)') / order / single, update, upsert,
 * delete and insert. Every write is recorded, so a test can say "nothing was
 * written". A table can be told to fail its next reads. Synthetic data only.
 */

export type Row = Record<string, any>;
export type Write = { table: string; op: 'update' | 'upsert' | 'delete' | 'insert'; values?: unknown; filters: string[] };

type Filter = (row: Row) => boolean;

export function createMemoryTenderDb() {
  const tables: Record<string, Row[]> = {};
  const writes: Write[] = [];
  const failSelect: Record<string, string> = {};
  const uploads: string[] = [];
  let nextId = 1;

  const rows = (table: string) => (tables[table] ??= []);

  function from(table: string) {
    const filters: Filter[] = [];
    const filterText: string[] = [];
    let op: 'select' | 'update' | 'upsert' | 'delete' | 'insert' = 'select';
    let values: any = null;
    let orderBy: { col: string; asc: boolean } | null = null;
    let conflictKeys: string[] = [];

    const run = (terminal: 'await' | 'single') => {
      const matching = () => rows(table).filter(r => filters.every(f => f(r)));
      if (op === 'select') {
        if (failSelect[table]) return { data: null, error: { message: failSelect[table] } };
        let out = matching().map(r => ({ ...r }));
        if (orderBy) {
          const { col, asc } = orderBy;
          out = out.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
        }
        if (terminal === 'single') {
          return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'not one row' } };
        }
        return { data: out, error: null };
      }
      if (op === 'update') {
        writes.push({ table, op, values, filters: filterText });
        const hit = matching();
        for (const r of hit) Object.assign(r, values);
        return { data: hit.map(r => ({ ...r })), error: null };
      }
      if (op === 'delete') {
        writes.push({ table, op, filters: filterText });
        tables[table] = rows(table).filter(r => !filters.every(f => f(r)));
        return { data: null, error: null };
      }
      if (op === 'insert' || op === 'upsert') {
        writes.push({ table, op, values, filters: filterText });
        const list = Array.isArray(values) ? values : [values];
        const inserted = list.map(v => {
          if (op === 'upsert' && conflictKeys.length > 0) {
            const existing = rows(table).find(r => conflictKeys.every(k => r[k] === v[k]));
            if (existing) return Object.assign(existing, v);
          }
          const row = { id: v.id ?? `mem-${nextId++}`, ...v };
          rows(table).push(row);
          return row;
        });
        const data = terminal === 'single' ? inserted[0] : inserted;
        return { data, error: null };
      }
      return { data: null, error: null };
    };

    const chain: any = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filters.push(r => r[col] === val);
        filterText.push(`${col}=${String(val)}`);
        return chain;
      },
      not: (col: string, operator: string, val: unknown) => {
        if (operator === 'is' && val === null) {
          filters.push(r => r[col] !== null && r[col] !== undefined);
        } else if (operator === 'in') {
          const list = String(val).replace(/^\(|\)$/g, '').split(',').map(s => s.trim()).filter(Boolean);
          filters.push(r => !list.includes(String(r[col])));
        } else {
          throw new Error(`memoryTenderDb: unsupported not(${col}, ${operator})`);
        }
        filterText.push(`${col} not ${operator} ${String(val)}`);
        return chain;
      },
      in: (col: string, list: unknown[]) => {
        filters.push(r => list.includes(r[col]));
        filterText.push(`${col} in ${list.join(',')}`);
        return chain;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderBy = { col, asc: opts?.ascending !== false };
        return chain;
      },
      update: (v: Row) => { op = 'update'; values = v; return chain; },
      upsert: (v: Row | Row[], opts?: { onConflict?: string }) => {
        op = 'upsert';
        values = v;
        conflictKeys = (opts?.onConflict ?? '').split(',').map(k => k.trim()).filter(Boolean);
        return chain;
      },
      insert: (v: Row | Row[]) => { op = 'insert'; values = v; return chain; },
      delete: () => { op = 'delete'; return chain; },
      single: () => Promise.resolve(run('single')),
      maybeSingle: () => Promise.resolve(run('single')),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(run('await')).then(ok, ko),
    };
    return chain;
  }

  const client = {
    from,
    storage: {
      from: () => ({
        upload: async (path: string, body: Buffer) => {
          uploads.push(path);
          (client as any).lastUpload = body;
          return { error: null };
        },
        remove: async () => ({ error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: 'http://localhost/signed' } }),
      }),
    },
    lastUpload: null as Buffer | null,
  };

  return { client, tables, rows, writes, failSelect, uploads };
}
