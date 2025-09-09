import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const supabase = createPagesServerClient({ req, res });

  try {
    // Get a school record to see what type the ID actually is
    const { data: schools, error } = await supabase
      .from('schools')
      .select('id, name')
      .limit(3);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Check the actual type of the ID
    const results = schools?.map(school => ({
      id: school.id,
      id_type: typeof school.id,
      is_number: typeof school.id === 'number',
      is_string: typeof school.id === 'string',
      looks_like_uuid: typeof school.id === 'string' && school.id.includes('-'),
      name: school.name
    }));

    return res.status(200).json({
      message: 'School ID type check',
      results,
      raw_first_school: schools?.[0]
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}