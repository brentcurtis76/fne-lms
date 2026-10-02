/**
 * Supabase browser-client double for the MeetingDocumentationModal tests.
 *
 * SM-H8: the modal reads back the rows it writes (`insert().select('id')`,
 * `update().eq().select('id')`, `delete().in().select('id')`) and treats a
 * write that reaches no row as refused. This double keeps a small table store
 * and answers like PostgREST:
 *   - inserts add rows (meeting_attendees / meeting_read_grants refuse a
 *     duplicate (meeting_id, user_id) with 23505, as the unique keys do);
 *   - updates and deletes return only rows that exist in the store, so a write
 *     to a row that is not there reaches nothing;
 *   - plain selects return the store, filtered by `.eq()` / `.in()`.
 * Tests seed rows with `seedRows`, make one write fail with `failingWrites`,
 * and hold a write open with `holdWrites` to exercise in-flight behaviour.
 */
import { vi } from 'vitest';

export const capturedCalls: Record<string, any[]> = {};
export const fromCalls: string[] = [];
/** `<verb>:<table>` → error returned for that write (e.g. `insert:meeting_tasks`). */
export const failingWrites: Record<string, { code: string; message: string }> = {};
/** `<verb>:<table>` whose writes RLS silently filters: no error, no row reached. */
export const refusedWrites = new Set<string>();
/** table → error returned for plain selects of that table. */
export const failingReads: Record<string, { code: string; message: string }> = {};
/** `<verb>:<table>` → promise the write waits for before answering. */
export const holdWrites: Record<string, Promise<void>> = {};
/** Table store: rows per table. */
export const tableRows: Record<string, any[]> = {};

export function seedRows(table: string, rows: any[]) {
  tableRows[table] = rows.map((row) => ({ ...row }));
}

/** A promise a test resolves by hand; `holdWrites[key] = gate.promise`. */
export function makeGate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

export function resetMeetingSupabaseMock() {
  for (const store of [capturedCalls, failingWrites, failingReads, holdWrites, tableRows] as Array<Record<string, unknown>>) {
    for (const key of Object.keys(store)) delete store[key];
  }
  fromCalls.length = 0;
  refusedWrites.clear();
}

let insertCounter = 0;
const UNIQUE_BY_MEETING_USER = new Set(['meeting_attendees', 'meeting_read_grants']);

export function makeMeetingSupabaseClient() {
  return {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      const state: {
        op: 'select' | 'insert' | 'update' | 'delete';
        rows: any[];
        payload?: any;
        eq: Array<[string, unknown]>;
        in: Array<[string, unknown[]]>;
      } = { op: 'select', rows: [], eq: [], in: [] };
      const record = (key: string, value: unknown) => {
        (capturedCalls[key] ??= []).push(value);
      };
      const matches = (row: any) =>
        state.eq.every(([col, value]) => row[col] === value) &&
        state.in.every(([col, values]) => values.includes(row[col]));
      const compute = () => {
        const store = (tableRows[table] ??= []);
        if (state.op === 'select') {
          const readError = failingReads[table];
          return readError ? { data: null, error: readError } : { data: store.filter(matches), error: null };
        }
        const error = failingWrites[`${state.op}:${table}`];
        if (error) return { data: null, error };
        if (state.op === 'insert') {
          if (UNIQUE_BY_MEETING_USER.has(table)) {
            const clash = state.rows.some((row) =>
              store.some((existing) => existing.meeting_id === row.meeting_id && existing.user_id === row.user_id),
            );
            if (clash) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          }
          const inserted = state.rows.map((row) => ({ ...row, id: `${table}-new-${++insertCounter}`, version: 0 }));
          store.push(...inserted);
          return { data: inserted, error: null };
        }
        if (refusedWrites.has(`${state.op}:${table}`)) return { data: [], error: null };
        const hit = store.filter(matches);
        if (state.op === 'update') {
          hit.forEach((row) => Object.assign(row, state.payload));
          return { data: hit.map((row) => ({ ...row })), error: null };
        }
        tableRows[table] = store.filter((row) => !hit.includes(row));
        return { data: hit.map((row) => ({ ...row })), error: null };
      };
      let settled: Promise<{ data: any; error: any }> | null = null;
      const result = () => {
        // A chain is awaited once; side effects happen once.
        if (!settled) {
          const hold = state.op === 'select' ? undefined : holdWrites[`${state.op}:${table}`];
          settled = (hold ?? Promise.resolve()).then(compute);
        }
        return settled;
      };
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn((col: string, value: unknown) => {
          state.eq.push([col, value]);
          return chain;
        }),
        in: vi.fn((col: string, values: unknown[]) => {
          record(`in:${table}`, values);
          state.in.push([col, values]);
          return chain;
        }),
        is: vi.fn(() => chain),
        order: vi.fn(() => result()),
        single: vi.fn(() =>
          result().then((r) => ({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error })),
        ),
        then: (resolve: any, reject?: any) => result().then(resolve, reject),
        insert: vi.fn((rows: any) => {
          record(`insert:${table}`, rows);
          state.op = 'insert';
          state.rows = Array.isArray(rows) ? rows : [rows];
          return chain;
        }),
        update: vi.fn((payload: any) => {
          record(`update:${table}`, payload);
          state.op = 'update';
          state.payload = payload;
          return chain;
        }),
        delete: vi.fn(() => {
          record(`delete:${table}`, true);
          state.op = 'delete';
          return chain;
        }),
      };
      return chain;
    }),
    storage: {
      from: () => ({
        remove: vi.fn(async (paths: string[]) => {
          record('remove:storage', paths);
          const error = failingWrites['remove:storage'];
          return error ? { data: null, error } : { data: paths.map((name) => ({ name })), error: null };
        }),
      }),
    },
  };
}

function record(key: string, value: unknown) {
  (capturedCalls[key] ??= []).push(value);
}
