import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isClientTenant,
  isOperatorTenant,
  parseTenantKind,
  readSchoolTenantControls,
  type TenantKind,
} from '../types/tenant-kind';
import {
  isQaSimulationSchoolId,
  QA_SIMULATION_LABEL,
} from './constants';

export type TenantProviderDisposition =
  | { kind: 'allow'; tenantKind: Exclude<TenantKind, 'qa'>; schoolId: number }
  | { kind: 'suppressed_qa'; tenantKind: 'qa'; schoolId: number; label: string }
  | {
      kind: 'refuse';
      reason: 'invalid_school_id' | 'school_lookup_failed' | 'qa_school_not_allowlisted';
      schoolId: number | null;
    };

export async function resolveSchoolProviderDisposition(
  client: SupabaseClient,
  schoolId: unknown
): Promise<TenantProviderDisposition> {
  if (typeof schoolId !== 'number' || !Number.isSafeInteger(schoolId) || schoolId <= 0) {
    return { kind: 'refuse', reason: 'invalid_school_id', schoolId: null };
  }

  const lookup = await readSchoolTenantControls(client, schoolId);
  if (lookup.status !== 'found') {
    return { kind: 'refuse', reason: 'school_lookup_failed', schoolId };
  }

  if (lookup.school.tenant_kind === 'qa') {
    if (!isQaSimulationSchoolId(schoolId)) {
      return { kind: 'refuse', reason: 'qa_school_not_allowlisted', schoolId };
    }
    return {
      kind: 'suppressed_qa',
      tenantKind: 'qa',
      schoolId,
      label: QA_SIMULATION_LABEL,
    };
  }

  return {
    kind: 'allow',
    tenantKind: lookup.school.tenant_kind,
    schoolId,
  };
}

export interface ClientSchoolScope {
  ids: number[];
  isClientSchool(schoolId: unknown): boolean;
}

export interface ClientReportingScope extends ClientSchoolScope {
  userIds: string[];
  isClientUser(userId: unknown): boolean;
  filterSchoolIds(values: unknown[]): number[];
  filterUserIds(values: unknown[]): string[];
}

/**
 * Resolve the complete official-reporting scope. Unknown or malformed tenant rows make
 * the whole lookup fail: silently omitting a row would make a partial report look final.
 */
export async function readClientSchoolScope(client: SupabaseClient): Promise<ClientSchoolScope> {
  const { data, error } = await client
    .from('schools')
    .select('id, tenant_kind')
    .order('id');

  if (error || !Array.isArray(data)) {
    throw new Error('client school scope unavailable');
  }

  const ids: number[] = [];
  for (const row of data) {
    const id = Number((row as Record<string, unknown>)?.id);
    const kind = parseTenantKind((row as Record<string, unknown>)?.tenant_kind);
    if (!Number.isSafeInteger(id) || id <= 0 || kind === null) {
      throw new Error('client school scope contains an invalid row');
    }
    if (isClientTenant(kind)) ids.push(id);
  }

  const allowed = new Set(ids);
  return {
    ids,
    isClientSchool(schoolId: unknown) {
      const parsed = Number(schoolId);
      return Number.isSafeInteger(parsed) && allowed.has(parsed);
    },
  };
}

/**
 * Official reports are defined over profiles assigned to client schools. Operations
 * surfaces may deliberately use broader data, but stakeholder reports must opt into this
 * universe and intersect every role-derived scope with it.
 */
export async function readClientReportingScope(
  client: SupabaseClient
): Promise<ClientReportingScope> {
  const schools = await readClientSchoolScope(client);
  if (schools.ids.length === 0) {
    return {
      ...schools,
      userIds: [],
      isClientUser: () => false,
      filterSchoolIds: () => [],
      filterUserIds: () => [],
    };
  }

  const { data, error } = await client
    .from('profiles')
    .select('id, school_id')
    .in('school_id', schools.ids);
  if (error || !Array.isArray(data)) throw new Error('client reporting users unavailable');

  const userIds = data
    .map((row) => (typeof row?.id === 'string' ? row.id : null))
    .filter((id): id is string => id !== null);
  const users = new Set(userIds);

  return {
    ...schools,
    userIds,
    isClientUser(userId: unknown) {
      return typeof userId === 'string' && users.has(userId);
    },
    filterSchoolIds(values: unknown[]) {
      return values
        .map((value) => Number(value))
        .filter((value) => Number.isSafeInteger(value) && schools.isClientSchool(value));
    },
    filterUserIds(values: unknown[]) {
      return values.filter((value): value is string => typeof value === 'string' && users.has(value));
    },
  };
}

export function tenantKindMayReceiveEmail(kind: TenantKind): boolean {
  return isClientTenant(kind) || isOperatorTenant(kind);
}
