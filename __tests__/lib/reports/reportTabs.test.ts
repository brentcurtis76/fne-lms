// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { initialReportTab, REPORT_TAB_IDS } from '../../../lib/reports/reportTabs';

describe('reports page tab from the address', () => {
  it('opens the learning-path tab from ?tab=learning-paths', () => {
    expect(initialReportTab('learning-paths')).toBe('learning-paths');
    expect(initialReportTab(['learning-paths', 'courses'])).toBe('learning-paths');
  });

  it('opens the overview for a missing or unknown tab', () => {
    expect(initialReportTab(undefined)).toBe('overview');
    expect(initialReportTab('')).toBe('overview');
    expect(initialReportTab('admin')).toBe('overview');
    expect(initialReportTab([])).toBe('overview');
  });

  it('every known tab round-trips', () => {
    for (const id of REPORT_TAB_IDS) expect(initialReportTab(id)).toBe(id);
  });
});
