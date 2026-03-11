import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import { getUserRoles } from '@/utils/roleUtils';
import { uuidSchema } from '@/lib/validation/schemas';

const PatchFichaSchema = z.object({
  folio: z.number().int().positive().optional(),
  nombre_servicio: z.string().min(1).max(500).optional(),
  dimension: z.string().min(1).max(100).optional(),
  categoria: z.string().min(1).max(100).optional(),
  horas_presenciales: z.number().int().min(0).optional(),
  horas_no_presenciales: z.number().int().min(0).optional(),
  total_horas: z.number().int().min(0).optional(),
  destinatarios: z.array(z.string()).optional(),
  objetivo_general: z.string().nullable().optional(),
  metodologia: z.string().nullable().optional(),
  equipo_trabajo: z
    .array(
      z.object({
        nombre: z.string(),
        formacion: z.string(),
        anos_experiencia: z.number().int(),
      })
    )
    .nullable()
    .optional(),
  fecha_inscripcion: z.string().nullable().optional(),
  activo: z.boolean().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'propuestas-fichas-detail');

  const idParse = uuidSchema.safeParse(req.query.id);
  if (!idParse.success) return sendAuthError(res, 'ID inválido', 400);
  const fichaId = idParse.data;

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, fichaId);
    case 'PATCH':
      return handlePatch(req, res, fichaId);
    case 'DELETE':
      return handleDelete(req, res, fichaId);
    default:
      return handleMethodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, fichaId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden acceder', 403);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_fichas_servicio')
      .select('*')
      .eq('id', fichaId)
      .single();

    if (dbError || !data) return sendAuthError(res, 'Ficha no encontrada', 404);
    return sendApiResponse(res, { ficha: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al obtener ficha', 500, message);
  }
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse, fichaId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden modificar fichas', 403);
  }

  const parse = PatchFichaSchema.safeParse(req.body);
  if (!parse.success) {
    const errors = parse.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return sendAuthError(res, `Datos inválidos: ${errors}`, 400);
  }

  if (Object.keys(parse.data).length === 0) {
    return sendAuthError(res, 'Sin campos válidos para actualizar', 400);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_fichas_servicio')
      .update(parse.data)
      .eq('id', fichaId)
      .select('*')
      .single();

    if (dbError || !data) return sendAuthError(res, 'Ficha no encontrada', 404);
    return sendApiResponse(res, { ficha: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al actualizar ficha', 500, message);
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse, fichaId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden eliminar fichas', 403);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_fichas_servicio')
      .update({ activo: false })
      .eq('id', fichaId)
      .select('id')
      .single();

    if (dbError || !data) return sendAuthError(res, 'Ficha no encontrada', 404);
    return sendApiResponse(res, { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al eliminar ficha', 500, message);
  }
}
