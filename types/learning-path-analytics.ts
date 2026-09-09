/**
 * The learning-path analytics contract shared by the API
 * (pages/api/learning-paths/analytics.ts) and its UI consumer
 * (components/reports/LearningPathAnalytics.tsx) — closure C3, decision D2,
 * docs/reviews/rls-learning-path-reporting-contract-2026-09-07.md.
 *
 * C-R1-04 (closure review 2026-09-08): the contract is NULLABLE where the
 * source views are — a rate over an empty population is `null` (not 0), and a
 * metric with no governing definition is ALWAYS `null` and listed under
 * `unavailable`. A consumer must render `null` as an explicit "no disponible"
 * state and must never draw an undefined metric as a series. Valid zeros are
 * numbers and are rendered as such.
 */

export const UNAVAILABLE_METRICS = [
  'engagementScore',
  'atRiskUsers',
  'completionRate(daily)',
  'avgCompletionRate(monthly)',
] as const;
export type UnavailableMetric = (typeof UNAVAILABLE_METRICS)[number];

/** Spanish labels for the unavailable metrics (UI only). */
export const UNAVAILABLE_METRIC_LABELS: Record<UnavailableMetric, string> = {
  engagementScore: 'puntuación de engagement',
  atRiskUsers: 'usuarios en riesgo',
  'completionRate(daily)': 'tasa de completación diaria',
  'avgCompletionRate(monthly)': 'tasa de completación mensual promedio',
};

export interface LearningPathAnalyticsSummary {
  totalPaths: number;
  totalAssignedUsers: number;
  totalCompletedUsers: number;
  /** Mean of the per-path rates over paths with an assigned population; null when none has one. */
  averageCompletionRate: number | null;
  totalTimeSpentHours: number;
}

export interface PathPerformanceEntry {
  pathId: string;
  pathName: string;
  /** null when the path has no assigned population. */
  completionRate: number | null;
  /** null when nobody completed the path. */
  avgCompletionTimeDays: number | null;
  totalUsers: number;
  completedUsers: number;
  inProgressUsers: number;
  /** Always null: no governing definition (see UNAVAILABLE_METRICS). */
  engagementScore: null;
  recentEnrollments: number;
  recentCompletions: number;
  recentSessionTimeHours: number;
}

export interface CompletionTrendPoint {
  date: string;
  completions: number;
  enrollments: number;
}

export interface LearningPathAnalyticsOverview {
  summary: LearningPathAnalyticsSummary;
  recentActivity: { timeframe: string; totalSessions: number; activeUserDays: number };
  completionTrends: CompletionTrendPoint[];
  pathPerformance: PathPerformanceEntry[];
  /** Paths whose (non-null) completion rate is below 40 %. */
  lowPerformingPaths: PathPerformanceEntry[];
  unavailable: UnavailableMetric[];
}

export interface CourseProgressionEntry {
  courseId: string;
  courseName: string | null;
  sequenceOrder: number;
  usersReached: number;
  /** null when the path has no assigned population. */
  dropoffRate: number | null;
  /** null when the path has no assigned population. */
  reachRate: number | null;
}

export interface PathSpecificAnalytics {
  pathInfo: {
    pathId: string;
    pathName: string;
    description: string | null;
    totalAssignedUsers: number;
    completedUsers: number;
    completionRate: number | null;
    avgCompletionTimeDays: number | null;
    engagementScore: null;
    recentEnrollments: number;
    recentCompletions: number;
  };
  courseProgression: CourseProgressionEntry[];
  timeAnalytics: {
    avgCompletionTimeMinutes: number | null;
    avgCompletionTimeHours: number | null;
    totalTimeSpentHours: number;
  };
  userAnalytics: {
    totalUsers: number;
    completedUsers: number;
    inProgressUsers: number;
    notStartedUsers: number;
    /** Always null: no governing definition. */
    atRiskUsers: null;
    avgProgressPercentage: number | null;
  };
  activityHeatmap: Record<string, { sessions: number; activeUsers: number; timeSpent: number }>;
  recentActivity: { totalDays: number; totalSessions: number; activeUserDays: number; timeframe: string };
  unavailable: UnavailableMetric[];
}

export type LearningPathAnalyticsResponse = LearningPathAnalyticsOverview | PathSpecificAnalytics;

/** The 502 body the API returns when a view query fails (never a silent zero). */
export interface LearningPathAnalyticsUnavailable {
  error: string;
  relation: string;
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isNullableNumber(v: unknown): v is number | null {
  return v === null || isNumber(v);
}

/** Structural check a UI consumer runs on a 200 body before trusting it. */
export function isOverviewAnalytics(body: unknown): body is LearningPathAnalyticsOverview {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  const s = b.summary as Record<string, unknown> | undefined;
  return (
    !!s &&
    isNumber(s.totalPaths) &&
    isNumber(s.totalAssignedUsers) &&
    isNumber(s.totalCompletedUsers) &&
    isNullableNumber(s.averageCompletionRate) &&
    isNumber(s.totalTimeSpentHours) &&
    Array.isArray(b.pathPerformance) &&
    Array.isArray(b.completionTrends) &&
    Array.isArray(b.lowPerformingPaths) &&
    Array.isArray(b.unavailable)
  );
}

export function isPathSpecificAnalytics(body: unknown): body is PathSpecificAnalytics {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  const p = b.pathInfo as Record<string, unknown> | undefined;
  return !!p && typeof p.pathId === 'string' && isNullableNumber(p.completionRate) && Array.isArray(b.courseProgression) && Array.isArray(b.unavailable);
}
