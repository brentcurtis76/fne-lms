/**
 * QA Lighthouse API
 *
 * Manages Lighthouse audit results for performance tracking.
 * GET: Fetch audit results with filtering
 * POST: Store new audit results (manual or from CI)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient, checkIsAdmin, getApiUser } from '@/lib/api-auth';

export interface LighthouseResult {
  id: string;
  url: string;
  performance_score: number | null;
  accessibility_score: number | null;
  best_practices_score: number | null;
  seo_score: number | null;
  report_json: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
}

export interface LighthouseTrendPoint {
  date: string;
  performance: number | null;
  accessibility: number | null;
  best_practices: number | null;
  seo: number | null;
}

export interface LighthouseStats {
  total_audits: number;
  avg_performance: number;
  avg_accessibility: number;
  avg_best_practices: number;
  avg_seo: number;
  latest_by_url: Record<string, LighthouseResult>;
}

interface CreateAuditRequest {
  url: string;
  performance_score?: number;
  accessibility_score?: number;
  best_practices_score?: number;
  seo_score?: number;
  report_json?: Record<string, unknown>;
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
    return res.status(403).json({ error: 'Solo administradores pueden acceder a datos de Lighthouse' });
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
 * GET: Fetch Lighthouse results
 * Query params:
 *   - url: Filter by URL
 *   - period: 'week' | 'month' | 'all'
 *   - limit: Number of results
 *   - trends: If 'true', return trend data
 */
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const supabaseAdmin = createServiceRoleClient();
    const { url, period = 'month', limit = '50', trends } = req.query;

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
      .from('qa_lighthouse_results')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(parseInt(limit as string, 10));

    if (url && typeof url === 'string') {
      query = query.eq('url', url);
    }

    const { data: results, error } = await query;

    if (error) {
      console.error('Error fetching lighthouse results:', error);
      return res.status(500).json({ error: 'Error al obtener resultados de Lighthouse' });
    }

    // If trends requested, aggregate by date
    if (trends === 'true') {
      const trendData = aggregateTrends(results || []);
      return res.status(200).json({ trends: trendData });
    }

    // Calculate stats
    const stats = calculateStats(results || []);

    // Get unique URLs for dropdown
    const { data: urls } = await supabaseAdmin
      .from('qa_lighthouse_results')
      .select('url')
      .gte('created_at', startDate.toISOString());

    const uniqueUrls = [...new Set((urls || []).map(r => r.url))];

    return res.status(200).json({
      results: results || [],
      stats,
      urls: uniqueUrls,
      period,
    });
  } catch (error) {
    console.error('Exception in GET lighthouse:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST: Create new audit result
 */
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const supabaseAdmin = createServiceRoleClient();
    const {
      url,
      performance_score,
      accessibility_score,
      best_practices_score,
      seo_score,
      report_json,
    }: CreateAuditRequest = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL es requerida' });
    }

    const { data, error } = await supabaseAdmin
      .from('qa_lighthouse_results')
      .insert({
        url,
        performance_score: performance_score ?? null,
        accessibility_score: accessibility_score ?? null,
        best_practices_score: best_practices_score ?? null,
        seo_score: seo_score ?? null,
        report_json: report_json ?? null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating lighthouse result:', error);
      return res.status(500).json({ error: 'Error al guardar resultado de Lighthouse' });
    }

    return res.status(201).json({ result: data });
  } catch (error) {
    console.error('Exception in POST lighthouse:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * DELETE: Remove audit result
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
      .from('qa_lighthouse_results')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting lighthouse result:', error);
      return res.status(500).json({ error: 'Error al eliminar resultado' });
    }

    return res.status(200).json({ message: 'Resultado eliminado' });
  } catch (error) {
    console.error('Exception in DELETE lighthouse:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * Aggregate results into trend data by date
 */
function aggregateTrends(results: LighthouseResult[]): LighthouseTrendPoint[] {
  const dateGroups = new Map<string, {
    performance: number[];
    accessibility: number[];
    best_practices: number[];
    seo: number[];
  }>();

  results.forEach((result) => {
    const date = result.created_at.split('T')[0];
    const current = dateGroups.get(date) || {
      performance: [],
      accessibility: [],
      best_practices: [],
      seo: [],
    };

    if (result.performance_score !== null) current.performance.push(result.performance_score);
    if (result.accessibility_score !== null) current.accessibility.push(result.accessibility_score);
    if (result.best_practices_score !== null) current.best_practices.push(result.best_practices_score);
    if (result.seo_score !== null) current.seo.push(result.seo_score);

    dateGroups.set(date, current);
  });

  return Array.from(dateGroups.entries())
    .map(([date, scores]) => ({
      date,
      performance: scores.performance.length > 0
        ? Math.round(scores.performance.reduce((a, b) => a + b, 0) / scores.performance.length)
        : null,
      accessibility: scores.accessibility.length > 0
        ? Math.round(scores.accessibility.reduce((a, b) => a + b, 0) / scores.accessibility.length)
        : null,
      best_practices: scores.best_practices.length > 0
        ? Math.round(scores.best_practices.reduce((a, b) => a + b, 0) / scores.best_practices.length)
        : null,
      seo: scores.seo.length > 0
        ? Math.round(scores.seo.reduce((a, b) => a + b, 0) / scores.seo.length)
        : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate statistics from results
 */
function calculateStats(results: LighthouseResult[]): LighthouseStats {
  const performanceScores = results.filter(r => r.performance_score !== null).map(r => r.performance_score!);
  const accessibilityScores = results.filter(r => r.accessibility_score !== null).map(r => r.accessibility_score!);
  const bestPracticesScores = results.filter(r => r.best_practices_score !== null).map(r => r.best_practices_score!);
  const seoScores = results.filter(r => r.seo_score !== null).map(r => r.seo_score!);

  // Get latest result per URL
  const latestByUrl: Record<string, LighthouseResult> = {};
  results.forEach((result) => {
    if (!latestByUrl[result.url] || new Date(result.created_at) > new Date(latestByUrl[result.url].created_at)) {
      latestByUrl[result.url] = result;
    }
  });

  return {
    total_audits: results.length,
    avg_performance: performanceScores.length > 0
      ? Math.round(performanceScores.reduce((a, b) => a + b, 0) / performanceScores.length)
      : 0,
    avg_accessibility: accessibilityScores.length > 0
      ? Math.round(accessibilityScores.reduce((a, b) => a + b, 0) / accessibilityScores.length)
      : 0,
    avg_best_practices: bestPracticesScores.length > 0
      ? Math.round(bestPracticesScores.reduce((a, b) => a + b, 0) / bestPracticesScores.length)
      : 0,
    avg_seo: seoScores.length > 0
      ? Math.round(seoScores.reduce((a, b) => a + b, 0) / seoScores.length)
      : 0,
    latest_by_url: latestByUrl,
  };
}
