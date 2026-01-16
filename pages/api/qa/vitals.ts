/**
 * QA Web Vitals API
 *
 * Manages Core Web Vitals metrics from real user monitoring.
 * GET: Fetch vitals data with aggregation
 * POST: Record new vital measurement (from client)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient, checkIsAdmin } from '@/lib/api-auth';

export type VitalName = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
export type VitalRating = 'good' | 'needs-improvement' | 'poor';

export interface WebVital {
  id: string;
  page_url: string;
  vital_name: VitalName;
  value: number;
  rating: VitalRating | null;
  user_agent: string | null;
  session_id: string | null;
  created_at: string;
}

export interface VitalTrendPoint {
  date: string;
  LCP: number | null;
  INP: number | null;
  CLS: number | null;
  FCP: number | null;
  TTFB: number | null;
}

export interface VitalStats {
  total_measurements: number;
  by_vital: {
    [key in VitalName]?: {
      count: number;
      p50: number;
      p75: number;
      p95: number;
      good_count: number;
      needs_improvement_count: number;
      poor_count: number;
      good_percentage: number;
    };
  };
  by_page: {
    page_url: string;
    measurement_count: number;
    avg_lcp: number | null;
    avg_inp: number | null;
    avg_cls: number | null;
  }[];
}

// Web Vitals thresholds (based on Google's recommendations)
const VITAL_THRESHOLDS: Record<VitalName, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 }, // ms
  INP: { good: 200, poor: 500 }, // ms
  CLS: { good: 0.1, poor: 0.25 }, // score
  FCP: { good: 1800, poor: 3000 }, // ms
  TTFB: { good: 800, poor: 1800 }, // ms
};

interface RecordVitalRequest {
  page_url: string;
  vital_name: VitalName;
  value: number;
  user_agent?: string;
  session_id?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    default:
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: `Método ${req.method} no permitido` });
  }
}

/**
 * GET: Fetch vitals data (admin only)
 * Query params:
 *   - page_url: Filter by page
 *   - vital_name: Filter by vital type
 *   - period: 'day' | 'week' | 'month' | 'all'
 *   - trends: If 'true', return trend data
 */
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // GET requires admin
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (authError || !user) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (!isAdmin) {
    return res.status(403).json({ error: 'Solo administradores pueden ver datos de vitals' });
  }

  try {
    const supabaseAdmin = createServiceRoleClient();
    const { page_url, vital_name, period = 'week', trends } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
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
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Build query
    let query = supabaseAdmin
      .from('qa_web_vitals')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(10000);

    if (page_url && typeof page_url === 'string') {
      query = query.eq('page_url', page_url);
    }

    if (vital_name && typeof vital_name === 'string') {
      query = query.eq('vital_name', vital_name);
    }

    const { data: vitals, error } = await query;

    if (error) {
      console.error('Error fetching vitals:', error);
      return res.status(500).json({ error: 'Error al obtener datos de vitals' });
    }

    // If trends requested, aggregate by date
    if (trends === 'true') {
      const trendData = aggregateVitalTrends(vitals || []);
      return res.status(200).json({ trends: trendData });
    }

    // Calculate stats
    const stats = calculateVitalStats(vitals || []);

    // Get unique pages for dropdown
    const { data: pages } = await supabaseAdmin
      .from('qa_web_vitals')
      .select('page_url')
      .gte('created_at', startDate.toISOString());

    const uniquePages = [...new Set((pages || []).map(p => p.page_url))];

    return res.status(200).json({
      vitals: (vitals || []).slice(0, 100), // Return last 100 for display
      stats,
      pages: uniquePages,
      period,
      thresholds: VITAL_THRESHOLDS,
    });
  } catch (error) {
    console.error('Exception in GET vitals:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST: Record new vital measurement (public endpoint for RUM)
 */
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const supabaseAdmin = createServiceRoleClient();
    const {
      page_url,
      vital_name,
      value,
      user_agent,
      session_id,
    }: RecordVitalRequest = req.body;

    // Validate required fields
    if (!page_url || !vital_name || value === undefined) {
      return res.status(400).json({ error: 'page_url, vital_name, y value son requeridos' });
    }

    // Validate vital_name
    const validVitals: VitalName[] = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];
    if (!validVitals.includes(vital_name)) {
      return res.status(400).json({ error: 'vital_name inválido' });
    }

    // Calculate rating based on thresholds
    const thresholds = VITAL_THRESHOLDS[vital_name];
    let rating: VitalRating;
    if (value <= thresholds.good) {
      rating = 'good';
    } else if (value <= thresholds.poor) {
      rating = 'needs-improvement';
    } else {
      rating = 'poor';
    }

    const { data, error } = await supabaseAdmin
      .from('qa_web_vitals')
      .insert({
        page_url,
        vital_name,
        value,
        rating,
        user_agent: user_agent || null,
        session_id: session_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error recording vital:', error);
      return res.status(500).json({ error: 'Error al registrar vital' });
    }

    return res.status(201).json({ vital: data });
  } catch (error) {
    console.error('Exception in POST vitals:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * Aggregate vitals into trend data by date
 */
function aggregateVitalTrends(vitals: WebVital[]): VitalTrendPoint[] {
  const dateGroups = new Map<string, {
    LCP: number[];
    INP: number[];
    CLS: number[];
    FCP: number[];
    TTFB: number[];
  }>();

  vitals.forEach((vital) => {
    const date = vital.created_at.split('T')[0];
    const current = dateGroups.get(date) || {
      LCP: [],
      INP: [],
      CLS: [],
      FCP: [],
      TTFB: [],
    };

    current[vital.vital_name].push(vital.value);
    dateGroups.set(date, current);
  });

  return Array.from(dateGroups.entries())
    .map(([date, values]) => ({
      date,
      LCP: values.LCP.length > 0 ? calculateP75(values.LCP) : null,
      INP: values.INP.length > 0 ? calculateP75(values.INP) : null,
      CLS: values.CLS.length > 0 ? calculateP75(values.CLS) : null,
      FCP: values.FCP.length > 0 ? calculateP75(values.FCP) : null,
      TTFB: values.TTFB.length > 0 ? calculateP75(values.TTFB) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate vital statistics
 */
function calculateVitalStats(vitals: WebVital[]): VitalStats {
  const byVital: VitalStats['by_vital'] = {};
  const vitalNames: VitalName[] = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];

  vitalNames.forEach((name) => {
    const vitalData = vitals.filter(v => v.vital_name === name);
    if (vitalData.length === 0) return;

    const values = vitalData.map(v => v.value).sort((a, b) => a - b);
    const goodCount = vitalData.filter(v => v.rating === 'good').length;
    const needsImprovementCount = vitalData.filter(v => v.rating === 'needs-improvement').length;
    const poorCount = vitalData.filter(v => v.rating === 'poor').length;

    byVital[name] = {
      count: values.length,
      p50: calculatePercentile(values, 50),
      p75: calculatePercentile(values, 75),
      p95: calculatePercentile(values, 95),
      good_count: goodCount,
      needs_improvement_count: needsImprovementCount,
      poor_count: poorCount,
      good_percentage: Math.round((goodCount / vitalData.length) * 100),
    };
  });

  // Aggregate by page
  const pageMap = new Map<string, WebVital[]>();
  vitals.forEach((vital) => {
    const existing = pageMap.get(vital.page_url) || [];
    existing.push(vital);
    pageMap.set(vital.page_url, existing);
  });

  const byPage = Array.from(pageMap.entries()).map(([page_url, pageVitals]) => {
    const lcpValues = pageVitals.filter(v => v.vital_name === 'LCP').map(v => v.value);
    const inpValues = pageVitals.filter(v => v.vital_name === 'INP').map(v => v.value);
    const clsValues = pageVitals.filter(v => v.vital_name === 'CLS').map(v => v.value);

    return {
      page_url,
      measurement_count: pageVitals.length,
      avg_lcp: lcpValues.length > 0 ? Math.round(lcpValues.reduce((a, b) => a + b, 0) / lcpValues.length) : null,
      avg_inp: inpValues.length > 0 ? Math.round(inpValues.reduce((a, b) => a + b, 0) / inpValues.length) : null,
      avg_cls: clsValues.length > 0 ? parseFloat((clsValues.reduce((a, b) => a + b, 0) / clsValues.length).toFixed(3)) : null,
    };
  }).sort((a, b) => b.measurement_count - a.measurement_count);

  return {
    total_measurements: vitals.length,
    by_vital: byVital,
    by_page: byPage,
  };
}

/**
 * Calculate percentile from sorted array
 */
function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  const value = sortedValues[Math.max(0, index)];
  // Round for time-based metrics, keep decimals for CLS
  return value < 1 ? parseFloat(value.toFixed(3)) : Math.round(value);
}

/**
 * Calculate P75 (75th percentile)
 */
function calculateP75(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return calculatePercentile(sorted, 75);
}
