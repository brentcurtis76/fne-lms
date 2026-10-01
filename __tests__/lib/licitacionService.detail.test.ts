// @vitest-environment node

/**
 * Regression: getLicitacionDetail must only select columns that exist on
 * `schools`. Selecting a missing column (e.g. `code`) makes PostgREST reject
 * the query, `school` comes back null, and the detail page never generates
 * the publicacion text.
 */

import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getLicitacionDetail } from '../../lib/licitacionService';

const SCHOOLS_COLUMNS = new Set(['id', 'name', 'cliente_id', 'has_generations', 'logo_url', 'tenant_kind', 'internal_zoom_testing_enabled']);

function makeClient(selects: Record<string, string>): SupabaseClient {
  const rows: Record<string, unknown> = {
    licitaciones: { id: 'lic-1', school_id: 1, cliente_id: 'cli-1', programa_id: null },
    schools: { id: 1, name: 'Colegio Test', cliente_id: 'cli-1' },
    clientes: { id: 'cli-1', nombre_fantasia: 'Fundacion Test', comuna: 'Santiago' },
  };
  return {
    from(table: string) {
      const builder = {
        select(cols: string) {
          selects[table] = cols;
          return builder;
        },
        eq() {
          return builder;
        },
        async single() {
          if (table === 'schools') {
            const bad = selects[table].split(',').map(c => c.trim()).filter(c => !SCHOOLS_COLUMNS.has(c));
            if (bad.length) return { data: null, error: { code: '42703', message: `column schools.${bad[0]} does not exist` } };
          }
          return { data: rows[table], error: null };
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe('getLicitacionDetail', () => {
  it('selects only existing schools columns and returns the school', async () => {
    const selects: Record<string, string> = {};
    const detail = await getLicitacionDetail(makeClient(selects), 'lic-1');
    expect(selects.schools).not.toMatch(/\bcode\b/);
    expect(detail.school).toMatchObject({ id: 1, name: 'Colegio Test' });
    expect(detail.cliente).toMatchObject({ id: 'cli-1' });
  });
});
