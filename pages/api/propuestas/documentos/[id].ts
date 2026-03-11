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

const PatchDocumentoSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  tipo: z
    .enum([
      'certificado_pertenencia',
      'evaluaciones_clientes',
      'carta_recomendacion',
      'ficha_servicio',
      'otro',
    ])
    .optional(),
  descripcion: z.string().nullable().optional(),
  archivo_path: z.string().min(1).optional(),
  fecha_emision: z.string().nullable().optional(),
  fecha_vencimiento: z.string().nullable().optional(),
  activo: z.boolean().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'propuestas-documentos-detail');

  const idParse = uuidSchema.safeParse(req.query.id);
  if (!idParse.success) return sendAuthError(res, 'ID inválido', 400);
  const documentoId = idParse.data;

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, documentoId);
    case 'PATCH':
      return handlePatch(req, res, documentoId);
    case 'DELETE':
      return handleDelete(req, res, documentoId);
    default:
      return handleMethodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, documentoId: string) {
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
      .eq('id', documentoId)
      .single();

    if (dbError || !data) return sendAuthError(res, 'Documento no encontrado', 404);

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const documento = {
      ...data,
      expired: data.fecha_vencimiento ? data.fecha_vencimiento < today : false,
    };

    return sendApiResponse(res, { documento });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al obtener documento', 500, message);
  }
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse, documentoId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden modificar documentos', 403);
  }

  const parse = PatchDocumentoSchema.safeParse(req.body);
  if (!parse.success) {
    const errors = parse.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return sendAuthError(res, `Datos inválidos: ${errors}`, 400);
  }

  if (Object.keys(parse.data).length === 0) {
    return sendAuthError(res, 'Sin campos válidos para actualizar', 400);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_documentos_biblioteca')
      .update({ ...parse.data, updated_at: new Date().toISOString() })
      .eq('id', documentoId)
      .select('*')
      .single();

    if (dbError || !data) return sendAuthError(res, 'Documento no encontrado', 404);
    return sendApiResponse(res, { documento: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al actualizar documento', 500, message);
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse, documentoId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden eliminar documentos', 403);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_documentos_biblioteca')
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq('id', documentoId)
      .select('id')
      .single();

    if (dbError || !data) return sendAuthError(res, 'Documento no encontrado', 404);
    return sendApiResponse(res, { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al eliminar documento', 500, message);
  }
}
