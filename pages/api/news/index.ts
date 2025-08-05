import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create service role client to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get query parameters
    const { published_only = 'true', limit = '20', offset = '0' } = req.query;

    // Simple query without join - just get the articles
    let query = supabase
      .from('news_articles')
      .select('id, title, slug, content_html, featured_image, is_published, created_at, updated_at, author_id')
      .order('created_at', { ascending: false })
      .limit(Number(limit))
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    // Filter by published status for non-admins
    if (published_only === 'true') {
      query = query.eq('is_published', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[News API] Database error:', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }

    // Add mock author data to maintain frontend compatibility
    const articlesWithAuthor = data?.map(article => ({
      ...article,
      author: {
        id: article.author_id,
        full_name: 'Administrador FNE',
        avatar_url: null
      }
    })) || [];

    // Get total count for pagination
    const countQuery = published_only === 'true' 
      ? supabase.from('news_articles').select('id', { count: 'exact' }).eq('is_published', true)
      : supabase.from('news_articles').select('id', { count: 'exact' });
      
    const { count } = await countQuery;

    return res.status(200).json({ 
      articles: articlesWithAuthor,
      total: count || 0
    });
  } catch (error) {
    console.error('[News API] Unexpected error:', error);
    return res.status(500).json({ error: 'Server error', details: error instanceof Error ? error.message : 'Unknown error' });
  }
}