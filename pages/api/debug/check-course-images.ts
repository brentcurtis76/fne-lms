import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get recent courses
    const { data: courses, error } = await supabase
      .from('courses')
      .select('id, title, thumbnail_url, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Analyze the thumbnail URLs
    const analysis = courses?.map(course => ({
      id: course.id,
      title: course.title,
      thumbnail_url: course.thumbnail_url,
      has_placeholder: course.thumbnail_url === 'https://example.com/default-thumbnail.png',
      has_default: course.thumbnail_url === 'default-thumbnail.png',
      is_null: course.thumbnail_url === null,
      created_at: course.created_at
    }));

    // Count issues
    const stats = {
      total_courses: courses?.length || 0,
      with_placeholder: analysis?.filter(c => c.has_placeholder).length || 0,
      with_default: analysis?.filter(c => c.has_default).length || 0,
      with_null: analysis?.filter(c => c.is_null).length || 0,
      with_valid_url: analysis?.filter(c => !c.has_placeholder && !c.has_default && !c.is_null && c.thumbnail_url).length || 0
    };

    res.status(200).json({
      stats,
      courses: analysis
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}