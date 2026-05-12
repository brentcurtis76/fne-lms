import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEquipoDirectivoSchoolId } from '../roleUtils';
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = { id: number; school_id: number | string | null };

interface StubOptions {
  rows?: Row[];
  error?: { message: string } | null;
}

const USER_ID = 'user-1';

// The handler calls:
//   .from('user_roles').select('id, school_id')
//     .eq('user_id', userId)
//     .eq('role_type', 'equipo_directivo')
//     .eq('is_active', true)
//     .order('id', { ascending: true })
//     .limit(2)
// then awaits — so the `.limit(2)` return value must be thenable.
function makeSupabaseStub(options: StubOptions): {
  client: SupabaseClient;
  spies: {
    from: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    eqs: Array<[string, unknown]>;
  };
} {
  const eqs: Array<[string, unknown]> = [];
  const rows = options.rows ?? [];
  const error = options.error ?? null;

  // .limit(2) returns a thenable that resolves to { data, error }
  const limit = vi.fn().mockImplementation((n: number) => ({
    then: (resolve: (v: unknown) => void) =>
      resolve({
        data: error ? null : rows.slice(0, n),
        error,
      }),
  }));
  const order = vi.fn().mockReturnValue({ limit });
  const builder: any = {
    eq: vi.fn((column: string, value: unknown) => {
      eqs.push([column, value]);
      return builder;
    }),
    order,
    limit,
  };
  const select = vi.fn().mockReturnValue(builder);
  const from = vi.fn().mockReturnValue({ select });

  return {
    client: { from } as unknown as SupabaseClient,
    spies: { from, select, order, limit, eqs },
  };
}

describe('getEquipoDirectivoSchoolId', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns the school_id for the single active equipo_directivo row', async () => {
    const { client, spies } = makeSupabaseStub({
      rows: [{ id: 10, school_id: 42 }],
    });

    const result = await getEquipoDirectivoSchoolId(client, USER_ID);

    expect(result).toBe(42);
    expect(spies.from).toHaveBeenCalledWith('user_roles');
    expect(spies.select).toHaveBeenCalledWith('id, school_id');
    expect(spies.eqs).toEqual([
      ['user_id', USER_ID],
      ['role_type', 'equipo_directivo'],
      ['is_active', true],
    ]);
    expect(spies.order).toHaveBeenCalledWith('id', { ascending: true });
    expect(spies.limit).toHaveBeenCalledWith(2);
  });

  it('returns null when no equipo_directivo row exists', async () => {
    const { client } = makeSupabaseStub({ rows: [] });
    const result = await getEquipoDirectivoSchoolId(client, USER_ID);
    expect(result).toBeNull();
  });

  it('returns null for an admin-only user (no equipo_directivo row)', async () => {
    const { client } = makeSupabaseStub({ rows: [] });
    const result = await getEquipoDirectivoSchoolId(client, USER_ID);
    expect(result).toBeNull();
  });

  it('returns null and does not throw when Supabase returns an error', async () => {
    const { client } = makeSupabaseStub({
      error: { message: 'connection refused' },
    });

    const result = await getEquipoDirectivoSchoolId(client, USER_ID);

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[roleUtils.getEquipoDirectivoSchoolId]',
      expect.objectContaining({ message: 'connection refused' })
    );
  });

  it('coerces a string school_id to a number', async () => {
    const { client } = makeSupabaseStub({
      rows: [{ id: 1, school_id: '7' }],
    });

    const result = await getEquipoDirectivoSchoolId(client, USER_ID);

    expect(result).toBe(7);
    expect(typeof result).toBe('number');
  });

  it('returns null when school_id is a non-numeric string (NaN guard)', async () => {
    const { client } = makeSupabaseStub({
      rows: [{ id: 1, school_id: 'abc' }],
    });

    const result = await getEquipoDirectivoSchoolId(client, USER_ID);

    expect(result).toBeNull();
  });

  it('returns null and logs error when multiple active ED rows exist (multi-ED invariant)', async () => {
    // F3 fail-closed: the page-layer enforcement of a single ED can be bypassed
    // via direct API calls if the helper silently picks one row. Multiple rows
    // must return null and surface a console.error.
    const { client } = makeSupabaseStub({
      rows: [
        { id: 5, school_id: 100 },
        { id: 50, school_id: 150 },
      ],
    });

    const result = await getEquipoDirectivoSchoolId(client, USER_ID);

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[roleUtils.getEquipoDirectivoSchoolId] multi-ED invariant violated',
      expect.objectContaining({
        userId: USER_ID,
        rows: [
          { id: 5, school_id: 100 },
          { id: 50, school_id: 150 },
        ],
      })
    );
  });
});
