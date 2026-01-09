import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

/**
 * PUT /api/transformation/assessments/[id]/responses
 *
 * Saves form responses to the assessment's context_metadata field.
 * This enables server-side auto-save for the progressive form UI.
 *
 * Request body:
 * {
 *   responses: Record<string, {
 *     response: string;
 *     suggestedLevel?: number;
 *     confirmedLevel?: number;
 *     lastUpdated: string;
 *   }>
 * }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (req.method === 'GET') {
    // GET: Load saved responses
    const supabase = createPagesServerClient({ req, res });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID de evaluación requerido' });
    }

    const { data, error } = await supabase
      .from('transformation_assessments')
      .select('context_metadata')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[transformation/get-responses] error', error);
      return res.status(400).json({ error: error.message ?? 'No se pudieron cargar las respuestas' });
    }

    const responses = data?.context_metadata?.responses || {};
    return res.status(200).json({ responses });
  }

  if (req.method === 'PUT') {
    // PUT: Save responses
    const supabase = createPagesServerClient({ req, res });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Validate UUID format
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID de evaluación requerido' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'ID de evaluación inválido' });
    }

    // Validate request body
    const { responses } = req.body ?? {};
    console.log('[API PUT] Received responses:', Object.keys(responses || {}).length, 'responses');
    console.log('[API PUT] Response keys:', Object.keys(responses || {}));

    if (!responses || typeof responses !== 'object') {
      return res.status(400).json({ error: 'Debes enviar el campo "responses"' });
    }

    // Validate responses structure
    for (const [key, value] of Object.entries(responses)) {
      if (!value || typeof value !== 'object') {
        return res.status(400).json({ error: 'Formato de respuestas inválido' });
      }
      const response = value as any;
      if (typeof response.response !== 'string') {
        return res.status(400).json({ error: 'Cada respuesta debe tener un campo "response" de tipo texto' });
      }
    }

    try {
      // First, fetch the current context_metadata to merge (not overwrite)
      const { data: currentData, error: fetchError } = await supabase
        .from('transformation_assessments')
        .select('context_metadata')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('[transformation/save-responses] fetch error', fetchError);
        return res.status(400).json({ error: 'No se pudo cargar la evaluación' });
      }

      // Merge responses into existing context_metadata
      const currentMetadata = currentData?.context_metadata || {};
      console.log('[API PUT] Current metadata responses:', Object.keys(currentMetadata?.responses || {}).length);

      const updatedMetadata = {
        ...currentMetadata,
        responses, // This replaces only the responses key, preserving conversation_summaries, etc.
      };

      console.log('[API PUT] Updated metadata responses:', Object.keys(updatedMetadata?.responses || {}).length);
      console.log('[API PUT] About to save to database...');

      // Update with merged metadata
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('transformation_assessments')
        .update({
          context_metadata: updatedMetadata,
          updated_at: now,
        })
        .eq('id', id)
        .select('id, updated_at')
        .single();

      if (error) {
        console.error('[transformation/save-responses] update error', error);
        // Translate common Supabase errors to Spanish
        let errorMessage = 'No se pudieron guardar las respuestas';
        if (error.message?.includes('violates row-level security')) {
          errorMessage = 'No tienes permiso para modificar esta evaluación';
        } else if (error.message?.includes('not found')) {
          errorMessage = 'Evaluación no encontrada';
        }
        return res.status(400).json({ error: errorMessage });
      }

      console.log('[API PUT] Successfully saved to database!');

      return res.status(200).json({
        success: true,
        assessmentId: data.id,
        updatedAt: data.updated_at
      });
    } catch (err) {
      console.error('[transformation/save-responses] unexpected error', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  // Method not allowed
  res.setHeader('Allow', ['GET', 'PUT']);
  return res.status(405).json({ error: 'Método no permitido' });
}
