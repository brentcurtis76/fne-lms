import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const supabase = createPagesServerClient({ req, res });

  try {
    // Get all schools
    const { data: schools, error } = await supabase
      .from('schools')
      .select('*')
      .limit(5);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Analyze the IDs
    const analysis = schools?.map(school => ({
      id: school.id,
      name: school.name,
      id_type: typeof school.id,
      id_length: school.id?.toString().length,
      looks_like_uuid: typeof school.id === 'string' && school.id.includes('-'),
      looks_like_int: typeof school.id === 'number' || (typeof school.id === 'string' && /^\d+$/.test(school.id))
    }));

    return res.status(200).json({
      schools_count: schools?.length || 0,
      analysis,
      raw_sample: schools?.[0]
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}