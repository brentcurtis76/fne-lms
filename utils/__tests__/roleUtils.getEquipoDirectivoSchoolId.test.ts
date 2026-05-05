import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEquipoDirectivoSchoolId } from '../roleUtils';
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = { id: number; school_id: number | string | null };

interface StubOptions {
  rows?: Row[];
  error?: { message: string } | null;
}

const USER_ID = 'user-1';

function makeSupabaseStub(options: StubOptions): {
  client: SupabaseClient;
  spies: {
    from: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    eqs: Array<[string, unknown]>;
  };
} {
  const eqs: Array<[string, unknown]> = [];
  const rows = options.rows ?? [];
  const error = options.error ?? null;

  // Sort by id ascending and take the first row, mimicking .order().limit(1).maybeSingle()
  const ordered = [...rows].sort((a, b) => a.id - b.id);
  const first = ordered[0] ?? null;

  const maybeSingle = vi.fn().mockResolvedValue({
    data: error ? null : first,
    error,
  });
  const limit = vi.fn().mockReturnValue({ maybeSingle });
  const order = vi.fn().mockReturnValue({ limit });
  const builder: any = {
    eq: vi.fn((column: string, value: unknown) => {
      eqs.push([column, value]);
      return builder;
    }),
    order,
    limit,
    maybeSingle,
  };
  const select = vi.fn().mockReturnValue(builder);
  const from = vi.fn().mockReturnValue({ select });

  return {
    client: { from } as unknown as SupabaseClient,
    spies: { from, select, order, limit, maybeSingle, eqs },
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

  it('returns the school_id for an active equipo_directivo row', async () => {
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
    expect(spies.limit).toHaveBeenCalledWith(1);
  });

  it('returns null when no equipo_directivo row exists', async () => {
    const { client } = makeSupabaseStub({ rows: [] });
    const result = await getEquipoDirectivoSchoolId(client, USER_ID);
    expect(result).toBeNull();
  });

  it('returns null for an admin-only user (no equipo_directivo row)', async () => {
    // The query filters by role_type=equipo_directivo, so an admin-only user
    // simply has no matching row — the stub returns null data.
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

  it('deterministically picks the lowest-id row when multiple active rows exist', async () => {
    const { client } = makeSupabaseStub({
      rows: [
        { id: 99, school_id: 200 },
        { id: 5, school_id: 100 },
        { id: 50, school_id: 150 },
      ],
    });

    const result = await getEquipoDirectivoSchoolId(client, USER_ID);

    expect(result).toBe(100);
  });
});
