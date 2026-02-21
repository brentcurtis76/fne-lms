import { NextApiRequest, NextApiResponse } from 'next';
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
import { CreateConsultaSchema } from '@/types/licitaciones';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-consultas');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['GET', 'POST']);
  }

  const { id } = req.query;
  const idParse = uuidSchema.safeParse(id);
  if (!idParse.success) {
    return sendAuthError(res, 'ID de licitacion invalido', 400);
  }
  const licitacionId = idParse.data;

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
      return sendAuthError(res, 'No tiene permisos para gestionar consultas', 403);
    }

    // Fetch licitacion for school scoping
    const { data: licitacion, error: licitError } = await serviceClient
      .from('licitaciones')
      .select('id, school_id, estado')
      .eq('id', licitacionId)
      .single();

    if (licitError || !licitacion) {
      return sendAuthError(res, 'Licitacion no encontrada', 404);
    }

    // School scoping for encargado
    if (!isAdmin && isEncargado) {
      const encargadoRole = userRoles.find(r => r.role_type === 'encargado_licitacion');
      const encargadoSchoolId = encargadoRole?.school_id != null ? Number(encargadoRole.school_id) : null;
      if (!encargadoRole || encargadoSchoolId !== licitacion.school_id) {
        return sendAuthError(res, 'No tiene permisos para esta licitacion', 403);
      }
    }

    // ============================================================
    // GET — List all consultas
    // ============================================================
    if (req.method === 'GET') {
      const { data: consultas, error: listError } = await serviceClient
        .from('licitacion_consultas')
        .select('*')
        .eq('licitacion_id', licitacionId)
        .order('created_at', { ascending: true });

      if (listError) {
        return sendAuthError(res, 'Error al obtener consultas', 500, listError.message);
      }

      return sendApiResponse(res, { consultas: consultas || [] });
    }

    // ============================================================
    // POST — Create a new consulta
    // ============================================================
    if (req.method === 'POST') {
      const parseResult = CreateConsultaSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
      }

      const data = parseResult.data;

      // Validate ate_id belongs to this licitacion if provided
      if (data.ate_id) {
        const { data: ate } = await serviceClient
          .from('licitacion_ates')
          .select('id')
          .eq('id', data.ate_id)
          .eq('licitacion_id', licitacionId)
          .single();

        if (!ate) {
          return sendAuthError(res, 'ATE no encontrada o no pertenece a esta licitacion', 400);
        }
      }

      const { data: consulta, error: insertError } = await serviceClient
        .from('licitacion_consultas')
        .insert({
          licitacion_id: licitacionId,
          pregunta: data.pregunta,
          respuesta: data.respuesta || null,
          fecha_pregunta: data.fecha_pregunta || null,
          fecha_respuesta: data.fecha_respuesta || null,
          ate_id: data.ate_id || null,
        })
        .select('*')
        .single();

      if (insertError) {
        return sendAuthError(res, 'Error al registrar consulta', 500, insertError.message);
      }

      // Historial
      await serviceClient.from('licitacion_historial').insert({
        licitacion_id: licitacionId,
        accion: 'Consulta registrada',
        estado_anterior: licitacion.estado,
        estado_nuevo: licitacion.estado,
        detalles: { pregunta: data.pregunta.substring(0, 100) },
        user_id: user.id,
      });

      return sendApiResponse(res, { consulta }, 201);
    }

    return sendAuthError(res, 'Metodo no permitido', 405);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error inesperado', 500, message);
  }
}
