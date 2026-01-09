import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient({ req, res });
  const { slug } = req.query;

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('news_articles')
        .select(`
          *,
          author:profiles!author_id (
            id,
            full_name,
            avatar_url
          )
        `)
        .eq('slug', slug)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Artículo no encontrado' });
      }

      // Check if article is published or user is admin
      if (!data.is_published) {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          return res.status(404).json({ error: 'Artículo no encontrado' });
        }

        // Check if user is admin/consultor
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('is_active', true);

        const isAdmin = roles?.some(r => ['admin', 'consultor'].includes(r.role));
        
        if (!isAdmin) {
          return res.status(404).json({ error: 'Artículo no encontrado' });
        }
      }

      return res.status(200).json(data);
    } catch (error) {
      console.error('Error fetching article:', error);
      return res.status(500).json({ error: 'Error al cargar el artículo' });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}