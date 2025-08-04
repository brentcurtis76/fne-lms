import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient({ req, res });

  if (req.method === 'GET') {
    try {
      // Get query parameters
      const { published_only = 'true', limit = '20', offset = '0' } = req.query;
      
      let query = supabase
        .from('news_articles')
        .select(`
          id,
          title,
          slug,
          content_html,
          featured_image,
          is_published,
          created_at,
          updated_at,
          author:profiles!author_id (
            id,
            full_name,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false })
        .limit(Number(limit))
        .range(Number(offset), Number(offset) + Number(limit) - 1);

      // Filter by published status for non-admins
      if (published_only === 'true') {
        query = query.eq('is_published', true);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching news:', error);
        return res.status(500).json({ error: 'Error al cargar las noticias' });
      }

      // Get total count for pagination
      const countQuery = published_only === 'true' 
        ? supabase.from('news_articles').select('id', { count: 'exact' }).eq('is_published', true)
        : supabase.from('news_articles').select('id', { count: 'exact' });
        
      const { count } = await countQuery;

      return res.status(200).json({ 
        articles: data || [],
        total: count || 0
      });
    } catch (error) {
      console.error('Error in news API:', error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}