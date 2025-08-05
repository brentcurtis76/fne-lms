import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create service role client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Simple query without join - just get the articles
    const { data, error } = await supabase
      .from('news_articles')
      .select('id, title, slug, content_html, featured_image, created_at, author_id')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[News API] Error:', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }

    // Add mock author data for now to maintain frontend compatibility
    const articlesWithAuthor = data?.map(article => ({
      ...article,
      author: {
        id: article.author_id,
        first_name: 'Admin',
        last_name: 'FNE',
        avatar_url: null
      }
    })) || [];

    return res.status(200).json(articlesWithAuthor);
  } catch (error) {
    console.error('[News API] Unexpected error:', error);
    return res.status(500).json({ error: 'Server error', details: error instanceof Error ? error.message : 'Unknown error' });
  }
}