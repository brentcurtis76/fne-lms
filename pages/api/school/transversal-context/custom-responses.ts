import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import type { SaveContextResponsesRequest, ContextGeneralResponse } from '@/types/assessment-builder';

// ============================================================
// Permission check — reuses the hasDirectivoPermission pattern
// ============================================================

async function hasDirectivoPermission(
  supabaseClient: any,
  userId: string,
  schoolId?: number
): Promise<{ hasPermission: boolean; schoolId: number | null; isAdmin: boolean }> {
  // Check for admin/consultor first
  const { data: roles } = await supabaseClient
    .from('user_roles')
    .select('role_type, school_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) {
    return { hasPermission: false, schoolId: null, isAdmin: false };
  }

  const isActualAdmin = roles.some((r: any) => r.role_type === 'admin');

  if (isActualAdmin) {
    // Admin can access any school, but needs a school_id to be specified
    return { hasPermission: true, schoolId: schoolId || null, isAdmin: true };
  }

  // Consultor: must validate against consultant_assignments
  const isConsultor = roles.some((r: any) => r.role_type === 'consultor');
  if (isConsultor) {
    const { data: assignments } = await supabaseClient
      .from('consultant_assignments')
      .select('school_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (!assignments || assignments.length === 0) {
      return { hasPermission: false, schoolId: null, isAdmin: false };
    }

    const assignedSchoolIds = assignments.map((a: any) => a.school_id);

    if (schoolId && !assignedSchoolIds.includes(schoolId)) {
      return { hasPermission: false, schoolId: null, isAdmin: false };
    }

    return { hasPermission: true, schoolId: schoolId || assignments[0].school_id, isAdmin: false };
  }

  // Check for directivo role
  const directivoRole = roles.find((r: any) => r.role_type === 'equipo_directivo');
  if (directivoRole) {
    // If schoolId is specified, verify it matches
    if (schoolId && directivoRole.school_id !== schoolId) {
      return { hasPermission: false, schoolId: null, isAdmin: false };
    }
    return { hasPermission: true, schoolId: directivoRole.school_id, isAdmin: false };
  }

  return { hasPermission: false, schoolId: null, isAdmin: false };
}

// ============================================================
// Main handler
// ============================================================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  // Use service role client for reliable permission checks (bypasses RLS)
  const serviceClient = createServiceRoleClient();

  // Get school_id from query for GET, or from body for POST
  const rawQuerySchoolId = req.query.school_id ? parseInt(req.query.school_id as string) : undefined;
  const rawBodySchoolId = req.body?.school_id ? parseInt(req.body.school_id) : undefined;
  const requestedSchoolId = req.method === 'GET' ? rawQuerySchoolId : rawBodySchoolId;

  // Validate school_id is a valid number
  if (requestedSchoolId !== undefined && isNaN(requestedSchoolId)) {
    return res.status(400).json({ error: 'school_id debe ser un número válido' });
  }

  // Permission check
  const { hasPermission, schoolId, isAdmin } = await hasDirectivoPermission(
    serviceClient,
    user.id,
    requestedSchoolId
  );

  if (!hasPermission) {
    return res.status(403).json({
      error: 'Solo directivos y administradores pueden acceder a las respuestas de contexto'
    });
  }

  // For non-admin users, we must have a school_id
  if (!isAdmin && !schoolId) {
    return res.status(400).json({
      error: 'No se encontró escuela asociada al usuario'
    });
  }

  // For admin, require school_id in request
  if (isAdmin && !requestedSchoolId) {
    return res.status(400).json({
      error: 'Se requiere school_id para administradores'
    });
  }

  const effectiveSchoolId = isAdmin ? requestedSchoolId : schoolId;

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, effectiveSchoolId!);
    case 'POST':
      return handlePost(req, res, effectiveSchoolId!, user.id);
    default:
      return handleMethodNotAllowed(res, ['GET', 'POST']);
  }
}

// ============================================================
// GET — fetch custom responses for a specific school
// ============================================================

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  schoolId: number
) {
  try {
    const serviceClient = createServiceRoleClient();

    // Fetch responses joined with question info
    const { data: responses, error: dbError } = await serviceClient
      .from('context_general_responses')
      .select('*, question:context_general_questions(*)')
      .eq('school_id', schoolId);

    if (dbError) {
      console.error('Error fetching custom responses:', dbError);
      return res.status(500).json({ error: 'Error al obtener respuestas de contexto' });
    }

    return res.status(200).json({
      success: true,
      responses: responses ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Unexpected error fetching custom responses:', message);
    return res.status(500).json({ error: 'Error inesperado al obtener respuestas de contexto' });
  }
}

// ============================================================
// POST — save/update custom responses for a school
// ============================================================

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  schoolId: number,
  userId: string
) {
  try {
    const body = req.body as SaveContextResponsesRequest;

    // Validation
    if (!body.responses || !Array.isArray(body.responses) || body.responses.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos una respuesta' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const r of body.responses) {
      if (!r.question_id || typeof r.question_id !== 'string' || !uuidRegex.test(r.question_id)) {
        return res.status(400).json({ error: 'Cada respuesta debe incluir un question_id válido (UUID)' });
      }
    }

    const serviceClient = createServiceRoleClient();

    // Upsert each response
    const upsertRows = body.responses.map((r) => ({
      school_id: schoolId,
      question_id: r.question_id,
      response: r.response,
      responded_by: userId,
      updated_at: new Date().toISOString(),
    }));

    const { data: savedResponses, error: upsertError } = await serviceClient
      .from('context_general_responses')
      .upsert(upsertRows, { onConflict: 'school_id,question_id' })
      .select('*, question:context_general_questions(*)');

    if (upsertError) {
      console.error('Error upserting custom responses:', upsertError);
      return res.status(500).json({ error: 'Error al guardar respuestas de contexto' });
    }

    return res.status(200).json({
      success: true,
      responses: savedResponses ?? [],
      message: 'Respuestas guardadas exitosamente',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Unexpected error saving custom responses:', message);
    return res.status(500).json({ error: 'Error inesperado al guardar respuestas de contexto' });
  }
}
