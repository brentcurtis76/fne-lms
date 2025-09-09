import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const supabase = createPagesServerClient({ req, res });

  try {
    // Get the schema information for the generations table
    const { data: columns, error: columnsError } = await supabase.rpc('get_table_columns', {
      table_name: 'generations'
    }).single();

    if (columnsError) {
      // Try a different approach - query the information schema directly
      const { data: schemaInfo, error: schemaError } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, column_default')
        .eq('table_name', 'generations')
        .eq('table_schema', 'public');

      if (schemaError) {
        // Final fallback - try to get a sample row
        const { data: sample, error: sampleError } = await supabase
          .from('generations')
          .select('*')
          .limit(1);

        return res.status(200).json({
          message: 'Could not get schema directly, here is a sample row',
          sample,
          sampleError
        });
      }

      return res.status(200).json({
        message: 'Schema from information_schema',
        columns: schemaInfo
      });
    }

    return res.status(200).json({
      message: 'Schema from RPC',
      columns
    });
  } catch (error: any) {
    console.error('Test schema error:', error);
    return res.status(500).json({ error: error.message });
  }
}