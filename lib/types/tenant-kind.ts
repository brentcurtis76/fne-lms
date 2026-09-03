/**
 * Tenant classification of a `schools` row (FNE Zoom internal test plan §2).
 *
 * The database is the only authority: `schools.tenant_kind` (CHECK-constrained to the three
 * literals below) and `schools.internal_zoom_testing_enabled`. Nothing here infers a tenant
 * from a name, an id, an e-mail domain, a title, a missing contract or an environment
 * variable, and nothing here writes either column — browsers never do, and the Unit A
 * authority trigger refuses application writes to them regardless.
 *
 * Every helper is fail-closed: a value that is not one of the three literals, or a row that
 * does not carry exactly the expected shape, is treated as "not a known tenant" and the
 * caller must refuse.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const TENANT_KINDS = ['client', 'operator', 'qa'] as const;

export type TenantKind = (typeof TENANT_KINDS)[number];

/** Narrows an unknown runtime value to a `TenantKind`; anything else is false. */
export function isTenantKind(value: unknown): value is TenantKind {
  return typeof value === 'string' && (TENANT_KINDS as readonly string[]).includes(value);
}

/** `null` for any value that is not exactly one of the three literals — never a default. */
export function parseTenantKind(value: unknown): TenantKind | null {
  return isTenantKind(value) ? value : null;
}

/** FNE operating Genera against itself. Non-billable; never carries financial fields. */
export function isOperatorTenant(kind: TenantKind): boolean {
  return kind === 'operator';
}

/** Real client-school delivery — the only kind that belongs in official reporting. */
export function isClientTenant(kind: TenantKind): boolean {
  return kind === 'client';
}

/** Operator or QA: excluded from official reporting, still visible to operations. */
export function isNonClientTenant(kind: TenantKind): boolean {
  return !isClientTenant(kind);
}

/**
 * The three authoritative columns, exactly as the server reads them. This is an
 * application-owned type rather than a generated `Database` row on purpose: the generated
 * `types/supabase.ts` predates Unit A and regenerating it is a separate decision.
 */
export interface SchoolTenantControls {
  id: number;
  tenant_kind: TenantKind;
  internal_zoom_testing_enabled: boolean;
}

/** The exact projection the reader selects. Nothing more leaves the database. */
export const SCHOOL_TENANT_CONTROLS_SELECT = 'id, tenant_kind, internal_zoom_testing_enabled';

export type SchoolTenantControlsLookup =
  | { status: 'found'; school: SchoolTenantControls }
  | { status: 'not_found' }
  | { status: 'invalid_tenant_kind' }
  | { status: 'invalid_row' }
  | { status: 'error'; message: string };

/**
 * Validates a raw row against `SchoolTenantControls`. The `expectedId` guard exists so a
 * caller can never accept a row for a different school than the one it asked for — a
 * fixture, a lenient mock or a widened query all fail closed here.
 */
export function parseSchoolTenantControls(
  row: unknown,
  expectedId: number
): SchoolTenantControlsLookup {
  if (row === null || row === undefined) return { status: 'not_found' };
  if (typeof row !== 'object' || Array.isArray(row)) return { status: 'invalid_row' };

  const candidate = row as Record<string, unknown>;
  if (candidate.id !== expectedId) return { status: 'invalid_row' };
  if (typeof candidate.internal_zoom_testing_enabled !== 'boolean') {
    return { status: 'invalid_row' };
  }

  const tenantKind = parseTenantKind(candidate.tenant_kind);
  if (tenantKind === null) return { status: 'invalid_tenant_kind' };

  return {
    status: 'found',
    school: {
      id: expectedId,
      tenant_kind: tenantKind,
      internal_zoom_testing_enabled: candidate.internal_zoom_testing_enabled,
    },
  };
}

/**
 * Reads exactly one school's tenant controls with the server/service client.
 *
 * Selects only the three columns, filters on the exact id, and never throws: a database
 * error, a missing row, a duplicate row, or a malformed row all come back as a non-`found`
 * status the caller must refuse on.
 */
export async function readSchoolTenantControls(
  serviceClient: SupabaseClient,
  schoolId: number
): Promise<SchoolTenantControlsLookup> {
  try {
    const { data, error } = await serviceClient
      .from('schools')
      .select(SCHOOL_TENANT_CONTROLS_SELECT)
      .eq('id', schoolId)
      .maybeSingle();

    if (error) return { status: 'error', message: error.message ?? 'school lookup failed' };
    return parseSchoolTenantControls(data, schoolId);
  } catch (error: any) {
    return { status: 'error', message: error?.message ?? 'school lookup threw' };
  }
}
