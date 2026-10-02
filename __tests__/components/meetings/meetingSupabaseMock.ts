/**
 * Supabase browser-client double for the MeetingDocumentationModal tests.
 *
 * SM-H8: the modal now reads back the rows it writes (`insert().select('id')`,
 * `update().eq().select('id')`, `delete().in().select('id')`) and treats a
 * write that reaches no row as refused. This double answers like PostgREST
 * does when the write succeeds, records every call per `<verb>:<table>`, and
 * lets a test make one table's writes fail with a given SQLSTATE.
 */
import { vi } from 'vitest';

export const capturedCalls: Record<string, any[]> = {};
export const fromCalls: string[] = [];
/** `<verb>:<table>` → error returned for that write (e.g. `insert:meeting_tasks`). */
export const failingWrites: Record<string, { code: string; message: string }> = {};
/** Rows returned for plain selects, per table. */
export const selectRows: Record<string, any[]> = {};

export function resetMeetingSupabaseMock() {
  for (const key of Object.keys(capturedCalls)) delete capturedCalls[key];
  for (const key of Object.keys(failingWrites)) delete failingWrites[key];
  for (const key of Object.keys(selectRows)) delete selectRows[key];
  fromCalls.length = 0;
}

let insertCounter = 0;

export function makeMeetingSupabaseClient() {
  return {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      const state: { op: 'select' | 'insert' | 'update' | 'delete'; rows: any[]; ids?: string[] } = {
        op: 'select',
        rows: [],
      };
      const record = (key: string, value: unknown) => {
        (capturedCalls[key] ??= []).push(value);
      };
      const failure = () => failingWrites[`${state.op}:${table}`];
      const writtenRows = () => {
        if (state.op === 'insert') {
          const inserted = state.rows.map((row) => ({ ...row, id: `${table}-new-${++insertCounter}`, version: 0 }));
          // Later selects see what was written, as with a real table.
          selectRows[table] = [...(selectRows[table] ?? []), ...inserted];
          return inserted;
        }
        if (state.op === 'delete' && state.ids) {
          const gone = new Set(state.ids);
          selectRows[table] = (selectRows[table] ?? []).filter((row) => !gone.has(row.id) && !gone.has(row.user_id));
        }
        if (state.ids) return state.ids.map((id) => ({ id, user_id: id }));
        return [{ id: `${table}-row` }];
      };
      let settled: { data: any; error: any } | null = null;
      const result = () => {
        // A chain is awaited once; compute (and apply side effects) once.
        if (settled) return settled;
        settled = computeResult();
        return settled;
      };
      const computeResult = () => {
        if (state.op === 'select') return { data: selectRows[table] ?? [], error: null };
        const error = failure();
        if (error) return { data: null, error };
        return { data: writtenRows(), error: null };
      };
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn((col: string, value: string) => {
          if (state.op !== 'select' && col === 'id') state.ids = [value];
          return chain;
        }),
        in: vi.fn((_col: string, ids: string[]) => {
          record(`in:${table}`, ids);
          state.ids = ids;
          return chain;
        }),
        is: vi.fn(() => chain),
        order: vi.fn(() => Promise.resolve(result())),
        single: vi.fn(() => {
          const r = result();
          return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error });
        }),
        then: (resolve: any, reject?: any) => Promise.resolve(result()).then(resolve, reject),
        insert: vi.fn((rows: any) => {
          record(`insert:${table}`, rows);
          state.op = 'insert';
          state.rows = Array.isArray(rows) ? rows : [rows];
          return chain;
        }),
        update: vi.fn((payload: any) => {
          record(`update:${table}`, payload);
          state.op = 'update';
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
    storage: { from: () => ({ remove: vi.fn().mockResolvedValue({ data: null, error: null }) }) },
  };
}
