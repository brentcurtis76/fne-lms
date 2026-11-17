import { describe, it, expect } from 'vitest';
import { expenseReportActions } from '../../../lib/expenses/report-actions';

/**
 * F7e send-back 1 (GENERA fixes): who may edit and delete an expense report,
 * as the database now allows it. The author (admin or not) only while it is a
 * draft or rejected; an admin who is not its author in any status; nobody else.
 */

type Status = 'draft' | 'submitted' | 'approved' | 'rejected';
const ME = 'f7e-person-1';
const OTHER = 'f7e-person-2';
const report = (status: Status, by = ME) => ({ status, submitted_by: by });

const table: Array<[string, Status, string, boolean, boolean, boolean]> = [
  // who, status, author, isAdmin, canEdit, canDelete
  ['author', 'draft', ME, false, true, true],
  ['author', 'rejected', ME, false, true, true],
  ['author', 'submitted', ME, false, false, false],
  ['author', 'approved', ME, false, false, false],
  ['admin author', 'draft', ME, true, true, true],
  ['admin author', 'rejected', ME, true, true, true],
  ['admin author', 'submitted', ME, true, false, false],
  ['admin author', 'approved', ME, true, false, false],
  ['admin not author', 'draft', OTHER, true, true, true],
  ['admin not author', 'rejected', OTHER, true, true, true],
  ['admin not author', 'submitted', OTHER, true, true, true],
  ['admin not author', 'approved', OTHER, true, true, true],
  ['neither', 'draft', OTHER, false, false, false],
  ['neither', 'rejected', OTHER, false, false, false],
  ['neither', 'submitted', OTHER, false, false, false],
  ['neither', 'approved', OTHER, false, false, false],
];

describe('F7e send-back 1 expenseReportActions', () => {
  it.each(table)('%s, %s report', (_who, status, by, isAdmin, canEdit, canDelete) => {
    expect(expenseReportActions(report(status, by), ME, isAdmin)).toEqual({ canEdit, canDelete });
  });

  it('nobody signed in may do nothing, even on a draft with no author', () => {
    expect(expenseReportActions(report('draft', ''), undefined, false)).toEqual({ canEdit: false, canDelete: false });
    expect(expenseReportActions(report('draft', ''), null, false)).toEqual({ canEdit: false, canDelete: false });
  });
});
