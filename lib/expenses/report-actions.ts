// F7e send-back 1 (GENERA fixes): who may edit and delete an expense report,
// the same rule the database holds (expense_reports_guard and the row rules of
// supabase/migrations/20261117166000_expenses_by_role.sql):
//   - its author, admin or not: only while it is a draft or rejected;
//   - an admin who is not its author: in any status;
//   - anyone else: neither.

export interface ExpenseReportActions {
  canEdit: boolean;
  canDelete: boolean;
}

export function expenseReportActions(
  report: { status: string; submitted_by: string },
  currentUserId: string | null | undefined,
  isAdmin: boolean
): ExpenseReportActions {
  const isAuthor = !!currentUserId && report.submitted_by === currentUserId;
  let allowed: boolean;
  if (isAuthor) {
    allowed = report.status === 'draft' || report.status === 'rejected';
  } else {
    allowed = isAdmin;
  }
  return { canEdit: allowed, canDelete: allowed };
}
