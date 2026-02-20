/**
 * Evaluation Criteria Admin API
 * GET    /api/admin/licitaciones/criterios?programa_id=... — List criteria for a program
 * POST   /api/admin/licitaciones/criterios — Create new criterion
 * PATCH  /api/admin/licitaciones/criterios?criterio_id=... — Update criterion
 * DELETE /api/admin/licitaciones/criterios?criterio_id=... — Deactivate criterion
 *
 * Admin-only endpoint.
 */

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
import { CriterioSchema, UpdateCriterioSchema } from '@/types/licitaciones';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin-licitaciones-criterios');

  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method || '')) {
    return handleMethodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'No autorizado', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const roleTypes = userRoles.map(r => r.role_type);
    const isAdmin = roleTypes.includes('admin');

    if (!isAdmin) {
      return sendAuthError(res, 'Solo administradores pueden gestionar criterios de evaluacion', 403);
    }

    // ============================================================
    // GET — List criteria for a program
    // ============================================================
    if (req.method === 'GET') {
      const { programa_id } = req.query;

      if (!programa_id || typeof programa_id !== 'string') {
        return sendAuthError(res, 'programa_id es requerido', 400);
      }

      const { data, error } = await serviceClient
        .from('programa_evaluacion_criterios')
        .select('*')
        .eq('programa_id', programa_id)
        .order('orden', { ascending: true });

      if (error) {
        return sendAuthError(res, 'Error al obtener criterios', 500, error.message);
      }

      return sendApiResponse(res, { criterios: data || [] });
    }

    // ============================================================
    // POST — Create new criterion
    // ============================================================
    if (req.method === 'POST') {
      const parseResult = CriterioSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
      }

      const data = parseResult.data;

      const { data: created, error } = await serviceClient
        .from('programa_evaluacion_criterios')
        .insert({
          programa_id: data.programa_id,
          nombre_criterio: data.nombre_criterio,
          puntaje_maximo: data.puntaje_maximo,
          descripcion: data.descripcion ?? null,
          orden: data.orden,
          is_active: data.is_active ?? true,
        })
        .select('*')
        .single();

      if (error) {
        return sendAuthError(res, 'Error al crear criterio', 500, error.message);
      }

      return sendApiResponse(res, { criterio: created }, 201);
    }

    // ============================================================
    // PATCH — Update criterion
    // ============================================================
    if (req.method === 'PATCH') {
      const { criterio_id } = req.query;
      const idParse = uuidSchema.safeParse(criterio_id);
      if (!idParse.success) {
        return sendAuthError(res, 'criterio_id invalido', 400);
      }

      const parseResult = UpdateCriterioSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
      }

      const updateData = parseResult.data;
      const updatePayload: Record<string, unknown> = {};

      if (updateData.nombre_criterio !== undefined) updatePayload.nombre_criterio = updateData.nombre_criterio;
      if (updateData.puntaje_maximo !== undefined) updatePayload.puntaje_maximo = updateData.puntaje_maximo;
      if (updateData.descripcion !== undefined) updatePayload.descripcion = updateData.descripcion;
      if (updateData.orden !== undefined) updatePayload.orden = updateData.orden;
      if (updateData.is_active !== undefined) updatePayload.is_active = updateData.is_active;

      const { data: updated, error } = await serviceClient
        .from('programa_evaluacion_criterios')
        .update(updatePayload)
        .eq('id', idParse.data)
        .select('*')
        .single();

      if (error) {
        return sendAuthError(res, 'Error al actualizar criterio', 500, error.message);
      }

      return sendApiResponse(res, { criterio: updated });
    }

    // ============================================================
    // DELETE — Deactivate criterion (soft delete)
    // ============================================================
    if (req.method === 'DELETE') {
      const { criterio_id } = req.query;
      const idParse = uuidSchema.safeParse(criterio_id);
      if (!idParse.success) {
        return sendAuthError(res, 'criterio_id invalido', 400);
      }

      // Soft-delete: set is_active = false
      const { data: deactivated, error } = await serviceClient
        .from('programa_evaluacion_criterios')
        .update({ is_active: false })
        .eq('id', idParse.data)
        .select('*')
        .single();

      if (error) {
        return sendAuthError(res, 'Error al eliminar criterio', 500, error.message);
      }

      return sendApiResponse(res, { criterio: deactivated });
    }

    return sendAuthError(res, 'Metodo no permitido', 405);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al procesar criterios', 500, message);
  }
}
