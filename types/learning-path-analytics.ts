/**
 * The learning-path analytics contract shared by the API
 * (pages/api/learning-paths/analytics.ts) and its UI consumer
 * (components/reports/LearningPathAnalytics.tsx). Audience and figures:
 * W-B2c-01 reporting scope (Brent 2026-10-02) — admin and consultor see every
 * school, equipo_directivo their own school's people; the report views
 * (migration 20261002120000) decide which rows a caller sees.
 *
 * C-R1-04 (closure review 2026-09-08): the contract is NULLABLE where the
 * source views are — a rate over an empty population is `null` (not 0). A
 * consumer must render `null` as an explicit "no disponible" state. Valid zeros
 * are numbers and are rendered as such.
 *
 * Figures: completion = finished every course of the path (not the
 * self-reported path completion); at risk = assigned, not finished, no activity
 * for 14 days. The learning-path engagement score is retired (not in the
 * contract).
 */

export interface LearningPathAnalyticsSummary {
  totalPaths: number;
  totalAssignedUsers: number;
  totalCompletedUsers: number;
  /** Mean of the per-path rates over paths with an assigned population; null when none has one. */
  averageCompletionRate: number | null;
  totalTimeSpentHours: number;
  /** Assigned, not finished, no activity for 14 days (sum over the visible paths). */
  atRiskUsers: number;
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
  atRiskUsers: number;
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
    atRiskUsers: number;
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
    /** Assigned, not finished, no activity for 14 days. */
    atRiskUsers: number;
    avgProgressPercentage: number | null;
  };
  activityHeatmap: Record<string, { sessions: number; activeUsers: number; timeSpent: number }>;
  recentActivity: { totalDays: number; totalSessions: number; activeUserDays: number; timeframe: string };
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
    isNumber(s.atRiskUsers) &&
    Array.isArray(b.pathPerformance) &&
    Array.isArray(b.completionTrends) &&
    Array.isArray(b.lowPerformingPaths)
  );
}

export function isPathSpecificAnalytics(body: unknown): body is PathSpecificAnalytics {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  const p = b.pathInfo as Record<string, unknown> | undefined;
  return !!p && typeof p.pathId === 'string' && isNullableNumber(p.completionRate) && Array.isArray(b.courseProgression);
}
