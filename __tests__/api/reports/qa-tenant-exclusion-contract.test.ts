import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readClientReportingScope } from '../../../lib/simulation/tenant-policy';

const OFFICIAL_ROUTE_FILES = [
  'pages/api/reports/filter-options.ts',
  'pages/api/admin/transformation-assessments.ts',
  'pages/api/sessions/reports/analytics.ts',
  'pages/api/sessions/stats.ts',
  'pages/api/dashboard/unified.ts',
  'pages/api/dashboard/stats.ts',
  'pages/api/reports/analytics-data.ts',
  'pages/api/reports/community.ts',
  'pages/api/reports/course-analytics.ts',
  'pages/api/reports/detailed.ts',
  'pages/api/reports/overview.ts',
  'pages/api/reports/school.ts',
  'pages/api/reports/user-details.ts',
] as const;

const CURRENT_ROLES = [
  'admin',
  'consultor',
  'equipo_directivo',
  'lider_generacion',
  'lider_comunidad',
  'supervisor_de_red',
  'community_manager',
  'docente',
  'encargado_licitacion',
] as const;

function reportingClient(): any {
  return {
    from(table: string) {
      if (table === 'schools') {
        return {
          select: () => ({
            order: async () => ({
              data: [
                { id: 1, tenant_kind: 'client' },
                { id: 257, tenant_kind: 'qa' },
                { id: 19, tenant_kind: 'operator' },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: async () => ({ data: [{ id: 'client-user', school_id: 1 }], error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('official reporting QA exclusion contract', () => {
  it.each(OFFICIAL_ROUTE_FILES)('%s resolves a client-only server-side scope', (file) => {
    const source = readFileSync(resolve(__dirname, '../../..', file), 'utf8');
    expect(source).toMatch(/readClient(?:School|Reporting)Scope/);
  });

  it.each(CURRENT_ROLES)('%s cannot reintroduce QA/operator schools or users', async () => {
    const scope = await readClientReportingScope(reportingClient());
    const roleScopedSchools = [1, 19, 257];
    const roleScopedUsers = ['client-user', 'operator-user', 'qa-user'];

    expect(scope.filterSchoolIds(roleScopedSchools)).toEqual([1]);
    expect(scope.filterUserIds(roleScopedUsers)).toEqual(['client-user']);
  });
});
