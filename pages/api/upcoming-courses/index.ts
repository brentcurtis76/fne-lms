import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface UpcomingCourse {
  id: string;
  title: string;
  description: string | null;
  instructor_id: string | null;
  thumbnail_url: string | null;
  estimated_release_date: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  instructor?: {
    id: string;
    full_name: string;
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

// GET: List all active upcoming courses (public)
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
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
        instructor:instructors(id, full_name)
      `)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('estimated_release_date', { ascending: true, nullsFirst: false });

    if (error) {
      // Handle case where table doesn't exist yet
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[Upcoming Courses API] Table does not exist yet');
        return res.status(200).json([]);
      }
      console.error('[Upcoming Courses API] Error fetching:', error);
      return res.status(500).json({ error: 'Error al obtener cursos próximos' });
    }

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

    return res.status(200).json(data || []);
  } catch (error) {
    console.error('[Upcoming Courses API] Error:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST: Create new upcoming course (admin only)
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
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
      return res.status(403).json({ error: 'Solo administradores pueden crear cursos próximos' });
    }

    const { title, description, instructor_id, thumbnail_url, estimated_release_date, display_order } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'El título es requerido' });
    }

    // Use service role for insert
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('upcoming_courses')
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        instructor_id: instructor_id || null,
        thumbnail_url: thumbnail_url?.trim() || null,
        estimated_release_date: estimated_release_date || null,
        display_order: display_order || 0,
        is_active: true,
        created_by: session.user.id
      })
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
        instructor:instructors(id, full_name)
      `)
      .single();

    if (error) {
      console.error('[Upcoming Courses API] Error creating:', error);
      return res.status(500).json({ error: 'Error al crear curso próximo' });
    }

    return res.status(201).json(data);
  } catch (error) {
    console.error('[Upcoming Courses API] Error:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}
