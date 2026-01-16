/**
 * QA Feature Checklist API
 *
 * Manages the feature checklist for QA coverage tracking.
 * Shows which features have scenarios vs. which are untested.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient, checkIsAdmin, getApiUser } from '@/lib/api-auth';
import type { FeatureArea } from '@/types/qa';

export interface QAFeatureChecklistItem {
  id: string;
  feature_name: string;
  feature_area: FeatureArea;
  description: string | null;
  route_pattern: string | null;
  is_critical: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // Computed fields from join
  scenario_count?: number;
}

export interface FeatureCoverageStats {
  total_features: number;
  covered_features: number;
  critical_features: number;
  critical_covered: number;
  coverage_percentage: number;
  critical_coverage_percentage: number;
  by_area: {
    feature_area: FeatureArea;
    total: number;
    covered: number;
    percentage: number;
  }[];
}

interface CreateFeatureRequest {
  feature_name: string;
  feature_area: FeatureArea;
  description?: string;
  route_pattern?: string;
  is_critical?: boolean;
}

interface UpdateFeatureRequest {
  feature_name?: string;
  feature_area?: FeatureArea;
  description?: string | null;
  route_pattern?: string | null;
  is_critical?: boolean;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // For GET, allow QA testers; for mutations, require admin
  if (req.method === 'GET') {
    const { user, error: authError } = await getApiUser(req, res);
    if (authError || !user) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    return handleGet(req, res, user.id);
  }

  // Mutations require admin
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (authError || !user) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (!isAdmin) {
    return res.status(403).json({ error: 'Solo administradores pueden gestionar el checklist' });
  }

  switch (req.method) {
    case 'POST':
      return handlePost(req, res, user.id);
    case 'PUT':
      return handlePut(req, res, user.id);
    case 'DELETE':
      return handleDelete(req, res, user.id);
    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
      return res.status(405).json({ error: `Método ${req.method} no permitido` });
  }
}

/**
 * GET: List features with scenario counts and coverage stats
 */
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const supabaseAdmin = createServiceRoleClient();
    const { feature_area, stats_only } = req.query;

    // Get all features
    let featureQuery = supabaseAdmin
      .from('qa_feature_checklist')
      .select('*')
      .order('feature_area')
      .order('is_critical', { ascending: false })
      .order('feature_name');

    if (feature_area && typeof feature_area === 'string') {
      featureQuery = featureQuery.eq('feature_area', feature_area);
    }

    const { data: features, error: featuresError } = await featureQuery;

    if (featuresError) {
      console.error('Error fetching features:', featuresError);
      return res.status(500).json({ error: 'Error al obtener características' });
    }

    // Get scenario counts by feature_area
    const { data: scenarioCounts, error: countError } = await supabaseAdmin
      .from('qa_scenarios')
      .select('feature_area')
      .eq('is_active', true);

    if (countError) {
      console.error('Error fetching scenario counts:', countError);
    }

    // Count scenarios per feature_area
    const areaScenarioCounts = new Map<string, number>();
    scenarioCounts?.forEach((scenario) => {
      const count = areaScenarioCounts.get(scenario.feature_area) || 0;
      areaScenarioCounts.set(scenario.feature_area, count + 1);
    });

    // Attach scenario counts to features
    const featuresWithCounts = (features || []).map((feature) => ({
      ...feature,
      scenario_count: areaScenarioCounts.get(feature.feature_area) || 0,
    }));

    // Calculate coverage stats
    const totalFeatures = featuresWithCounts.length;
    const coveredFeatures = featuresWithCounts.filter((f) => f.scenario_count > 0).length;
    const criticalFeatures = featuresWithCounts.filter((f) => f.is_critical).length;
    const criticalCovered = featuresWithCounts.filter(
      (f) => f.is_critical && f.scenario_count > 0
    ).length;

    // Stats by area
    const areaStats = new Map<string, { total: number; covered: number }>();
    featuresWithCounts.forEach((feature) => {
      const current = areaStats.get(feature.feature_area) || { total: 0, covered: 0 };
      current.total++;
      if (feature.scenario_count > 0) current.covered++;
      areaStats.set(feature.feature_area, current);
    });

    const byArea = Array.from(areaStats.entries()).map(([area, stats]) => ({
      feature_area: area as FeatureArea,
      total: stats.total,
      covered: stats.covered,
      percentage: stats.total > 0 ? Math.round((stats.covered / stats.total) * 100) : 0,
    }));

    const coverageStats: FeatureCoverageStats = {
      total_features: totalFeatures,
      covered_features: coveredFeatures,
      critical_features: criticalFeatures,
      critical_covered: criticalCovered,
      coverage_percentage: totalFeatures > 0 ? Math.round((coveredFeatures / totalFeatures) * 100) : 0,
      critical_coverage_percentage: criticalFeatures > 0 ? Math.round((criticalCovered / criticalFeatures) * 100) : 0,
      by_area: byArea,
    };

    if (stats_only === 'true') {
      return res.status(200).json({ stats: coverageStats });
    }

    return res.status(200).json({
      features: featuresWithCounts,
      stats: coverageStats,
    });
  } catch (error) {
    console.error('Exception in GET feature-checklist:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST: Create new feature
 */
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const supabaseAdmin = createServiceRoleClient();
    const { feature_name, feature_area, description, route_pattern, is_critical }: CreateFeatureRequest = req.body;

    if (!feature_name || !feature_area) {
      return res.status(400).json({ error: 'Se requiere nombre y área de característica' });
    }

    const { data, error } = await supabaseAdmin
      .from('qa_feature_checklist')
      .insert({
        feature_name,
        feature_area,
        description: description || null,
        route_pattern: route_pattern || null,
        is_critical: is_critical || false,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating feature:', error);
      return res.status(500).json({ error: 'Error al crear característica' });
    }

    return res.status(201).json({ feature: data });
  } catch (error) {
    console.error('Exception in POST feature-checklist:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * PUT: Update feature
 */
async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const supabaseAdmin = createServiceRoleClient();
    const { id } = req.query;
    const updates: UpdateFeatureRequest = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Se requiere ID de característica' });
    }

    const updateData: Record<string, unknown> = {};
    if (updates.feature_name !== undefined) updateData.feature_name = updates.feature_name;
    if (updates.feature_area !== undefined) updateData.feature_area = updates.feature_area;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.route_pattern !== undefined) updateData.route_pattern = updates.route_pattern;
    if (updates.is_critical !== undefined) updateData.is_critical = updates.is_critical;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    const { data, error } = await supabaseAdmin
      .from('qa_feature_checklist')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating feature:', error);
      return res.status(500).json({ error: 'Error al actualizar característica' });
    }

    return res.status(200).json({ feature: data });
  } catch (error) {
    console.error('Exception in PUT feature-checklist:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * DELETE: Remove feature
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
      return res.status(400).json({ error: 'Se requiere ID de característica' });
    }

    const { error } = await supabaseAdmin
      .from('qa_feature_checklist')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting feature:', error);
      return res.status(500).json({ error: 'Error al eliminar característica' });
    }

    return res.status(200).json({ message: 'Característica eliminada' });
  } catch (error) {
    console.error('Exception in DELETE feature-checklist:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
