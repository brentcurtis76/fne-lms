import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET: List ALL upcoming courses for admin (including inactive)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Check authentication
    const supabaseClient = createPagesServerClient({ req, res });
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Check if user is admin from metadata
    const userRoles = session.user?.user_metadata?.roles || [];
    let isAdmin = userRoles.includes('admin');

    // Fallback: check user_roles table if not admin from metadata
    if (!isAdmin) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: adminRoles } = await supabaseAdmin
        .from('user_roles')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('role_type', 'admin')
        .eq('is_active', true)
        .limit(1);

      if (adminRoles && adminRoles.length > 0) {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Solo administradores pueden acceder a esta página' });
    }

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
