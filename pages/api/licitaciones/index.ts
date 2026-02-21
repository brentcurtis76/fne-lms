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
import { CreateLicitacionSchema, LicitacionFiltersSchema } from '@/types/licitaciones';
import { createLicitacion } from '@/lib/licitacionService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-index');

  switch (req.method) {
    case 'GET':
      return await handleGet(req, res);
    case 'POST':
      return await handlePost(req, res);
    default:
      return handleMethodNotAllowed(res, ['GET', 'POST']);
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
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

    // Parse filters
    const filtersResult = LicitacionFiltersSchema.safeParse(req.query);
    if (!filtersResult.success) {
      return sendAuthError(res, 'Parametros de filtro invalidos', 400);
    }
    const filters = filtersResult.data;

    // Use user-scoped client for reads so RLS filters for encargados
    const supabaseClient = await createApiSupabaseClient(req, res);

    let query = supabaseClient
      .from('licitaciones')
      .select('*, schools(id, name)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters.school_id) {
      query = query.eq('school_id', filters.school_id);
    }
    if (filters.programa_id) {
      query = query.eq('programa_id', filters.programa_id);
    }
    if (filters.year) {
      query = query.eq('year', filters.year);
    }
    if (filters.estado) {
      query = query.eq('estado', filters.estado);
    }

    const offset = (filters.page - 1) * filters.limit;
    query = query.range(offset, offset + filters.limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return sendAuthError(res, 'Error al obtener licitaciones', 500, error.message);
    }

    return sendApiResponse(res, {
      licitaciones: data || [],
      total: count || 0,
      page: filters.page,
      limit: filters.limit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error inesperado al obtener licitaciones', 500, message);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'No autorizado', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const roleTypes = userRoles.map(r => r.role_type);
    const isAdmin = roleTypes.includes('admin');

    // Only admins can create licitaciones
    if (!isAdmin) {
      return sendAuthError(res, 'Solo administradores pueden crear licitaciones', 403);
    }

    const parseResult = CreateLicitacionSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errors = parseResult.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
    }

    const licitacion = await createLicitacion(serviceClient, parseResult.data, user.id);
    return sendApiResponse(res, { licitacion }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    // Use known user-facing messages; hide raw DB errors in details (dev-only)
    const userMessage = message.includes('Ya existe') ? message : 'Error al crear licitación';
    return sendAuthError(res, userMessage, 400, message);
  }
}
