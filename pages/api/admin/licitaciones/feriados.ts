/**
 * Feriados CRUD API
 * GET    /api/admin/licitaciones/feriados — list all feriados (admin only)
 * POST   /api/admin/licitaciones/feriados — create a new feriado (admin only)
 * PUT    /api/admin/licitaciones/feriados — update an existing feriado (admin only)
 * DELETE /api/admin/licitaciones/feriados — delete a feriado (admin only)
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
import { FeriadoSchema, UpdateFeriadoSchema } from '@/types/licitaciones';
import { z } from 'zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin-licitaciones-feriados');

  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method || '')) {
    return handleMethodNotAllowed(res, ['GET', 'POST', 'PUT', 'DELETE']);
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

    // Admin-only for all operations
    if (!isAdmin) {
      return sendAuthError(res, 'Solo administradores pueden gestionar feriados', 403);
    }

    switch (req.method) {
      case 'GET': {
        // Optional year filter from query params
        const yearParam = req.query.year;
        let query = serviceClient
          .from('feriados_chile')
          .select('*')
          .order('fecha', { ascending: true });

        if (yearParam) {
          const year = parseInt(String(yearParam), 10);
          if (!isNaN(year)) {
            query = query.eq('year', year);
          }
        }

        const { data: feriados, error: listError } = await query;
        if (listError) {
          return sendAuthError(res, 'Error al obtener feriados', 500, listError.message);
        }
        return sendApiResponse(res, { feriados: feriados || [] });
      }

      case 'POST': {
        const parseResult = FeriadoSchema.safeParse(req.body);
        if (!parseResult.success) {
          const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
          return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
        }

        const { fecha, nombre } = parseResult.data;
        // Auto-compute year from fecha
        const year = parseInt(fecha.split('-')[0], 10);

        const { data: created, error: insertError } = await serviceClient
          .from('feriados_chile')
          .insert({ fecha, nombre, year })
          .select('*')
          .single();

        if (insertError) {
          // Check for unique constraint on fecha
          if (insertError.code === '23505') {
            return sendAuthError(res, `Ya existe un feriado para la fecha ${fecha}`, 400);
          }
          return sendAuthError(res, 'Error al crear feriado', 500, insertError.message);
        }

        return sendApiResponse(res, { feriado: created }, 201);
      }

      case 'PUT': {
        const parseResult = UpdateFeriadoSchema.safeParse(req.body);
        if (!parseResult.success) {
          const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
          return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
        }

        const { id, fecha, nombre } = parseResult.data;

        // Build update payload
        const updatePayload: Record<string, unknown> = {};
        if (fecha !== undefined) {
          updatePayload.fecha = fecha;
          updatePayload.year = parseInt(fecha.split('-')[0], 10);
        }
        if (nombre !== undefined) {
          updatePayload.nombre = nombre;
        }

        if (Object.keys(updatePayload).length === 0) {
          return sendAuthError(res, 'No hay campos para actualizar', 400);
        }

        const { data: updated, error: updateError } = await serviceClient
          .from('feriados_chile')
          .update(updatePayload)
          .eq('id', id)
          .select('*')
          .single();

        if (updateError) {
          if (updateError.code === '23505') {
            return sendAuthError(res, `Ya existe un feriado para la fecha ${fecha}`, 400);
          }
          return sendAuthError(res, 'Error al actualizar feriado', 500, updateError.message);
        }

        if (!updated) {
          return sendAuthError(res, 'Feriado no encontrado', 404);
        }

        return sendApiResponse(res, { feriado: updated });
      }

      case 'DELETE': {
        // Validate id from body
        const deleteSchema = z.object({
          id: z.number().int().positive('ID invalido'),
        });
        const parseResult = deleteSchema.safeParse(req.body);
        if (!parseResult.success) {
          return sendAuthError(res, 'ID de feriado invalido', 400);
        }

        const { id } = parseResult.data;

        const { error: deleteError } = await serviceClient
          .from('feriados_chile')
          .delete()
          .eq('id', id);

        if (deleteError) {
          return sendAuthError(res, 'Error al eliminar feriado', 500, deleteError.message);
        }

        return sendApiResponse(res, { deleted: true });
      }

      default:
        return handleMethodNotAllowed(res, ['GET', 'POST', 'PUT', 'DELETE']);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error inesperado', 500, message);
  }
}
