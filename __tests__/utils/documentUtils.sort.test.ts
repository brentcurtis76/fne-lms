import { beforeEach, describe, expect, it, vi } from 'vitest';

// A chainable stand-in for the Supabase query builder: records every call and
// resolves to an empty result when awaited.
type Call = { table: string; method: string; args: unknown[] };
const calls: Call[] = [];

function builder(table: string) {
  const result = { data: [], error: null, count: 0 };
  const target: Record<string, unknown> = {};
  const proxy: any = new Proxy(target, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject);
      }
      return (...args: unknown[]) => {
        calls.push({ table, method: prop, args });
        return proxy;
      };
    },
  });
  return proxy;
}

vi.mock('../../lib/supabase-wrapper', () => ({
  supabase: { from: (table: string) => builder(table) },
}));
vi.mock('../../utils/workspaceUtils', () => ({ getUserWorkspaceAccess: vi.fn() }));

import { getWorkspaceDocuments } from '../../utils/documentUtils';

// The columns community_documents really has (baseline.sql, CREATE TABLE community_documents).
const COLUMNS = new Set(['created_at', 'title', 'file_size', 'download_count', 'view_count']);

function documentOrders() {
  return calls.filter(c => c.table === 'community_documents' && c.method === 'order');
}

describe('getWorkspaceDocuments sorting (EC-D1)', () => {
  beforeEach(() => { calls.length = 0; });

  it.each([
    ['created_at', 'created_at'],
    ['name', 'title'],
    ['size', 'file_size'],
    ['downloads', 'download_count'],
    ['views', 'view_count'],
  ] as const)('sort_by %s orders by the existing column %s', async (sortBy, column) => {
    await getWorkspaceDocuments('ws-1', null, { sort_by: sortBy, sort_order: 'asc' });
    const orders = documentOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].args[0]).toBe(column);
    expect(COLUMNS.has(orders[0].args[0] as string)).toBe(true);
    expect(orders[0].args[1]).toEqual({ ascending: true });
  });

  it('defaults to newest first', async () => {
    await getWorkspaceDocuments('ws-1', null, {});
    expect(documentOrders()[0].args).toEqual(['created_at', { ascending: false }]);
  });

  it('any other value falls back to created_at', async () => {
    await getWorkspaceDocuments('ws-1', null, { sort_by: 'date' as any });
    expect(documentOrders()[0].args[0]).toBe('created_at');
    calls.length = 0;
    await getWorkspaceDocuments('ws-1', null, { sort_by: 'title; drop' as any });
    expect(documentOrders()[0].args[0]).toBe('created_at');
  });

  it('keeps search, tags and the folder filter', async () => {
    await getWorkspaceDocuments('ws-1', 'folder-1', { search: 'acta', tags: ['t1'], sort_by: 'name' });
    const doc = calls.filter(c => c.table === 'community_documents');
    expect(doc).toContainEqual({ table: 'community_documents', method: 'eq', args: ['folder_id', 'folder-1'] });
    expect(doc.some(c => c.method === 'or' && String(c.args[0]).includes('title.ilike.%acta%'))).toBe(true);
    expect(doc).toContainEqual({ table: 'community_documents', method: 'overlaps', args: ['tags', ['t1']] });
  });
});
