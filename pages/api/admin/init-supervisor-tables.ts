import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Test if tables exist by trying to query them
    const { error: testError } = await supabaseAdmin
      .from('redes_de_colegios')
      .select('id')
      .limit(1);

    if (testError && testError.code === '42P01') {
      // Table doesn't exist
      return res.status(200).json({ 
        success: false,
        message: 'Tables do not exist. Please apply the migration manually via Supabase Dashboard.',
        instructions: [
          '1. Go to your Supabase Dashboard',
          '2. Navigate to SQL Editor',
          '3. Copy and run the contents of /database/add-supervisor-de-red-role.sql',
          '4. After running, refresh this page and try creating a network again'
        ]
      });
    }

    // Tables exist - test creating a network
    const testNetwork = {
      name: `Test Network ${Date.now()}`,
      description: 'Test network to verify setup',
      created_by: '4ae17b21-8977-425c-b05a-ca7cdb8b9df5',
      last_updated_by: '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'
    };

    const { data, error: createError } = await supabaseAdmin
      .from('redes_de_colegios')
      .insert(testNetwork)
      .select()
      .single();

    if (createError) {
      return res.status(200).json({ 
        success: false,
        message: 'Tables exist but cannot create networks',
        error: createError.message
      });
    }

    // Clean up test network
    if (data) {
      await supabaseAdmin
        .from('redes_de_colegios')
        .delete()
        .eq('id', data.id);
    }

    return res.status(200).json({ 
      success: true,
      message: 'Network tables are properly configured and working!'
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Failed to check tables',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}