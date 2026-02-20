import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  createApiSupabaseClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import { getUserRoles } from '@/utils/roleUtils';
import { UpdateTimelineSchema } from '@/types/licitaciones';
import { getLicitacionDetail, updateTimelineDates } from '@/lib/licitacionService';
import { uuidSchema } from '@/lib/validation/schemas';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-detail');

  const { id } = req.query;

  const idParse = uuidSchema.safeParse(id);
  if (!idParse.success) {
    return sendAuthError(res, 'ID de licitacion invalido', 400);
  }
  const licitacionId = idParse.data;

  switch (req.method) {
    case 'GET':
      return await handleGet(req, res, licitacionId);
    case 'PATCH':
      return await handlePatch(req, res, licitacionId);
    default:
      return handleMethodNotAllowed(res, ['GET', 'PATCH']);
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, licitacionId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'No autorizado', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const roleTypes = userRoles.map(r => r.role_type);
    const isAdmin = roleTypes.includes('admin');
    const isEncargado = roleTypes.includes('encargado_licitacion');

    if (!isAdmin && !isEncargado) {
      return sendAuthError(res, 'No tiene permisos para acceder a licitaciones', 403);
    }

    // Use user-scoped client so RLS filters for encargados
    const supabaseClient = await createApiSupabaseClient(req, res);
    const detail = await getLicitacionDetail(supabaseClient, licitacionId);

    return sendApiResponse(res, { licitacion: detail });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    if (message === 'Licitacion no encontrada') {
      return sendAuthError(res, 'Licitacion no encontrada', 404);
    }
    return sendAuthError(res, 'Error al obtener licitacion', 500, message);
  }
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse, licitacionId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'No autorizado', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const roleTypes = userRoles.map(r => r.role_type);
    const isAdmin = roleTypes.includes('admin');
    const isEncargado = roleTypes.includes('encargado_licitacion');

    if (!isAdmin && !isEncargado) {
      return sendAuthError(res, 'No tiene permisos para modificar licitaciones', 403);
    }

    // Admin can update timeline dates
    if (req.body && req.body.timeline) {
      if (!isAdmin) {
        return sendAuthError(res, 'Solo administradores pueden ajustar las fechas del cronograma', 403);
      }

      const parseResult = UpdateTimelineSchema.safeParse(req.body.timeline);
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return sendAuthError(res, `Fechas invalidas: ${errors}`, 400);
      }

      const updated = await updateTimelineDates(
        serviceClient,
        licitacionId,
        parseResult.data,
        user.id
      );
      return sendApiResponse(res, { licitacion: updated });
    }

    // Build explicit allowlisted update object — never pass raw req.body to .update()
    const updatePayload: Record<string, unknown> = {};

    if (isAdmin) {
      // Admin can update any of these fields
      const adminAllowed = [
        'nombre_licitacion', 'email_licitacion', 'monto_minimo', 'monto_maximo',
        'tipo_moneda', 'duracion_minima', 'duracion_maxima', 'participantes_estimados',
        'modalidad_preferida', 'notas', 'publicacion_imagen_url',
      ];
      for (const key of adminAllowed) {
        if (key in (req.body || {})) {
          updatePayload[key] = req.body[key];
        }
      }
    } else if (isEncargado) {
      // Encargado can only update publicacion_imagen_url
      if ('publicacion_imagen_url' in (req.body || {})) {
        updatePayload.publicacion_imagen_url = req.body.publicacion_imagen_url ?? null;
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return sendAuthError(res, 'Sin campos válidos para actualizar', 400);
    }

    // Use user-scoped client so RLS enforces access
    const supabaseClient = await createApiSupabaseClient(req, res);
    const { data: updated, error: updateError } = await supabaseClient
      .from('licitaciones')
      .update(updatePayload)
      .eq('id', licitacionId)
      .select('*')
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message || 'Error al actualizar licitacion');
    }

    return sendApiResponse(res, { licitacion: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al actualizar licitacion', 500, message);
  }
}
