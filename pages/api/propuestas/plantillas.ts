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

const CreatePlantillaSchema = z.object({
  nombre: z.string().min(1).max(200),
  tipo_servicio: z.enum(['preparacion', 'evoluciona', 'custom']),
  ficha_id: z.string().uuid().nullable().optional(),
  bloques_orden: z.array(z.string()).default([]),
  horas_default: z.number().int().nullable().optional(),
  configuracion_default: z.record(z.unknown()).nullable().optional(),
  activo: z.boolean().default(true),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'propuestas-plantillas');

  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    default:
      return handleMethodNotAllowed(res, ['GET', 'POST']);
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden acceder', 403);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_plantillas')
      .select('*, ficha:propuesta_fichas_servicio(nombre_servicio, folio)')
      .eq('activo', true)
      .order('nombre');

    if (dbError) throw new Error(dbError.message);
    return sendApiResponse(res, { plantillas: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al obtener plantillas', 500, message);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden crear plantillas', 403);
  }

  const parse = CreatePlantillaSchema.safeParse(req.body);
  if (!parse.success) {
    const errors = parse.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return sendAuthError(res, `Datos inválidos: ${errors}`, 400);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_plantillas')
      .insert(parse.data)
      .select('*')
      .single();

    if (dbError) throw new Error(dbError.message);
    return sendApiResponse(res, { plantilla: data }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al crear plantilla', 500, message);
  }
}
