import { NextApiRequest, NextApiResponse } from 'next';
import { requireVerifiedRole } from '../../../lib/api-auth';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET: List ALL upcoming courses for admin (including inactive)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Verified caller with an active admin role. Never `user_metadata`: a
    // signed-in user can write their own metadata, so it is not authority.
    const auth = await requireVerifiedRole(req, res, ['admin']);
    if (auth.status === 401) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    if (auth.status === 403) {
      return res.status(403).json({ error: 'Solo administradores pueden acceder a esta página' });
    }
    if (auth.status === 500) {
      return res.status(500).json({ error: 'Error del servidor' });
    }
    const caller = auth.user;

    // Use service role to fetch all courses (including inactive)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('upcoming_courses')
      .select(`
        id,
        title,
        description,
        instructor_id,
        thumbnail_url,
        estimated_release_date,
        display_order,
        is_active,
        created_at,
        updated_at,
        created_by,
        instructor:instructors(id, full_name)
      `)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      // Handle case where table doesn't exist yet
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[Upcoming Courses Admin API] Table does not exist yet');
        return res.status(200).json([]);
      }
      console.error('[Upcoming Courses Admin API] Error fetching:', error);
      return res.status(500).json({ error: 'Error al obtener cursos próximos' });
    }

    return res.status(200).json(data || []);
  } catch (error) {
    console.error('[Upcoming Courses Admin API] Error:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}
