/**
 * QA Code Coverage API
 *
 * Manages code coverage reports from test runs.
 * GET: Fetch coverage reports with filtering
 * POST: Upload new coverage report
 * DELETE: Remove coverage report
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient, checkIsAdmin } from '@/lib/api-auth';

export interface FileCoverage {
  path: string;
  lines: number;
  statements: number;
  functions: number;
  branches: number;
  uncoveredLines?: number[];
}

export interface CoverageReport {
  id: string;
  report_name: string | null;
  overall_lines: number | null;
  overall_statements: number | null;
  overall_functions: number | null;
  overall_branches: number | null;
  file_coverage: FileCoverage[] | null;
  git_commit: string | null;
  git_branch: string | null;
  test_suite: string | null;
  created_at: string;
  created_by: string | null;
}

export interface CoverageTrendPoint {
  date: string;
  lines: number | null;
  statements: number | null;
  functions: number | null;
  branches: number | null;
}

export interface CoverageStats {
  total_reports: number;
  latest_lines: number | null;
  latest_statements: number | null;
  latest_functions: number | null;
  latest_branches: number | null;
  trend_direction: 'up' | 'down' | 'stable';
  avg_lines: number;
  by_suite: {
    test_suite: string;
    count: number;
    avg_lines: number;
  }[];
}

interface CreateCoverageRequest {
  report_name?: string;
  overall_lines?: number;
  overall_statements?: number;
  overall_functions?: number;
  overall_branches?: number;
  file_coverage?: FileCoverage[];
  git_commit?: string;
  git_branch?: string;
  test_suite?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // All operations require admin
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (authError || !user) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (!isAdmin) {
    return res.status(403).json({ error: 'Solo administradores pueden acceder a datos de cobertura' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, user.id);
    case 'POST':
      return handlePost(req, res, user.id);
    case 'DELETE':
      return handleDelete(req, res, user.id);
    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
      return res.status(405).json({ error: `Método ${req.method} no permitido` });
  }
}

/**
 * GET: Fetch coverage reports
 * Query params:
 *   - period: 'week' | 'month' | 'all'
 *   - branch: Filter by git branch
 *   - suite: Filter by test suite
 *   - trends: If 'true', return trend data
 *   - limit: Number of results
 */
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const supabaseAdmin = createServiceRoleClient();
    const { period = 'month', branch, suite, trends, limit = '50' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = new Date('2020-01-01');
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Build query
    let query = supabaseAdmin
      .from('qa_coverage_reports')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(parseInt(limit as string, 10));

    if (branch && typeof branch === 'string') {
      query = query.eq('git_branch', branch);
    }

    if (suite && typeof suite === 'string') {
      query = query.eq('test_suite', suite);
    }

    const { data: reports, error } = await query;

    if (error) {
      console.error('Error fetching coverage reports:', error);
      return res.status(500).json({ error: 'Error al obtener reportes de cobertura' });
    }

    // If trends requested, aggregate by date
    if (trends === 'true') {
      const trendData = aggregateTrends(reports || []);
      return res.status(200).json({ trends: trendData });
    }

    // Calculate stats
    const stats = calculateStats(reports || []);

    // Get unique branches and suites for filters
    const { data: branches } = await supabaseAdmin
      .from('qa_coverage_reports')
      .select('git_branch')
      .not('git_branch', 'is', null);

    const { data: suites } = await supabaseAdmin
      .from('qa_coverage_reports')
      .select('test_suite')
      .not('test_suite', 'is', null);

    const uniqueBranches = [...new Set((branches || []).map(r => r.git_branch).filter(Boolean))];
    const uniqueSuites = [...new Set((suites || []).map(r => r.test_suite).filter(Boolean))];

    return res.status(200).json({
      reports: reports || [],
      stats,
      branches: uniqueBranches,
      suites: uniqueSuites,
      period,
    });
  } catch (error) {
    console.error('Exception in GET coverage:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST: Upload new coverage report
 */
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const supabaseAdmin = createServiceRoleClient();
    const {
      report_name,
      overall_lines,
      overall_statements,
      overall_functions,
      overall_branches,
      file_coverage,
      git_commit,
      git_branch,
      test_suite,
    }: CreateCoverageRequest = req.body;

    // At least one coverage metric is required
    if (
      overall_lines === undefined &&
      overall_statements === undefined &&
      overall_functions === undefined &&
      overall_branches === undefined
    ) {
      return res.status(400).json({ error: 'Se requiere al menos una métrica de cobertura' });
    }

    const { data, error } = await supabaseAdmin
      .from('qa_coverage_reports')
      .insert({
        report_name: report_name || null,
        overall_lines: overall_lines ?? null,
        overall_statements: overall_statements ?? null,
        overall_functions: overall_functions ?? null,
        overall_branches: overall_branches ?? null,
        file_coverage: file_coverage || null,
        git_commit: git_commit || null,
        git_branch: git_branch || null,
        test_suite: test_suite || null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating coverage report:', error);
      return res.status(500).json({ error: 'Error al guardar reporte de cobertura' });
    }

    return res.status(201).json({ report: data });
  } catch (error) {
    console.error('Exception in POST coverage:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * DELETE: Remove coverage report
 */
async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const supabaseAdmin = createServiceRoleClient();
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID es requerido' });
    }

    const { error } = await supabaseAdmin
      .from('qa_coverage_reports')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting coverage report:', error);
      return res.status(500).json({ error: 'Error al eliminar reporte' });
    }

    return res.status(200).json({ message: 'Reporte eliminado' });
  } catch (error) {
    console.error('Exception in DELETE coverage:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * Aggregate reports into trend data by date
 */
function aggregateTrends(reports: CoverageReport[]): CoverageTrendPoint[] {
  const dateGroups = new Map<string, {
    lines: number[];
    statements: number[];
    functions: number[];
    branches: number[];
  }>();

  reports.forEach((report) => {
    const date = report.created_at.split('T')[0];
    const current = dateGroups.get(date) || {
      lines: [],
      statements: [],
      functions: [],
      branches: [],
    };

    if (report.overall_lines !== null) current.lines.push(report.overall_lines);
    if (report.overall_statements !== null) current.statements.push(report.overall_statements);
    if (report.overall_functions !== null) current.functions.push(report.overall_functions);
    if (report.overall_branches !== null) current.branches.push(report.overall_branches);

    dateGroups.set(date, current);
  });

  return Array.from(dateGroups.entries())
    .map(([date, values]) => ({
      date,
      lines: values.lines.length > 0
        ? Math.round((values.lines.reduce((a, b) => a + b, 0) / values.lines.length) * 10) / 10
        : null,
      statements: values.statements.length > 0
        ? Math.round((values.statements.reduce((a, b) => a + b, 0) / values.statements.length) * 10) / 10
        : null,
      functions: values.functions.length > 0
        ? Math.round((values.functions.reduce((a, b) => a + b, 0) / values.functions.length) * 10) / 10
        : null,
      branches: values.branches.length > 0
        ? Math.round((values.branches.reduce((a, b) => a + b, 0) / values.branches.length) * 10) / 10
        : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate statistics from reports
 */
function calculateStats(reports: CoverageReport[]): CoverageStats {
  if (reports.length === 0) {
    return {
      total_reports: 0,
      latest_lines: null,
      latest_statements: null,
      latest_functions: null,
      latest_branches: null,
      trend_direction: 'stable',
      avg_lines: 0,
      by_suite: [],
    };
  }

  // Latest report
  const latest = reports[0];

  // Calculate trend direction (compare last 2 reports)
  let trendDirection: 'up' | 'down' | 'stable' = 'stable';
  if (reports.length >= 2) {
    const current = reports[0].overall_lines ?? 0;
    const previous = reports[1].overall_lines ?? 0;
    if (current > previous + 1) trendDirection = 'up';
    else if (current < previous - 1) trendDirection = 'down';
  }

  // Average line coverage
  const linesCoverage = reports.filter(r => r.overall_lines !== null).map(r => r.overall_lines!);
  const avgLines = linesCoverage.length > 0
    ? Math.round((linesCoverage.reduce((a, b) => a + b, 0) / linesCoverage.length) * 10) / 10
    : 0;

  // Group by suite
  const suiteMap = new Map<string, { count: number; lines: number[] }>();
  reports.forEach((report) => {
    const suite = report.test_suite || 'unknown';
    const current = suiteMap.get(suite) || { count: 0, lines: [] };
    current.count++;
    if (report.overall_lines !== null) current.lines.push(report.overall_lines);
    suiteMap.set(suite, current);
  });

  const bySuite = Array.from(suiteMap.entries()).map(([test_suite, data]) => ({
    test_suite,
    count: data.count,
    avg_lines: data.lines.length > 0
      ? Math.round((data.lines.reduce((a, b) => a + b, 0) / data.lines.length) * 10) / 10
      : 0,
  }));

  return {
    total_reports: reports.length,
    latest_lines: latest.overall_lines,
    latest_statements: latest.overall_statements,
    latest_functions: latest.overall_functions,
    latest_branches: latest.overall_branches,
    trend_direction: trendDirection,
    avg_lines: avgLines,
    by_suite: bySuite,
  };
}
