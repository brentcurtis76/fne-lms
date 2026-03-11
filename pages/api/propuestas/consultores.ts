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

const CreateConsultorSchema = z.object({
  nombre: z.string().min(1).max(200),
  titulo: z.string().min(1).max(200),
  categoria: z.enum(['comite_internacional', 'equipo_fne', 'asesor_internacional']),
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
  activo: z.boolean().default(true),
  orden: z.number().int().default(0),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'propuestas-consultores');

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
      .from('propuesta_consultores')
      .select('*')
      .eq('activo', true)
      .order('categoria')
      .order('nombre');

    if (dbError) throw new Error(dbError.message);
    return sendApiResponse(res, { consultores: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al obtener consultores', 500, message);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden crear consultores', 403);
  }

  const parse = CreateConsultorSchema.safeParse(req.body);
  if (!parse.success) {
    const errors = parse.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return sendAuthError(res, `Datos inválidos: ${errors}`, 400);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_consultores')
      .insert(parse.data)
      .select('*')
      .single();

    if (dbError) throw new Error(dbError.message);
    return sendApiResponse(res, { consultor: data }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al crear consultor', 500, message);
  }
}
