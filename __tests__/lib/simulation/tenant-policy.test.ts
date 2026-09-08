import { describe, expect, it } from 'vitest';
import {
  readClientReportingScope,
  readClientSchoolScope,
  resolveSchoolProviderDisposition,
} from '../../../lib/simulation/tenant-policy';

function schoolClient(rows: any[], error: any = null): any {
  return {
    from() {
      return {
        select() {
          return {
            order: async () => ({ data: rows, error }),
            eq(_column: string, id: number) {
              return {
                maybeSingle: async () => ({
                  data: rows.find((row) => row.id === id) ?? null,
                  error,
                }),
              };
            },
          };
        },
      };
    },
  };
}

function reportingClient(schools: any[], profiles: any[]): any {
  return {
    from(table: string) {
      if (table === 'schools') {
        return {
          select: () => ({ order: async () => ({ data: schools, error: null }) }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({ in: async () => ({ data: profiles, error: null }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('QA tenant policy', () => {
  it('suppresses allowlisted QA tenants and allows client/operator tenants', async () => {
    const client = schoolClient([
      { id: 257, tenant_kind: 'qa', internal_zoom_testing_enabled: false },
      { id: 1, tenant_kind: 'client', internal_zoom_testing_enabled: false },
      { id: 2, tenant_kind: 'operator', internal_zoom_testing_enabled: true },
    ]);
    await expect(resolveSchoolProviderDisposition(client, 257)).resolves.toMatchObject({
      kind: 'suppressed_qa',
      schoolId: 257,
    });
    await expect(resolveSchoolProviderDisposition(client, 1)).resolves.toMatchObject({
      kind: 'allow',
      tenantKind: 'client',
    });
    await expect(resolveSchoolProviderDisposition(client, 2)).resolves.toMatchObject({
      kind: 'allow',
      tenantKind: 'operator',
    });
  });

  it('refuses an unexpected QA school and every lookup failure', async () => {
    await expect(
      resolveSchoolProviderDisposition(
        schoolClient([{ id: 300, tenant_kind: 'qa', internal_zoom_testing_enabled: false }]),
        300
      )
    ).resolves.toMatchObject({ kind: 'refuse', reason: 'qa_school_not_allowlisted' });
    await expect(resolveSchoolProviderDisposition(schoolClient([], { message: 'down' }), 257))
      .resolves.toMatchObject({ kind: 'refuse', reason: 'school_lookup_failed' });
  });

  it('returns only client schools for official reporting and fails on malformed rows', async () => {
    const scope = await readClientSchoolScope(
      schoolClient([
        { id: 1, tenant_kind: 'client' },
        { id: 257, tenant_kind: 'qa' },
        { id: 7, tenant_kind: 'operator' },
      ])
    );
    expect(scope.ids).toEqual([1]);
    expect(scope.isClientSchool(1)).toBe(true);
    expect(scope.isClientSchool(257)).toBe(false);
    await expect(readClientSchoolScope(schoolClient([{ id: 1, tenant_kind: 'unknown' }])))
      .rejects.toThrow(/invalid row/);
  });

  it('intersects official reporting users and schools with the client universe', async () => {
    const scope = await readClientReportingScope(
      reportingClient(
        [
          { id: 1, tenant_kind: 'client' },
          { id: 257, tenant_kind: 'qa' },
        ],
        [{ id: 'client-user', school_id: 1 }]
      )
    );
    expect(scope.filterSchoolIds([1, 257])).toEqual([1]);
    expect(scope.filterUserIds(['client-user', 'qa-user'])).toEqual(['client-user']);
    expect(scope.isClientUser('qa-user')).toBe(false);
  });
});
