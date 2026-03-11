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

const CreateFichaSchema = z.object({
  folio: z.number().int().positive(),
  nombre_servicio: z.string().min(1).max(500),
  dimension: z.string().min(1).max(100),
  categoria: z.string().min(1).max(100),
  horas_presenciales: z.number().int().min(0),
  horas_no_presenciales: z.number().int().min(0).default(0),
  total_horas: z.number().int().min(0),
  destinatarios: z.array(z.string()).default([]),
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
  activo: z.boolean().default(true),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'propuestas-fichas');

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
      .from('propuesta_fichas_servicio')
      .select('*')
      .eq('activo', true)
      .order('folio');

    if (dbError) throw new Error(dbError.message);
    return sendApiResponse(res, { fichas: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al obtener fichas', 500, message);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden crear fichas', 403);
  }

  const parse = CreateFichaSchema.safeParse(req.body);
  if (!parse.success) {
    const errors = parse.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return sendAuthError(res, `Datos inválidos: ${errors}`, 400);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_fichas_servicio')
      .insert(parse.data)
      .select('*')
      .single();

    if (dbError) throw new Error(dbError.message);
    return sendApiResponse(res, { ficha: data }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al crear ficha', 500, message);
  }
}
