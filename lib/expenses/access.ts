// GES-1.3 (F7d): who files expense reports (Rendición de Gastos) is decided by
// role — an active admin, consultor or community_manager. The old one-by-one
// switch (expense_report_access.can_submit) no longer counts. The database's
// public.auth_can_file_expenses() holds the same rule.

const FILING_ROLES: ReadonlySet<string> = new Set(['admin', 'consultor', 'community_manager']);

/** True when the person's ACTIVE role types include a role that files expenses. */
export function canFileExpenses(roleTypes: string[]): boolean {
  return roleTypes.some((role) => FILING_ROLES.has(role));
}
