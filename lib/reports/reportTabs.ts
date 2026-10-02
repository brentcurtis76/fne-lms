/** Tabs of pages/reports.tsx, in display order. */
export const REPORT_TAB_IDS = ['overview', 'analytics', 'learning-paths', 'community', 'school', 'courses'] as const;
export type ReportTabId = (typeof REPORT_TAB_IDS)[number];

/** The tab a link such as /reports?tab=learning-paths opens; anything unknown opens the overview. */
export function initialReportTab(tab: string | string[] | undefined): ReportTabId {
  const value = Array.isArray(tab) ? tab[0] : tab;
  return (REPORT_TAB_IDS as readonly string[]).includes(value ?? '') ? (value as ReportTabId) : 'overview';
}
