/**
 * Codebase Index API
 *
 * Fetches available feature areas and their index status.
 * Admin-only endpoint.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify admin authorization
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check admin role
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const isAdmin = roles?.some(r => r.role_type === 'admin');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Fetch all codebase index entries grouped by feature area
    const { data: entries, error: indexError } = await supabaseAdmin
      .from('codebase_index')
      .select('feature_area, route, last_indexed, indexed_by')
      .order('feature_area');

    if (indexError) {
      // Table might not exist yet
      if (indexError.code === '42P01') {
        return res.status(200).json({
          feature_areas: [],
          needs_migration: true,
          migration_sql: 'See /docs/qa-system/migrations/create_codebase_index.sql'
        });
      }
      throw indexError;
    }

    // Group by feature area with metadata
    const featureAreaMap = new Map<string, {
      feature_area: string;
      routes: string[];
      last_indexed: string | null;
      is_stale: boolean;
    }>();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const entry of entries || []) {
      const existing = featureAreaMap.get(entry.feature_area);
      const lastIndexed = entry.last_indexed ? new Date(entry.last_indexed) : null;
      const isStale = !lastIndexed || lastIndexed < sevenDaysAgo;

      if (existing) {
        existing.routes.push(entry.route);
        // Keep the most recent last_indexed
        if (lastIndexed && (!existing.last_indexed || lastIndexed > new Date(existing.last_indexed))) {
          existing.last_indexed = entry.last_indexed;
          existing.is_stale = isStale;
        }
      } else {
        featureAreaMap.set(entry.feature_area, {
          feature_area: entry.feature_area,
          routes: [entry.route],
          last_indexed: entry.last_indexed,
          is_stale: isStale
        });
      }
    }

    const feature_areas = Array.from(featureAreaMap.values()).sort((a, b) =>
      a.feature_area.localeCompare(b.feature_area)
    );

    return res.status(200).json({
      feature_areas,
      needs_migration: false
    });

  } catch (error: any) {
    console.error('Codebase index fetch error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
