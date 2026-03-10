import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  handleMethodNotAllowed,
  logApiRequest,
} from '@/lib/api-auth';
import type { SaveContextQuestionRequest } from '@/types/assessment-builder';

// ============================================================
// Main handler
// ============================================================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin-context-questions-by-id');

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return sendAuthError(res, 'ID inválido', 400);
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return sendAuthError(res, 'ID debe ser un UUID válido', 400);
  }

  if (req.method === 'PUT') {
    return handlePut(req, res, id);
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res, id);
  }

  return handleMethodNotAllowed(res, ['PUT', 'DELETE']);
}

// ============================================================
// PUT — update a context question
// ============================================================

async function handlePut(req: NextApiRequest, res: NextApiResponse, questionId: string) {
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden actualizar preguntas de contexto', 403);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const body = req.body as Partial<SaveContextQuestionRequest>;

    // Verify the question exists and check if structural
    const { data: existing, error: fetchError } = await serviceClient
      .from('context_general_questions')
      .select('id, widget_type, structural_key')
      .eq('id', questionId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Pregunta de contexto no encontrada' });
    }

    const isStructural = existing.widget_type && existing.widget_type !== 'generic';

    // Structural questions: block changes to question_type, question_key, widget_type, structural_key
    if (isStructural) {
      if (body.question_type !== undefined) {
        return res.status(400).json({ error: 'No se puede cambiar el tipo de una pregunta estructural' });
      }
      if ((body as any).widget_type !== undefined || (body as any).structural_key !== undefined) {
        return res.status(400).json({ error: 'No se puede modificar widget_type o structural_key de una pregunta estructural' });
      }
      if (body.question_key !== undefined) {
        return res.status(400).json({ error: 'No se puede cambiar la clave de una pregunta estructural' });
      }
    }

    // Validate question_type if provided
    if (body.question_type) {
      const validTypes = ['text', 'number', 'select', 'multiselect', 'boolean', 'scale', 'textarea'];
      if (!validTypes.includes(body.question_type)) {
        return res.status(400).json({ error: 'question_type inválido' });
      }
    }

    // Validate question_text if provided
    if (body.question_text !== undefined) {
      const trimmed = typeof body.question_text === 'string' ? body.question_text.trim() : '';
      if (!trimmed) {
        return res.status(400).json({ error: 'El texto de la pregunta es requerido' });
      }
      if (trimmed.length > 500) {
        return res.status(400).json({ error: 'El texto de la pregunta no puede superar 500 caracteres' });
      }
    }

    // Validate options for select/multiselect
    const effectiveType = body.question_type || (existing as any).question_type;
    if (['select', 'multiselect'].includes(effectiveType) && body.options !== undefined) {
      if (!Array.isArray(body.options) || body.options.length < 2) {
        return res.status(400).json({ error: 'Las preguntas de tipo select/multiselect requieren al menos 2 opciones' });
      }
    }

    // Build update payload with only provided fields (never include widget_type/structural_key)
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (!isStructural && body.question_key !== undefined) updatePayload.question_key = body.question_key;
    if (body.question_text !== undefined) updatePayload.question_text = body.question_text;
    if (!isStructural && body.question_type !== undefined) updatePayload.question_type = body.question_type;
    if (body.options !== undefined) updatePayload.options = body.options;
    if (body.placeholder !== undefined) updatePayload.placeholder = body.placeholder;
    if (body.help_text !== undefined) updatePayload.help_text = body.help_text;
    if (body.is_required !== undefined) updatePayload.is_required = body.is_required;
    if (body.is_active !== undefined) updatePayload.is_active = body.is_active;
    if (body.display_order !== undefined) updatePayload.display_order = body.display_order;

    const { data: question, error: updateError } = await serviceClient
      .from('context_general_questions')
      .update(updatePayload)
      .eq('id', questionId)
      .select('*')
      .single();

    if (updateError) {
      console.error('Error updating context question:', updateError);

      // Unique constraint violation on question_key
      if (updateError.code === '23505') {
        return res.status(409).json({ error: 'Ya existe una pregunta con esta clave (question_key)' });
      }

      return res.status(500).json({ error: 'Error al actualizar la pregunta de contexto' });
    }

    return res.status(200).json({
      success: true,
      question,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Unexpected error updating context question:', message);
    return res.status(500).json({ error: 'Error inesperado al actualizar pregunta de contexto' });
  }
}

// ============================================================
// DELETE — soft-delete a context question (set is_active=false)
// ============================================================

async function handleDelete(req: NextApiRequest, res: NextApiResponse, questionId: string) {
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden eliminar preguntas de contexto', 403);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Verify the question exists
    const { data: existing, error: fetchError } = await serviceClient
      .from('context_general_questions')
      .select('id, is_active, widget_type')
      .eq('id', questionId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Pregunta de contexto no encontrada' });
    }

    // Structural questions cannot be deactivated
    if (existing.widget_type && existing.widget_type !== 'generic') {
      return res.status(400).json({ error: 'Las preguntas estructurales no pueden ser desactivadas' });
    }

    if (!existing.is_active) {
      return res.status(400).json({ error: 'Esta pregunta ya está desactivada' });
    }

    const { data: question, error: updateError } = await serviceClient
      .from('context_general_questions')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', questionId)
      .select('*')
      .single();

    if (updateError) {
      console.error('Error soft-deleting context question:', updateError);
      return res.status(500).json({ error: 'Error al desactivar la pregunta de contexto' });
    }

    return res.status(200).json({
      success: true,
      question,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Unexpected error soft-deleting context question:', message);
    return res.status(500).json({ error: 'Error inesperado al desactivar pregunta de contexto' });
  }
}
