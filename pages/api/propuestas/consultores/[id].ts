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

const PatchConsultorSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  titulo: z.string().min(1).max(200).optional(),
  categoria: z.enum(['comite_internacional', 'equipo_fne', 'asesor_internacional']).optional(),
  perfil_profesional: z.string().nullable().optional(),
  formacion_academica: z
    .array(z.object({ year: z.number().int(), institution: z.string(), degree: z.string() }))
    .nullable()
    .optional(),
  experiencia_profesional: z
    .array(z.object({ empresa: z.string(), cargo: z.string(), funcion: z.string() }))
    .nullable()
    .optional(),
  referencias: z
    .array(
      z.object({
        nombre: z.string(),
        cargo: z.string(),
        empresa: z.string(),
        telefono: z.string().optional(),
        periodo: z.string().optional(),
      })
    )
    .nullable()
    .optional(),
  especialidades: z.array(z.string()).nullable().optional(),
  foto_path: z.string().nullable().optional(),
  cv_pdf_path: z.string().nullable().optional(),
  activo: z.boolean().optional(),
  orden: z.number().int().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'propuestas-consultores-detail');

  const idParse = uuidSchema.safeParse(req.query.id);
  if (!idParse.success) return sendAuthError(res, 'ID inválido', 400);
  const consultorId = idParse.data;

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, consultorId);
    case 'PATCH':
      return handlePatch(req, res, consultorId);
    case 'DELETE':
      return handleDelete(req, res, consultorId);
    default:
      return handleMethodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, consultorId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden acceder', 403);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_consultores')
      .select('*')
      .eq('id', consultorId)
      .single();

    if (dbError || !data) return sendAuthError(res, 'Consultor no encontrado', 404);
    return sendApiResponse(res, { consultor: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al obtener consultor', 500, message);
  }
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse, consultorId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden modificar consultores', 403);
  }

  const parse = PatchConsultorSchema.safeParse(req.body);
  if (!parse.success) {
    const errors = parse.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return sendAuthError(res, `Datos inválidos: ${errors}`, 400);
  }

  if (Object.keys(parse.data).length === 0) {
    return sendAuthError(res, 'Sin campos válidos para actualizar', 400);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_consultores')
      .update({ ...parse.data, updated_at: new Date().toISOString() })
      .eq('id', consultorId)
      .select('*')
      .single();

    if (dbError || !data) return sendAuthError(res, 'Consultor no encontrado', 404);
    return sendApiResponse(res, { consultor: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al actualizar consultor', 500, message);
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse, consultorId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden eliminar consultores', 403);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_consultores')
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq('id', consultorId)
      .select('id')
      .single();

    if (dbError || !data) return sendAuthError(res, 'Consultor no encontrado', 404);
    return sendApiResponse(res, { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al eliminar consultor', 500, message);
  }
}
