/**
 * Learning-path REPORT scope from a person's role rows (W-B2c-01 reporting
 * scope, Brent 2026-10-02). Shared by the API door
 * (LearningPathsService.getReportScope) and the reports page, so the page
 * offers the learning-path tab exactly to the people the API answers:
 *   'all'    — an ACTIVE admin or consultor row (every school; wins over any other role)
 *   'school' — an ACTIVE equipo_directivo row WITH a school_id (their school's people)
 *   null     — anyone else (including a director whose role has no school).
 * Which rows a reporter then sees is decided by the report views themselves.
 */
export type LearningPathReportScope = 'all' | 'school' | null;

export interface ReportScopeRoleRow {
  role_type?: string | null;
  school_id?: number | string | null;
  is_active?: boolean | null;
}

export function learningPathReportScope(rows: ReadonlyArray<ReportScopeRoleRow | null | undefined> | null | undefined): LearningPathReportScope {
  if (!Array.isArray(rows)) return null;
  const active = rows.filter((r): r is ReportScopeRoleRow => !!r && r.is_active === true);
  if (active.some((r) => r.role_type === 'admin' || r.role_type === 'consultor')) return 'all';
  if (active.some((r) => r.role_type === 'equipo_directivo' && r.school_id !== null && r.school_id !== undefined)) return 'school';
  return null;
}
