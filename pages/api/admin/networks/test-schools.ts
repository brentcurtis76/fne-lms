/**
 * Simplified test endpoint to debug school fetching
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create service role client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Simple query for schools
    const { data: schools, error } = await supabaseAdmin
      .from('schools')
      .select('*');

    if (error) {
      return res.status(500).json({ 
        error: 'Database query failed',
        details: error.message,
        code: error.code
      });
    }

    return res.status(200).json({
      success: true,
      schools: schools || [],
      count: schools?.length || 0
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}