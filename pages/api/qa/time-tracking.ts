/**
 * QA Time Tracking API
 *
 * GET - Get time tracking data for billing (admin only)
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createApiSupabaseClient,
  sendAuthError,
  handleMethodNotAllowed,
} from '@/lib/api-auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    return handleGetTimeTracking(req, res);
  }

  return handleMethodNotAllowed(res, ['GET']);
}

interface TimeLogEntry {
  tester_id: string;
  tester_email: string;
  tester_name: string;
  log_date: string;
  total_active_seconds: number;
  tests_started: number;
  tests_completed: number;
  tests_passed: number;
  tests_failed: number;
}

interface TimeLogSummary {
  total_active_seconds: number;
  total_active_hours: number;
  total_tests_started: number;
  total_tests_completed: number;
  total_tests_passed: number;
  total_tests_failed: number;
}

/**
 * GET /api/qa/time-tracking
 *
 * Query params:
 * - start_date: Filter from this date (inclusive)
 * - end_date: Filter to this date (inclusive)
 * - tester_id: Filter by specific tester
 * - group_by: 'day' | 'tester' | 'both' (default: 'day')
 */
async function handleGetTimeTracking(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { isAdmin, user, error } = await checkIsAdmin(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  if (!isAdmin) {
    return res.status(403).json({
      error: 'Solo administradores pueden ver el registro de horas',
    });
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    const { start_date, end_date, tester_id, group_by = 'day' } = req.query;

    // First check if the qa_tester_time_logs table exists
    // If not, we'll aggregate from qa_test_runs directly
    const { data: tableCheck, error: tableError } = await supabaseClient
      .from('qa_tester_time_logs')
      .select('id')
      .limit(1);

    const useTimeLogsTable = !tableError;

    if (useTimeLogsTable) {
      // Use the dedicated time logs table
      let query = supabaseClient
        .from('qa_tester_time_logs')
        .select(`
          *,
          tester:profiles(id, email, first_name, last_name)
        `)
        .order('log_date', { ascending: false });

      if (start_date) {
        query = query.gte('log_date', start_date as string);
      }
      if (end_date) {
        query = query.lte('log_date', end_date as string);
      }
      if (tester_id) {
        query = query.eq('tester_id', tester_id as string);
      }

      const { data: logs, error: logsError } = await query;

      if (logsError) {
        console.error('Error fetching time logs:', logsError);
        return res.status(500).json({
          error: 'Error al obtener registros de tiempo',
          details: logsError.message,
        });
      }

      // Format response
      const entries: TimeLogEntry[] = (logs || []).map((log: any) => ({
        tester_id: log.tester_id,
        tester_email: log.tester?.email || 'unknown',
        tester_name: log.tester
          ? `${log.tester.first_name || ''} ${log.tester.last_name || ''}`.trim() || log.tester.email
          : 'Unknown',
        log_date: log.log_date,
        total_active_seconds: log.total_active_seconds || 0,
        tests_started: log.tests_started || 0,
        tests_completed: log.tests_completed || 0,
        tests_passed: log.tests_passed || 0,
        tests_failed: log.tests_failed || 0,
      }));

      // Calculate summary
      const summary: TimeLogSummary = entries.reduce(
        (acc, entry) => ({
          total_active_seconds: acc.total_active_seconds + entry.total_active_seconds,
          total_active_hours: 0, // Calculated below
          total_tests_started: acc.total_tests_started + entry.tests_started,
          total_tests_completed: acc.total_tests_completed + entry.tests_completed,
          total_tests_passed: acc.total_tests_passed + entry.tests_passed,
          total_tests_failed: acc.total_tests_failed + entry.tests_failed,
        }),
        {
          total_active_seconds: 0,
          total_active_hours: 0,
          total_tests_started: 0,
          total_tests_completed: 0,
          total_tests_passed: 0,
          total_tests_failed: 0,
        }
      );
      summary.total_active_hours = Math.round((summary.total_active_seconds / 3600) * 100) / 100;

      return res.status(200).json({
        success: true,
        entries,
        summary,
        source: 'time_logs',
      });
    } else {
      // Fallback: Aggregate from qa_test_runs directly
      let query = supabaseClient
        .from('qa_test_runs')
        .select(`
          id,
          tester_id,
          started_at,
          completed_at,
          status,
          overall_result,
          total_active_seconds,
          tester:profiles(id, email, first_name, last_name)
        `)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });

      if (start_date) {
        query = query.gte('completed_at', `${start_date}T00:00:00`);
      }
      if (end_date) {
        query = query.lte('completed_at', `${end_date}T23:59:59`);
      }
      if (tester_id) {
        query = query.eq('tester_id', tester_id as string);
      }

      const { data: runs, error: runsError } = await query;

      if (runsError) {
        console.error('Error fetching test runs:', runsError);
        return res.status(500).json({
          error: 'Error al obtener ejecuciones',
          details: runsError.message,
        });
      }

      // Group by date and tester
      const groupedData = new Map<string, TimeLogEntry>();

      (runs || []).forEach((run: any) => {
        const date = run.completed_at?.split('T')[0] || 'unknown';
        const key = `${run.tester_id}-${date}`;
        const tester = run.tester || {};

        if (!groupedData.has(key)) {
          groupedData.set(key, {
            tester_id: run.tester_id,
            tester_email: tester.email || 'unknown',
            tester_name: `${tester.first_name || ''} ${tester.last_name || ''}`.trim() || tester.email || 'Unknown',
            log_date: date,
            total_active_seconds: 0,
            tests_started: 0,
            tests_completed: 0,
            tests_passed: 0,
            tests_failed: 0,
          });
        }

        const entry = groupedData.get(key)!;
        entry.total_active_seconds += run.total_active_seconds || 0;
        entry.tests_completed += 1;
        if (run.overall_result === 'pass') {
          entry.tests_passed += 1;
        } else if (run.overall_result === 'fail') {
          entry.tests_failed += 1;
        }
      });

      const entries = Array.from(groupedData.values()).sort(
        (a, b) => b.log_date.localeCompare(a.log_date)
      );

      // Calculate summary
      const summary: TimeLogSummary = entries.reduce(
        (acc, entry) => ({
          total_active_seconds: acc.total_active_seconds + entry.total_active_seconds,
          total_active_hours: 0,
          total_tests_started: acc.total_tests_started + entry.tests_started,
          total_tests_completed: acc.total_tests_completed + entry.tests_completed,
          total_tests_passed: acc.total_tests_passed + entry.tests_passed,
          total_tests_failed: acc.total_tests_failed + entry.tests_failed,
        }),
        {
          total_active_seconds: 0,
          total_active_hours: 0,
          total_tests_started: 0,
          total_tests_completed: 0,
          total_tests_passed: 0,
          total_tests_failed: 0,
        }
      );
      summary.total_active_hours = Math.round((summary.total_active_seconds / 3600) * 100) / 100;

      return res.status(200).json({
        success: true,
        entries,
        summary,
        source: 'test_runs',
      });
    }
  } catch (err) {
    console.error('Unexpected error fetching time tracking:', err);
    return res.status(500).json({
      error: 'Error inesperado al obtener registros de tiempo',
    });
  }
}
