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

const PatchBloqueSchema = z.object({
  clave: z.string().min(1).max(100).optional(),
  titulo: z.string().min(1).max(200).optional(),
  contenido: z.record(z.unknown()).optional(),
  imagenes: z
    .array(z.object({ key: z.string(), path: z.string(), alt: z.string() }))
    .nullable()
    .optional(),
  programa_tipo: z.string().nullable().optional(),
  orden: z.number().int().optional(),
  activo: z.boolean().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'propuestas-bloques-detail');

  const idParse = uuidSchema.safeParse(req.query.id);
  if (!idParse.success) return sendAuthError(res, 'ID inválido', 400);
  const bloqueId = idParse.data;

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, bloqueId);
    case 'PATCH':
      return handlePatch(req, res, bloqueId);
    case 'DELETE':
      return handleDelete(req, res, bloqueId);
    default:
      return handleMethodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, bloqueId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden acceder', 403);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_contenido_bloques')
      .select('*')
      .eq('id', bloqueId)
      .single();

    if (dbError || !data) return sendAuthError(res, 'Bloque no encontrado', 404);
    return sendApiResponse(res, { bloque: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al obtener bloque', 500, message);
  }
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse, bloqueId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden modificar bloques', 403);
  }

  const parse = PatchBloqueSchema.safeParse(req.body);
  if (!parse.success) {
    const errors = parse.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return sendAuthError(res, `Datos inválidos: ${errors}`, 400);
  }

  if (Object.keys(parse.data).length === 0) {
    return sendAuthError(res, 'Sin campos válidos para actualizar', 400);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_contenido_bloques')
      .update({ ...parse.data, updated_at: new Date().toISOString() })
      .eq('id', bloqueId)
      .select('*')
      .single();

    if (dbError || !data) return sendAuthError(res, 'Bloque no encontrado', 404);
    return sendApiResponse(res, { bloque: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al actualizar bloque', 500, message);
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse, bloqueId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden eliminar bloques', 403);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_contenido_bloques')
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq('id', bloqueId)
      .select('id')
      .single();

    if (dbError || !data) return sendAuthError(res, 'Bloque no encontrado', 404);
    return sendApiResponse(res, { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al eliminar bloque', 500, message);
  }
}
