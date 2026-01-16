/**
 * QA Test Trends API
 *
 * Provides aggregated test results over time for trend analysis.
 * Supports filtering by period and feature area.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient, getApiUser } from '@/lib/api-auth';
import type { FeatureArea } from '@/types/qa';

export interface TrendDataPoint {
  date: string;
  passed: number;
  failed: number;
  partial: number;
  total: number;
}

export interface TesterProductivity {
  tester_id: string;
  tester_email: string;
  tester_name: string;
  tests_completed: number;
  tests_passed: number;
  pass_rate: number;
}

export interface TrendResponse {
  trends: TrendDataPoint[];
  summary: {
    total_runs: number;
    passed: number;
    failed: number;
    partial: number;
    pass_rate: number;
    fail_rate: number;
  };
  productivity: TesterProductivity[];
  period: string;
  feature_area: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Método ${req.method} no permitido` });
  }

  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const supabaseAdmin = createServiceRoleClient();
    const { period = 'month', feature_area } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    let dateFormat: 'day' | 'week' | 'month';

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFormat = 'day';
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFormat = 'day';
        break;
      case 'all':
        startDate = new Date('2020-01-01'); // Far past date
        dateFormat = 'week';
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFormat = 'day';
    }

    // Build query for test runs
    let query = supabaseAdmin
      .from('qa_test_runs')
      .select(`
        id,
        started_at,
        completed_at,
        overall_result,
        status,
        tester_id,
        scenario:qa_scenarios!inner(feature_area)
      `)
      .eq('status', 'completed')
      .gte('completed_at', startDate.toISOString())
      .order('completed_at', { ascending: true });

    // Filter by feature area if specified
    if (feature_area && typeof feature_area === 'string') {
      query = query.eq('scenario.feature_area', feature_area);
    }

    const { data: runs, error: runsError } = await query;

    if (runsError) {
      console.error('Error fetching test runs:', runsError);
      return res.status(500).json({ error: 'Error al obtener datos de pruebas' });
    }

    // Group runs by date
    const dateGroups = new Map<string, { passed: number; failed: number; partial: number; total: number }>();

    runs?.forEach((run: any) => {
      const date = run.completed_at ? new Date(run.completed_at) : null;
      if (!date) return;

      let dateKey: string;
      if (dateFormat === 'day') {
        dateKey = date.toISOString().split('T')[0];
      } else if (dateFormat === 'week') {
        // Get the start of the week (Monday)
        const monday = new Date(date);
        monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
        dateKey = monday.toISOString().split('T')[0];
      } else {
        // Month
        dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
      }

      const current = dateGroups.get(dateKey) || { passed: 0, failed: 0, partial: 0, total: 0 };
      current.total++;

      if (run.overall_result === 'pass') current.passed++;
      else if (run.overall_result === 'fail') current.failed++;
      else if (run.overall_result === 'partial') current.partial++;

      dateGroups.set(dateKey, current);
    });

    // Fill in missing dates for continuous chart
    const trends: TrendDataPoint[] = [];
    if (dateFormat === 'day') {
      const currentDate = new Date(startDate);
      while (currentDate <= now) {
        const dateKey = currentDate.toISOString().split('T')[0];
        const data = dateGroups.get(dateKey) || { passed: 0, failed: 0, partial: 0, total: 0 };
        trends.push({
          date: dateKey,
          ...data,
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }
    } else {
      // For week/month, just use the grouped data
      Array.from(dateGroups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([date, data]) => {
          trends.push({ date, ...data });
        });
    }

    // Calculate summary
    const totalRuns = runs?.length || 0;
    const passed = runs?.filter((r: any) => r.overall_result === 'pass').length || 0;
    const failed = runs?.filter((r: any) => r.overall_result === 'fail').length || 0;
    const partial = runs?.filter((r: any) => r.overall_result === 'partial').length || 0;

    // Get tester productivity
    const testerMap = new Map<string, { completed: number; passed: number }>();
    runs?.forEach((run: any) => {
      const current = testerMap.get(run.tester_id) || { completed: 0, passed: 0 };
      current.completed++;
      if (run.overall_result === 'pass') current.passed++;
      testerMap.set(run.tester_id, current);
    });

    // Get tester details
    const testerIds = Array.from(testerMap.keys());
    let productivity: TesterProductivity[] = [];

    if (testerIds.length > 0) {
      const { data: testers } = await supabaseAdmin
        .from('profiles')
        .select('id, email, first_name, last_name')
        .in('id', testerIds);

      productivity = testerIds.map((testerId) => {
        const stats = testerMap.get(testerId)!;
        const tester = testers?.find((t) => t.id === testerId);
        return {
          tester_id: testerId,
          tester_email: tester?.email || 'Desconocido',
          tester_name: tester?.first_name && tester?.last_name
            ? `${tester.first_name} ${tester.last_name}`
            : tester?.email || 'Desconocido',
          tests_completed: stats.completed,
          tests_passed: stats.passed,
          pass_rate: stats.completed > 0 ? Math.round((stats.passed / stats.completed) * 100) : 0,
        };
      }).sort((a, b) => b.tests_completed - a.tests_completed);
    }

    const response: TrendResponse = {
      trends,
      summary: {
        total_runs: totalRuns,
        passed,
        failed,
        partial,
        pass_rate: totalRuns > 0 ? Math.round((passed / totalRuns) * 100) : 0,
        fail_rate: totalRuns > 0 ? Math.round((failed / totalRuns) * 100) : 0,
      },
      productivity,
      period: period as string,
      feature_area: (feature_area as string) || null,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Exception in GET trends:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
