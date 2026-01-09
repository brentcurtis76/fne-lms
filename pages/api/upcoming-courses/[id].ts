import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID inválido' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, id);
  }

  if (req.method === 'PUT') {
    return handlePut(req, res, id);
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res, id);
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

// GET: Get single upcoming course
async function handleGet(req: NextApiRequest, res: NextApiResponse, id: string) {
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
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Curso próximo no encontrado' });
      }
      console.error('[Upcoming Courses API] Error fetching:', error);
      return res.status(500).json({ error: 'Error al obtener curso próximo' });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('[Upcoming Courses API] Error:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}

// PUT: Update upcoming course (admin only)
async function handlePut(req: NextApiRequest, res: NextApiResponse, id: string) {
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
      return res.status(403).json({ error: 'Solo administradores pueden editar cursos próximos' });
    }

    const { title, description, instructor_id, thumbnail_url, estimated_release_date, display_order, is_active } = req.body;

    if (title !== undefined && title.trim() === '') {
      return res.status(400).json({ error: 'El título no puede estar vacío' });
    }

    // Build update object with only provided fields
    const updateData: Record<string, any> = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (instructor_id !== undefined) updateData.instructor_id = instructor_id || null;
    if (thumbnail_url !== undefined) updateData.thumbnail_url = thumbnail_url?.trim() || null;
    if (estimated_release_date !== undefined) updateData.estimated_release_date = estimated_release_date || null;
    if (display_order !== undefined) updateData.display_order = display_order;
    if (is_active !== undefined) updateData.is_active = is_active;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    // Use service role for update
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('upcoming_courses')
      .update(updateData)
      .eq('id', id)
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
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Curso próximo no encontrado' });
      }
      console.error('[Upcoming Courses API] Error updating:', error);
      return res.status(500).json({ error: 'Error al actualizar curso próximo' });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('[Upcoming Courses API] Error:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}

// DELETE: Delete upcoming course (admin only)
async function handleDelete(req: NextApiRequest, res: NextApiResponse, id: string) {
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
      return res.status(403).json({ error: 'Solo administradores pueden eliminar cursos próximos' });
    }

    // Use service role for delete
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from('upcoming_courses')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Upcoming Courses API] Error deleting:', error);
      return res.status(500).json({ error: 'Error al eliminar curso próximo' });
    }

    return res.status(200).json({ success: true, message: 'Curso próximo eliminado' });
  } catch (error) {
    console.error('[Upcoming Courses API] Error:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}
