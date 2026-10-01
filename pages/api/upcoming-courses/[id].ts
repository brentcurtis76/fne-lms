import { NextApiRequest, NextApiResponse } from 'next';
import { requireVerifiedRole } from '../../../lib/api-auth';
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
      // Public detail matches the public list: inactive (unpublished) entries
      // are not disclosed by guessing an id. Admins read them via /admin.
      .eq('is_active', true)
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
    // Verified caller with an active admin role. Never `user_metadata`: a
    // signed-in user can write their own metadata, so it is not authority.
    const auth = await requireVerifiedRole(req, res, ['admin'], 'Solo administradores pueden editar cursos próximos');
    if (!auth.user) {
      return res.status(auth.status).json(auth.body);
    }
    const caller = auth.user;

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
    // Verified caller with an active admin role. Never `user_metadata`: a
    // signed-in user can write their own metadata, so it is not authority.
    const auth = await requireVerifiedRole(req, res, ['admin'], 'Solo administradores pueden eliminar cursos próximos');
    if (!auth.user) {
      return res.status(auth.status).json(auth.body);
    }
    const caller = auth.user;

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
