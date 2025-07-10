import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create authenticated Supabase client
    const supabase = createServerSupabaseClient({ req, res });
    
    // Check if user is authenticated and is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Check admin role
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('role_type', 'admin')
      .single();

    if (!userRole) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Now check for RLS policies
    const results = {
      tablesWithRLS: [],
      policiesWithLegacyReferences: [],
      functionsWithLegacyReferences: []
    };

    // Query 1: Tables with RLS enabled
    const { data: rlsTables } = await supabase.rpc('get_tables_with_rls');
    results.tablesWithRLS = rlsTables || [];

    // Query 2: Policies with legacy references
    const { data: policies } = await supabase.rpc('get_policies_with_legacy_role');
    results.policiesWithLegacyReferences = policies || [];

    // Query 3: Functions with legacy references
    const { data: functions } = await supabase.rpc('get_functions_with_legacy_role');
    results.functionsWithLegacyReferences = functions || [];

    return res.status(200).json({
      success: true,
      data: results,
      summary: {
        tablesWithRLS: results.tablesWithRLS.length,
        policiesWithLegacyReferences: results.policiesWithLegacyReferences.length,
        functionsWithLegacyReferences: results.functionsWithLegacyReferences.length
      }
    });

  } catch (error: any) {
    console.error('Error checking RLS policies:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
}