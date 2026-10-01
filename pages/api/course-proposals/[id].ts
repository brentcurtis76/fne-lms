import { NextApiRequest, NextApiResponse } from 'next';
import { requireVerifiedRole } from '../../../lib/api-auth';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID de propuesta requerido' });
  }

  if (req.method === 'PUT') {
    return handlePut(req, res, id);
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res, id);
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

// PUT: Update a course proposal (only owner can update)
async function handlePut(req: NextApiRequest, res: NextApiResponse, id: string) {
  try {
    // Verified caller with an active admin or consultor role. Never
    // `user_metadata`: a signed-in user can write their own metadata.
    const auth = await requireVerifiedRole(req, res, ['admin', 'consultor'], 'Solo administradores y consultores pueden editar propuestas');
    if (!auth.user) {
      return res.status(auth.status).json(auth.body);
    }
    const caller = auth.user;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user owns this proposal
    const { data: existing } = await supabaseAdmin
      .from('course_proposals')
      .select('created_by')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Propuesta no encontrada' });
    }

    if (existing.created_by !== caller.id) {
      return res.status(403).json({ error: 'Solo puedes editar tus propias propuestas' });
    }

    const {
      titulo,
      descripcion_corta,
      competencias_desarrollar,
      tiempo_requerido_desarrollo,
      necesita_ayuda_diseno_instruccional
    } = req.body;

    // Validate required fields
    if (!titulo || titulo.trim() === '') {
      return res.status(400).json({ error: 'El título es requerido' });
    }
    if (!descripcion_corta || descripcion_corta.trim() === '') {
      return res.status(400).json({ error: 'La descripción es requerida' });
    }
    if (!competencias_desarrollar || competencias_desarrollar.trim() === '') {
      return res.status(400).json({ error: 'Las competencias a desarrollar son requeridas' });
    }
    if (!tiempo_requerido_desarrollo || tiempo_requerido_desarrollo.trim() === '') {
      return res.status(400).json({ error: 'El tiempo requerido es requerido' });
    }

    const { data, error } = await supabaseAdmin
      .from('course_proposals')
      .update({
        titulo: titulo.trim(),
        descripcion_corta: descripcion_corta.trim(),
        competencias_desarrollar: competencias_desarrollar.trim(),
        tiempo_requerido_desarrollo: tiempo_requerido_desarrollo.trim(),
        necesita_ayuda_diseno_instruccional: necesita_ayuda_diseno_instruccional || false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        id,
        titulo,
        descripcion_corta,
        competencias_desarrollar,
        tiempo_requerido_desarrollo,
        necesita_ayuda_diseno_instruccional,
        created_by,
        created_at,
        updated_at,
        status
      `)
      .single();

    if (error) {
      console.error('[Course Proposals API] Error updating:', error);
      return res.status(500).json({ error: 'Error al actualizar propuesta' });
    }

    // Fetch creator profile
    if (data) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, email')
        .eq('id', data.created_by)
        .single();
      (data as any).creator = profile || null;
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[Course Proposals API] Error:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}

// DELETE: Delete a course proposal (only owner can delete)
async function handleDelete(req: NextApiRequest, res: NextApiResponse, id: string) {
  try {
    // Verified caller with an active admin or consultor role. Never
    // `user_metadata`: a signed-in user can write their own metadata.
    const auth = await requireVerifiedRole(req, res, ['admin', 'consultor'], 'Solo administradores y consultores pueden eliminar propuestas');
    if (!auth.user) {
      return res.status(auth.status).json(auth.body);
    }
    const caller = auth.user;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user owns this proposal
    const { data: existing } = await supabaseAdmin
      .from('course_proposals')
      .select('created_by')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Propuesta no encontrada' });
    }

    if (existing.created_by !== caller.id) {
      return res.status(403).json({ error: 'Solo puedes eliminar tus propias propuestas' });
    }

    const { error } = await supabaseAdmin
      .from('course_proposals')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Course Proposals API] Error deleting:', error);
      return res.status(500).json({ error: 'Error al eliminar propuesta' });
    }

    return res.status(200).json({ success: true, message: 'Propuesta eliminada' });
  } catch (error) {
    console.error('[Course Proposals API] Error:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}
