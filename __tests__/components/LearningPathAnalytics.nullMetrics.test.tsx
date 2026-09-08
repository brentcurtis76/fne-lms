// @vitest-environment jsdom
/**
 * C-R1-04 (closure review 2026-09-08): components/reports/LearningPathAnalytics.tsx
 * consumes the C3 analytics contract (docs/reviews/rls-learning-path-reporting-
 * contract-2026-09-07.md), in which `summary.averageCompletionRate` and every
 * per-path `completionRate` are NULL when no population is assigned, and the
 * engagement / at-risk metrics are always null (no governing definition).
 *
 *   * empty population: renders an explicit Spanish unavailable/empty state — the
 *     first run of this file (before the fix) is the fail-before proof: TypeError
 *     "Cannot read properties of null (reading 'toFixed')";
 *   * a valid zero is rendered as 0.0 %, not as "unavailable";
 *   * populated data renders the rate and the chart with the completion series only
 *     (the undefined engagement metric is never drawn as a series);
 *   * unrated paths are listed as "sin población asignada", not charted as 0;
 *   * API failure (502 relation error), denial (403) and a network error each
 *     produce a distinct, coherent Spanish state.
 *
 * recharts is stubbed (jsdom has no layout); fetch is a mock.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Bar = ({ dataKey, name }: { dataKey: string; name?: string }) => <div data-testid="chart-series" data-key={dataKey}>{name}</div>;
  const Line = Bar;
  return { ResponsiveContainer: Box, BarChart: Box, LineChart: Box, PieChart: Box, CartesianGrid: Box, XAxis: Box, YAxis: Box, Tooltip: Box, Legend: Box, Pie: Box, Cell: Box, Bar, Line };
});

import LearningPathAnalytics from '../../components/reports/LearningPathAnalytics';

const EMPTY_OVERVIEW = {
  summary: { totalPaths: 0, totalAssignedUsers: 0, totalCompletedUsers: 0, averageCompletionRate: null, totalTimeSpentHours: 0 },
  recentActivity: { timeframe: '30 days', totalSessions: 0, activeUserDays: 0 },
  completionTrends: [],
  pathPerformance: [],
  lowPerformingPaths: [],
  unavailable: ['engagementScore', 'atRiskUsers', 'completionRate(daily)', 'avgCompletionRate(monthly)'],
};

const PATH = (over: Record<string, unknown>) => ({
  pathId: 'p1', pathName: 'Ruta A', completionRate: 42.5, avgCompletionTimeDays: 3.2, totalUsers: 4, completedUsers: 2, inProgressUsers: 1,
  engagementScore: null, recentEnrollments: 1, recentCompletions: 1, recentSessionTimeHours: 2.5, ...over,
});

function respond(status: number, body: unknown) {
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('nullable metrics under the C3 contract', () => {
  it('empty population: no crash, explicit Spanish empty + unavailable state, no chart', async () => {
    respond(200, EMPTY_OVERVIEW);
    render(<LearningPathAnalytics dateRange={30} />);
    expect(await screen.findByTestId('lp-analytics-summary')).toBeInTheDocument();
    expect(screen.getByTestId('lp-analytics-avg-rate')).toHaveTextContent('No disponible');
    expect(screen.getByTestId('lp-analytics-empty')).toHaveTextContent(/sin rutas de aprendizaje/i);
    expect(screen.queryByTestId('lp-analytics-performance-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lp-analytics-error')).not.toBeInTheDocument();
  });

  it('paths exist but none has an assigned population: rate unavailable with the reason, paths listed as unrated', async () => {
    respond(200, { ...EMPTY_OVERVIEW, summary: { ...EMPTY_OVERVIEW.summary, totalPaths: 2 }, pathPerformance: [PATH({ completionRate: null, totalUsers: 0 }), PATH({ pathId: 'p2', pathName: 'Ruta B', completionRate: null, totalUsers: 0 })] });
    render(<LearningPathAnalytics dateRange={30} />);
    expect(await screen.findByTestId('lp-analytics-avg-rate')).toHaveTextContent('No disponible');
    expect(screen.getByTestId('lp-analytics-empty')).toHaveTextContent(/ninguna ruta tiene usuarios asignados/i);
    expect(screen.queryByTestId('lp-analytics-performance-chart')).not.toBeInTheDocument();
    const unrated = screen.getByTestId('lp-analytics-unrated');
    expect(unrated).toHaveTextContent('Ruta A');
    expect(unrated).toHaveTextContent('Ruta B');
    expect(unrated).toHaveTextContent(/sin población asignada/i);
  });

  it('a valid zero is 0.0 %, never "unavailable"', async () => {
    respond(200, { ...EMPTY_OVERVIEW, summary: { ...EMPTY_OVERVIEW.summary, totalPaths: 1, totalAssignedUsers: 3, averageCompletionRate: 0 }, pathPerformance: [PATH({ completionRate: 0, completedUsers: 0 })], lowPerformingPaths: [PATH({ completionRate: 0, completedUsers: 0 })] });
    render(<LearningPathAnalytics dateRange={30} />);
    expect(await screen.findByTestId('lp-analytics-avg-rate')).toHaveTextContent('0.0%');
    expect(screen.queryByTestId('lp-analytics-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('lp-analytics-performance-chart')).toBeInTheDocument();
  });

  it('populated data: rate, chart with the completion series only, undefined metrics named as unavailable', async () => {
    respond(200, {
      ...EMPTY_OVERVIEW,
      summary: { totalPaths: 2, totalAssignedUsers: 7, totalCompletedUsers: 3, averageCompletionRate: 42.5, totalTimeSpentHours: 12.25 },
      completionTrends: [{ date: '2026-09-01', completions: 1, enrollments: 2 }],
      pathPerformance: [PATH({}), PATH({ pathId: 'p2', pathName: 'Ruta B', completionRate: null, totalUsers: 0 })],
      lowPerformingPaths: [],
    });
    render(<LearningPathAnalytics dateRange={30} />);
    expect(await screen.findByTestId('lp-analytics-avg-rate')).toHaveTextContent('42.5%');
    expect(screen.getByTestId('lp-analytics-total-hours')).toHaveTextContent('12.3h');
    const series = screen.getAllByTestId('chart-series').map((n) => n.getAttribute('data-key'));
    expect(series).toContain('completionRate');
    expect(series).not.toContain('engagementScore');
    expect(screen.getByTestId('lp-analytics-unavailable-note')).toHaveTextContent(/engagement/i);
    expect(screen.getByTestId('lp-analytics-unrated')).toHaveTextContent('Ruta B');
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('the low-performing list renders the rate of each entry', async () => {
    respond(200, { ...EMPTY_OVERVIEW, summary: { ...EMPTY_OVERVIEW.summary, totalPaths: 1, totalAssignedUsers: 5, averageCompletionRate: 20 }, pathPerformance: [PATH({ completionRate: 20 })], lowPerformingPaths: [PATH({ completionRate: 20 })] });
    render(<LearningPathAnalytics dateRange={30} />);
    expect(await screen.findByTestId('lp-analytics-low-performing')).toHaveTextContent('20.0%');
  });
});

describe('failure and denial states are distinct', () => {
  it('502 (a failed view query) is an explicit "temporalmente no disponibles" state naming the relation', async () => {
    respond(502, { error: 'Learning path analytics are temporarily unavailable', relation: 'learning_path_performance_summary' });
    render(<LearningPathAnalytics dateRange={30} />);
    const err = await screen.findByTestId('lp-analytics-error');
    expect(err).toHaveTextContent(/temporalmente no disponibles/i);
    expect(err).toHaveTextContent('learning_path_performance_summary');
    expect(screen.queryByTestId('lp-analytics-summary')).not.toBeInTheDocument();
  });

  it('403 is a denial state, not a data error', async () => {
    respond(403, { error: 'You do not have permission to view analytics' });
    render(<LearningPathAnalytics dateRange={30} />);
    expect(await screen.findByTestId('lp-analytics-denied')).toHaveTextContent(/solo para administradores/i);
    expect(screen.queryByTestId('lp-analytics-error')).not.toBeInTheDocument();
  });

  it('a network failure is a generic Spanish error', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed to fetch'));
    render(<LearningPathAnalytics dateRange={30} />);
    expect(await screen.findByTestId('lp-analytics-error')).toHaveTextContent(/error al cargar/i);
  });

  it('a 200 whose body is not the contract is an error, not a silent blank', async () => {
    respond(200, { unexpected: true });
    render(<LearningPathAnalytics dateRange={30} />);
    expect(await screen.findByTestId('lp-analytics-error')).toBeInTheDocument();
  });
});
