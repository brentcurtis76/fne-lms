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

const CreateDocumentoSchema = z.object({
  nombre: z.string().min(1).max(200),
  tipo: z.enum([
    'certificado_pertenencia',
    'evaluaciones_clientes',
    'carta_recomendacion',
    'ficha_servicio',
    'otro',
  ]),
  descripcion: z.string().nullable().optional(),
  archivo_path: z.string().min(1),
  fecha_emision: z.string().nullable().optional(),
  fecha_vencimiento: z.string().nullable().optional(),
  activo: z.boolean().default(true),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'propuestas-documentos');

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
      .from('propuesta_documentos_biblioteca')
      .select('*')
      .eq('activo', true)
      .order('nombre');

    if (dbError) throw new Error(dbError.message);

    const now = new Date().toISOString();
    const documentos = (data ?? []).map(doc => ({
      ...doc,
      expired: doc.fecha_vencimiento ? doc.fecha_vencimiento < now : false,
    }));

    return sendApiResponse(res, { documentos });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al obtener documentos', 500, message);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden crear documentos', 403);
  }

  const parse = CreateDocumentoSchema.safeParse(req.body);
  if (!parse.success) {
    const errors = parse.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return sendAuthError(res, `Datos inválidos: ${errors}`, 400);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_documentos_biblioteca')
      .insert(parse.data)
      .select('*')
      .single();

    if (dbError) throw new Error(dbError.message);
    return sendApiResponse(res, { documento: data }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al crear documento', 500, message);
  }
}
