import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID de evaluación no válido' });
  }

  const { context_metadata } = req.body;
  if (!context_metadata) {
    return res.status(400).json({ error: 'Se requiere context_metadata' });
  }

  try {
    // First, fetch existing assessment to get current context_metadata
    const { data: existing, error: fetchError } = await supabase
      .from('transformation_assessments')
      .select('id, context_metadata, status, updated_at')
      .eq('id', id)
      .single();

    if (fetchError) {
      // Check if error is "not found"
      if (fetchError.code === 'PGRST116' || fetchError.message.includes('0 rows')) {
        return res.status(404).json({ error: 'Evaluación no encontrada' });
      }
      console.error('[transformation/update-assessment] fetch error', fetchError);
      return res.status(500).json({ error: 'Error al buscar la evaluación' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    // Prevent updates to completed/finalized assessments
    console.log('🔍 Status check:', {
      existingStatus: existing.status,
      isCompleted: existing.status === 'completed',
      willBlock: existing.status === 'completed'
    });

    if (existing.status === 'completed') {
      console.log('🚫 Blocking edit on completed assessment');
      return res.status(400).json({
        error: 'No se puede modificar una evaluación finalizada',
        message: 'Las evaluaciones completadas no pueden ser editadas. Por favor, crea una nueva evaluación.'
      });
    }

    // Merge new context_metadata with existing data to prevent data loss
    const mergedMetadata = {
      ...(existing.context_metadata || {}),
      ...context_metadata,
    };

    const now = new Date().toISOString();

    // Update with merged metadata
    const { data, error } = await supabase
      .from('transformation_assessments')
      .update({
        context_metadata: mergedMetadata,
        updated_at: now,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[transformation/update-assessment] update error', error);
      return res.status(500).json({ error: 'Error al actualizar la evaluación' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    // Return the updated assessment object
    return res.status(200).json(data);
  } catch (err) {
    console.error('[transformation/update-assessment] unexpected error', err);
    return res.status(500).json({ error: 'Error inesperado al actualizar la evaluación' });
  }
}
