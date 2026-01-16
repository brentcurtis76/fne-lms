/**
 * QA Load Test Results API
 *
 * Manages load testing results from k6/Artillery runs.
 * GET: Fetch load test results with filtering
 * POST: Upload new load test result
 * DELETE: Remove load test result
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient, checkIsAdmin } from '@/lib/api-auth';

export interface LoadTestResult {
  id: string;
  test_name: string;
  test_script: string | null;
  description: string | null;
  duration_seconds: number | null;
  virtual_users: number | null;
  requests_total: number | null;
  requests_per_second: number | null;
  response_time_avg: number | null;
  response_time_min: number | null;
  response_time_max: number | null;
  response_time_p50: number | null;
  response_time_p90: number | null;
  response_time_p95: number | null;
  response_time_p99: number | null;
  error_rate: number | null;
  errors_total: number | null;
  data_received_kb: number | null;
  data_sent_kb: number | null;
  iterations_total: number | null;
  target_url: string | null;
  environment: string | null;
  metrics_json: Record<string, unknown> | null;
  status: 'passed' | 'failed' | 'warning' | null;
  created_at: string;
  created_by: string | null;
}

export interface LoadTestTrendPoint {
  date: string;
  response_time_p95: number | null;
  response_time_p99: number | null;
  error_rate: number | null;
  requests_per_second: number | null;
}

export interface LoadTestStats {
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  warning_tests: number;
  avg_response_time_p95: number;
  avg_error_rate: number;
  by_test_name: {
    test_name: string;
    count: number;
    latest_status: string | null;
    latest_p95: number | null;
  }[];
}

interface CreateLoadTestRequest {
  test_name: string;
  test_script?: string;
  description?: string;
  duration_seconds?: number;
  virtual_users?: number;
  requests_total?: number;
  requests_per_second?: number;
  response_time_avg?: number;
  response_time_min?: number;
  response_time_max?: number;
  response_time_p50?: number;
  response_time_p90?: number;
  response_time_p95?: number;
  response_time_p99?: number;
  error_rate?: number;
  errors_total?: number;
  data_received_kb?: number;
  data_sent_kb?: number;
  iterations_total?: number;
  target_url?: string;
  environment?: string;
  metrics_json?: Record<string, unknown>;
  status?: 'passed' | 'failed' | 'warning';
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
    return res.status(403).json({ error: 'Solo administradores pueden acceder a datos de pruebas de carga' });
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
 * GET: Fetch load test results
 * Query params:
 *   - period: 'week' | 'month' | 'all'
 *   - test_name: Filter by test name
 *   - environment: Filter by environment
 *   - status: Filter by status
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
    const { period = 'month', test_name, environment, status, trends, limit = '50' } = req.query;

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
      .from('qa_load_test_results')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(parseInt(limit as string, 10));

    if (test_name && typeof test_name === 'string') {
      query = query.eq('test_name', test_name);
    }

    if (environment && typeof environment === 'string') {
      query = query.eq('environment', environment);
    }

    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    const { data: results, error } = await query;

    if (error) {
      console.error('Error fetching load test results:', error);
      return res.status(500).json({ error: 'Error al obtener resultados de pruebas de carga' });
    }

    // If trends requested, aggregate by date
    if (trends === 'true') {
      const trendData = aggregateTrends(results || []);
      return res.status(200).json({ trends: trendData });
    }

    // Calculate stats
    const stats = calculateStats(results || []);

    // Get unique test names and environments for filters
    const { data: testNames } = await supabaseAdmin
      .from('qa_load_test_results')
      .select('test_name');

    const { data: environments } = await supabaseAdmin
      .from('qa_load_test_results')
      .select('environment')
      .not('environment', 'is', null);

    const uniqueTestNames = [...new Set((testNames || []).map(r => r.test_name))];
    const uniqueEnvironments = [...new Set((environments || []).map(r => r.environment).filter(Boolean))];

    return res.status(200).json({
      results: results || [],
      stats,
      testNames: uniqueTestNames,
      environments: uniqueEnvironments,
      period,
    });
  } catch (error) {
    console.error('Exception in GET load-tests:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST: Upload new load test result
 */
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const supabaseAdmin = createServiceRoleClient();
    const data: CreateLoadTestRequest = req.body;

    if (!data.test_name) {
      return res.status(400).json({ error: 'test_name es requerido' });
    }

    // Determine status based on thresholds if not provided
    let status = data.status;
    if (!status) {
      const p95 = data.response_time_p95;
      const errorRate = data.error_rate;

      if (p95 !== undefined && p95 > 1000) {
        status = 'failed';
      } else if (errorRate !== undefined && errorRate > 5) {
        status = 'failed';
      } else if ((p95 !== undefined && p95 > 500) || (errorRate !== undefined && errorRate > 1)) {
        status = 'warning';
      } else {
        status = 'passed';
      }
    }

    const { data: result, error } = await supabaseAdmin
      .from('qa_load_test_results')
      .insert({
        test_name: data.test_name,
        test_script: data.test_script || null,
        description: data.description || null,
        duration_seconds: data.duration_seconds ?? null,
        virtual_users: data.virtual_users ?? null,
        requests_total: data.requests_total ?? null,
        requests_per_second: data.requests_per_second ?? null,
        response_time_avg: data.response_time_avg ?? null,
        response_time_min: data.response_time_min ?? null,
        response_time_max: data.response_time_max ?? null,
        response_time_p50: data.response_time_p50 ?? null,
        response_time_p90: data.response_time_p90 ?? null,
        response_time_p95: data.response_time_p95 ?? null,
        response_time_p99: data.response_time_p99 ?? null,
        error_rate: data.error_rate ?? null,
        errors_total: data.errors_total ?? null,
        data_received_kb: data.data_received_kb ?? null,
        data_sent_kb: data.data_sent_kb ?? null,
        iterations_total: data.iterations_total ?? null,
        target_url: data.target_url || null,
        environment: data.environment || null,
        metrics_json: data.metrics_json || null,
        status,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating load test result:', error);
      return res.status(500).json({ error: 'Error al guardar resultado de prueba de carga' });
    }

    return res.status(201).json({ result });
  } catch (error) {
    console.error('Exception in POST load-tests:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * DELETE: Remove load test result
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
      .from('qa_load_test_results')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting load test result:', error);
      return res.status(500).json({ error: 'Error al eliminar resultado' });
    }

    return res.status(200).json({ message: 'Resultado eliminado' });
  } catch (error) {
    console.error('Exception in DELETE load-tests:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * Aggregate results into trend data by date
 */
function aggregateTrends(results: LoadTestResult[]): LoadTestTrendPoint[] {
  const dateGroups = new Map<string, {
    p95: number[];
    p99: number[];
    errorRate: number[];
    rps: number[];
  }>();

  results.forEach((result) => {
    const date = result.created_at.split('T')[0];
    const current = dateGroups.get(date) || {
      p95: [],
      p99: [],
      errorRate: [],
      rps: [],
    };

    if (result.response_time_p95 !== null) current.p95.push(result.response_time_p95);
    if (result.response_time_p99 !== null) current.p99.push(result.response_time_p99);
    if (result.error_rate !== null) current.errorRate.push(result.error_rate);
    if (result.requests_per_second !== null) current.rps.push(result.requests_per_second);

    dateGroups.set(date, current);
  });

  return Array.from(dateGroups.entries())
    .map(([date, values]) => ({
      date,
      response_time_p95: values.p95.length > 0
        ? Math.round(values.p95.reduce((a, b) => a + b, 0) / values.p95.length)
        : null,
      response_time_p99: values.p99.length > 0
        ? Math.round(values.p99.reduce((a, b) => a + b, 0) / values.p99.length)
        : null,
      error_rate: values.errorRate.length > 0
        ? Math.round((values.errorRate.reduce((a, b) => a + b, 0) / values.errorRate.length) * 100) / 100
        : null,
      requests_per_second: values.rps.length > 0
        ? Math.round(values.rps.reduce((a, b) => a + b, 0) / values.rps.length)
        : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate statistics from results
 */
function calculateStats(results: LoadTestResult[]): LoadTestStats {
  if (results.length === 0) {
    return {
      total_tests: 0,
      passed_tests: 0,
      failed_tests: 0,
      warning_tests: 0,
      avg_response_time_p95: 0,
      avg_error_rate: 0,
      by_test_name: [],
    };
  }

  const passedTests = results.filter(r => r.status === 'passed').length;
  const failedTests = results.filter(r => r.status === 'failed').length;
  const warningTests = results.filter(r => r.status === 'warning').length;

  const p95Values = results.filter(r => r.response_time_p95 !== null).map(r => r.response_time_p95!);
  const avgP95 = p95Values.length > 0
    ? Math.round(p95Values.reduce((a, b) => a + b, 0) / p95Values.length)
    : 0;

  const errorRates = results.filter(r => r.error_rate !== null).map(r => r.error_rate!);
  const avgErrorRate = errorRates.length > 0
    ? Math.round((errorRates.reduce((a, b) => a + b, 0) / errorRates.length) * 100) / 100
    : 0;

  // Group by test name
  const testNameMap = new Map<string, LoadTestResult[]>();
  results.forEach((result) => {
    const existing = testNameMap.get(result.test_name) || [];
    existing.push(result);
    testNameMap.set(result.test_name, existing);
  });

  const byTestName = Array.from(testNameMap.entries()).map(([test_name, testResults]) => {
    const latest = testResults[0]; // Already sorted by created_at desc
    return {
      test_name,
      count: testResults.length,
      latest_status: latest.status,
      latest_p95: latest.response_time_p95,
    };
  });

  return {
    total_tests: results.length,
    passed_tests: passedTests,
    failed_tests: failedTests,
    warning_tests: warningTests,
    avg_response_time_p95: avgP95,
    avg_error_rate: avgErrorRate,
    by_test_name: byTestName,
  };
}
