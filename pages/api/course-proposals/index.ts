import { NextApiRequest, NextApiResponse } from 'next';
import { requireVerifiedRole } from '../../../lib/api-auth';
import { createClient } from '@supabase/supabase-js';
import { CreateCourseProposalInput } from '../../../types/course-proposals';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

// GET: List all course proposals (admin/consultor only)
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verified caller with an active admin or consultor role. Never
    // `user_metadata`: a signed-in user can write their own metadata.
    const auth = await requireVerifiedRole(req, res, ['admin', 'consultor']);
    if (auth.status === 401) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    if (auth.status === 403) {
      return res.status(403).json({ error: 'Solo administradores y consultores pueden ver propuestas' });
    }
    if (auth.status === 500) {
      return res.status(500).json({ error: 'Error del servidor' });
    }
    const caller = auth.user;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabaseAdmin
      .from('course_proposals')
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
      .order('created_at', { ascending: false });

    // Fetch creator profiles separately
    if (data && data.length > 0) {
      const creatorIds = [...new Set(data.map(p => p.created_by))];
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', creatorIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      data.forEach(proposal => {
        (proposal as any).creator = profileMap.get(proposal.created_by) || null;
      });
    }

    if (error) {
      // Handle case where table doesn't exist yet
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[Course Proposals API] Table does not exist yet');
        return res.status(200).json({ success: true, data: [] });
      }
      console.error('[Course Proposals API] Error fetching:', error);
      return res.status(500).json({ error: 'Error al obtener propuestas' });
    }

    return res.status(200).json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[Course Proposals API] Error:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}

// POST: Create new course proposal (admin/consultor only)
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verified caller with an active admin or consultor role. Never
    // `user_metadata`: a signed-in user can write their own metadata.
    const auth = await requireVerifiedRole(req, res, ['admin', 'consultor']);
    if (auth.status === 401) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    if (auth.status === 403) {
      return res.status(403).json({ error: 'Solo administradores y consultores pueden crear propuestas' });
    }
    if (auth.status === 500) {
      return res.status(500).json({ error: 'Error del servidor' });
    }
    const caller = auth.user;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const {
      titulo,
      descripcion_corta,
      competencias_desarrollar,
      tiempo_requerido_desarrollo,
      necesita_ayuda_diseno_instruccional
    }: CreateCourseProposalInput = req.body;

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
      .insert({
        titulo: titulo.trim(),
        descripcion_corta: descripcion_corta.trim(),
        competencias_desarrollar: competencias_desarrollar.trim(),
        tiempo_requerido_desarrollo: tiempo_requerido_desarrollo.trim(),
        necesita_ayuda_diseno_instruccional: necesita_ayuda_diseno_instruccional || false,
        created_by: caller.id,
        status: 'pending'
      })
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
      console.error('[Course Proposals API] Error creating:', error);
      return res.status(500).json({ error: 'Error al crear propuesta' });
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

    return res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('[Course Proposals API] Error:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}
