import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[Public News API] Request received:', { method: req.method, url: req.url });
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create service role client to bypass RLS for published articles
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[Public News API] Fetching published articles...');

    // First try simple query without join to debug
    console.log('[Public News API] Testing simple query first...');
    const { data: simpleData, error: simpleError } = await supabase
      .from('news_articles')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (simpleError) {
      console.error('[Public News API] Simple query failed:', simpleError);
      return res.status(500).json({ error: 'Error al cargar las noticias' });
    }

    console.log(`[Public News API] Simple query worked: ${simpleData?.length || 0} articles`);

    // Now try with author join
    console.log('[Public News API] Testing query with author join...');
    const { data, error } = await supabase
      .from('news_articles')
      .select(`
        *,
        author:profiles!author_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Public News API] Database error:', {
        code: error.code,
        message: error.message,
        details: error.details
      });
      return res.status(500).json({ error: 'Error al cargar las noticias' });
    }

    console.log(`[Public News API] Successfully fetched ${data?.length || 0} articles`);
    
    if (data && data.length > 0) {
      console.log(`[Public News API] First article: "${data[0].title}"`);
    }

    return res.status(200).json(data || []);
  } catch (error) {
    console.error('[Public News API] Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}