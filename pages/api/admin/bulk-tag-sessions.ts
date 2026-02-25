import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../lib/api-auth';

// ============================================================
// Zod schemas
// ============================================================

const BulkTagSchema = z.object({
  session_ids: z
    .array(z.string().uuid('Cada session_id debe ser un UUID válido'))
    .min(1, 'Debe proveer al menos un session_id')
    .max(500, 'No se pueden clasificar más de 500 sesiones a la vez'),
  hour_type_key: z.string().min(1, 'hour_type_key es requerido').max(100, 'Clave de tipo de hora demasiado larga'),
});

// ============================================================
// Handler
// ============================================================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin-bulk-tag-sessions');

  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'PATCH') {
    return handlePatch(req, res);
  }

  return handleMethodNotAllowed(res, ['GET', 'PATCH']);
}

// ============================================================
// GET — List unclassified sessions (hour_type_key IS NULL)
// ============================================================

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }
  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden listar sesiones sin clasificar', 403);
  }

  try {
    const serviceClient = createServiceRoleClient();

    const {
      page = '1',
      page_size = '50',
      school_id,
      date_from,
      date_to,
    } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(String(page_size), 10) || 50));
    const offset = (pageNum - 1) * pageSizeNum;

    let query = serviceClient
      .from('consultor_sessions')
      .select(
        `
        id,
        title,
        scheduled_date,
        status,
        hour_type_key,
        contrato_id,
        schools!school_id ( id, name ),
        session_facilitators (
          profiles ( first_name, last_name )
        )
      `,
        { count: 'exact' }
      )
      .is('hour_type_key', null)
      .not('status', 'in', '("borrador","pendiente_aprobacion")')
      .order('scheduled_date', { ascending: false });

    if (school_id && typeof school_id === 'string') {
      const schoolIdNum = parseInt(school_id, 10);
      if (!isNaN(schoolIdNum)) {
        query = query.eq('school_id', schoolIdNum);
      }
    }

    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (date_from && typeof date_from === 'string' && DATE_RE.test(date_from)) {
      query = query.gte('scheduled_date', date_from);
    }

    if (date_to && typeof date_to === 'string' && DATE_RE.test(date_to)) {
      query = query.lte('scheduled_date', date_to);
    }

    query = query.range(offset, offset + pageSizeNum - 1);

    const { data: sessions, error: dbError, count } = await query;

    if (dbError) {
      return sendAuthError(res, 'Error al obtener sesiones sin clasificar', 500, dbError.message);
    }

    return sendApiResponse(res, {
      sessions: sessions ?? [],
      total: count ?? 0,
      page: pageNum,
      page_size: pageSizeNum,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al obtener sesiones sin clasificar', 500, message);
  }
}

// ============================================================
// PATCH — Bulk tag sessions with hour_type_key
// ============================================================

async function handlePatch(req: NextApiRequest, res: NextApiResponse) {
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }
  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden clasificar sesiones', 403);
  }

  const parsed = BulkTagSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendAuthError(
      res,
      `Datos inválidos: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
      400
    );
  }

  const { session_ids, hour_type_key } = parsed.data;

  try {
    const serviceClient = createServiceRoleClient();

    // Verify hour_type_key exists in hour_types table
    const { data: hourType, error: htError } = await serviceClient
      .from('hour_types')
      .select('id, key')
      .eq('key', hour_type_key)
      .single();

    if (htError || !hourType) {
      return sendAuthError(
        res,
        'El tipo de hora indicado no existe en el sistema.',
        400
      );
    }

    // Update only sessions where hour_type_key IS NULL (idempotent — already tagged are skipped)
    const { data: updated, error: updateError } = await serviceClient
      .from('consultor_sessions')
      .update({ hour_type_key })
      .in('id', session_ids)
      .is('hour_type_key', null)
      .select('id');

    if (updateError) {
      return sendAuthError(res, 'Error al clasificar sesiones', 500, updateError.message);
    }

    const updatedCount = (updated ?? []).length;

    return sendApiResponse(res, {
      updated_count: updatedCount,
      skipped_count: session_ids.length - updatedCount,
      message:
        updatedCount > 0
          ? `${updatedCount} sesión(es) clasificada(s) correctamente`
          : 'No se actualizaron sesiones (ya estaban clasificadas o no existen)',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al clasificar sesiones', 500, message);
  }
}
