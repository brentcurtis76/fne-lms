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
  logApiRequest(req, 'admin-context-questions-index');

  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  return handleMethodNotAllowed(res, ['GET', 'POST']);
}

// ============================================================
// GET — list all context questions ordered by display_order
// ============================================================

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden listar preguntas de contexto', 403);
  }

  try {
    const serviceClient = createServiceRoleClient();

    const { data: questions, error: dbError } = await serviceClient
      .from('context_general_questions')
      .select('*')
      .order('display_order', { ascending: true });

    if (dbError) {
      console.error('Error fetching context questions:', dbError);
      return res.status(500).json({ error: 'Error al obtener preguntas de contexto' });
    }

    return res.status(200).json({
      success: true,
      questions: questions ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Unexpected error fetching context questions:', message);
    return res.status(500).json({ error: 'Error inesperado al listar preguntas de contexto' });
  }
}

// ============================================================
// POST — create a new context question
// ============================================================

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden crear preguntas de contexto', 403);
  }

  try {
    const body = req.body as SaveContextQuestionRequest;

    // Validation
    const trimmedText = typeof body.question_text === 'string' ? body.question_text.trim() : '';
    if (!trimmedText) {
      return res.status(400).json({ error: 'question_text es requerido' });
    }
    if (trimmedText.length > 500) {
      return res.status(400).json({ error: 'question_text no puede exceder 500 caracteres' });
    }

    if (!body.question_type) {
      return res.status(400).json({ error: 'question_type es requerido' });
    }

    const validTypes = ['text', 'number', 'select', 'multiselect', 'boolean', 'scale', 'textarea'];
    if (!validTypes.includes(body.question_type)) {
      return res.status(400).json({ error: 'question_type inválido' });
    }

    // Validate options for select/multiselect types
    if (['select', 'multiselect'].includes(body.question_type)) {
      if (!body.options || !Array.isArray(body.options) || body.options.length < 2) {
        return res.status(400).json({ error: 'Las preguntas de tipo select/multiselect requieren al menos 2 opciones' });
      }
    }

    // Auto-generate question_key if not provided (collision-safe)
    const questionKey = body.question_key
      || `custom_q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const serviceClient = createServiceRoleClient();

    const { data: question, error: insertError } = await serviceClient
      .from('context_general_questions')
      .insert({
        question_key: questionKey,
        question_text: trimmedText,
        question_type: body.question_type,
        options: body.options ?? null,
        placeholder: body.placeholder ?? null,
        help_text: body.help_text ?? null,
        is_required: body.is_required ?? false,
        is_active: body.is_active ?? true,
        display_order: body.display_order ?? 0,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('Error creating context question:', insertError);

      // Unique constraint violation on question_key
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'Ya existe una pregunta con esta clave (question_key)' });
      }

      return res.status(500).json({ error: 'Error al crear la pregunta de contexto' });
    }

    return res.status(201).json({
      success: true,
      question,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Unexpected error creating context question:', message);
    return res.status(500).json({ error: 'Error inesperado al crear pregunta de contexto' });
  }
}
