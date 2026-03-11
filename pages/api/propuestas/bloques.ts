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

const CreateBloqueSchema = z.object({
  clave: z.string().min(1).max(100),
  titulo: z.string().min(1).max(200),
  contenido: z.record(z.unknown()),
  imagenes: z
    .array(z.object({ key: z.string(), path: z.string(), alt: z.string() }))
    .nullable()
    .optional(),
  programa_tipo: z.string().nullable().optional(),
  orden: z.number().int().default(0),
  activo: z.boolean().default(true),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'propuestas-bloques');

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
    let query = serviceClient
      .from('propuesta_contenido_bloques')
      .select('*')
      .eq('activo', true)
      .order('orden');

    const { programa_tipo } = req.query;
    if (typeof programa_tipo === 'string') {
      query = query.eq('programa_tipo', programa_tipo);
    }

    const { data, error: dbError } = await query;
    if (dbError) throw new Error(dbError.message);
    return sendApiResponse(res, { bloques: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al obtener bloques', 500, message);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden crear bloques', 403);
  }

  const parse = CreateBloqueSchema.safeParse(req.body);
  if (!parse.success) {
    const errors = parse.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return sendAuthError(res, `Datos inválidos: ${errors}`, 400);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_contenido_bloques')
      .insert(parse.data)
      .select('*')
      .single();

    if (dbError) throw new Error(dbError.message);
    return sendApiResponse(res, { bloque: data }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al crear bloque', 500, message);
  }
}
