/**
 * Shared test helpers for Assessment Builder API tests.
 * Uses node-mocks-http for handler-level testing.
 */
import { vi } from 'vitest';

// UUIDs matching the seed script
export const ADMIN_UUID = 'ab000001-0000-0000-0000-000000000001';
export const DOCENTE_UUID = 'ab000001-0000-0000-0000-000000000002';
export const DIRECTIVO_UUID = 'ab000001-0000-0000-0000-000000000003';
export const TEMPLATE_DRAFT_1 = 'ab000002-0000-0000-0000-000000000001';
export const TEMPLATE_DRAFT_2 = 'ab000002-0000-0000-0000-000000000002';
export const TEMPLATE_PUBLISHED = 'ab000002-0000-0000-0000-000000000003';
export const OBJECTIVE_A = 'ab000007-0000-0000-0000-000000000001';
export const OBJECTIVE_B = 'ab000007-0000-0000-0000-000000000002';
export const MODULE_A = 'ab000003-0000-0000-0000-000000000001';
export const MODULE_B = 'ab000003-0000-0000-0000-000000000002';
export const IND_COBERTURA_1 = 'ab000004-0000-0000-0000-000000000001';
export const IND_FRECUENCIA_1 = 'ab000004-0000-0000-0000-000000000002';
export const IND_PROFUNDIDAD_1 = 'ab000004-0000-0000-0000-000000000003';
export const SNAPSHOT_ID = 'ab000006-0000-0000-0000-000000000001';
export const INSTANCE_PENDING = 'ab000005-0000-0000-0000-000000000001';
export const INSTANCE_COMPLETED = 'ab000005-0000-0000-0000-000000000002';

/**
 * Build a chainable Supabase query mock that resolves to { data, error, count }.
 * Uses a Proxy to handle arbitrarily deep method chains.
 */
export function buildChainableQuery(
  data: unknown = null,
  error: unknown = null,
  count: number | null = null
) {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => void) =>
          resolve({ data, error, count });
      }
      return vi.fn(() => new Proxy({}, handler));
    },
  };
  return new Proxy({}, handler);
}

/**
 * Build a mock Supabase client that routes table names to specific query results.
 */
export function buildMockSupabaseClient(
  tableHandlers: Record<string, { data?: unknown; error?: unknown; count?: number | null }>
) {
  return {
    from: vi.fn((table: string) => {
      const handler = tableHandlers[table];
      if (handler) {
        return buildChainableQuery(handler.data ?? null, handler.error ?? null, handler.count ?? null);
      }
      return buildChainableQuery(null, null);
    }),
  };
}
