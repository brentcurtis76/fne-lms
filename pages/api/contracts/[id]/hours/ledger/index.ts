import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  getApiUser,
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../../lib/api-auth';
import { Validators } from '../../../../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../../../../utils/roleUtils';

const ManualLedgerEntrySchema = z.object({
  allocation_id: z.string().uuid('allocation_id debe ser un UUID válido'),
  hours: z.number().positive('Las horas deben ser un número positivo'),
  status: z.enum(['reservada', 'consumida', 'devuelta', 'penalizada']),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD'),
  notes: z.string().max(1000).optional().nullable(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'contracts-hours-ledger');

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de contrato inválido', 400);
  }

  if (req.method === 'GET') {
    return handleGet(req, res, id);
  }

  if (req.method === 'POST') {
    return handlePost(req, res, id);
  }

  return handleMethodNotAllowed(res, ['GET', 'POST']);
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, contratoId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Resolve user role for access control
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    // Parse query parameters
    const {
      consultant_id,
      hour_type_key,
      status,
      page = '1',
      page_size = '50',
      sort = 'date_desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const pageSizeNum = Math.min(200, Math.max(1, parseInt(String(page_size), 10) || 50));
    const offset = (pageNum - 1) * pageSizeNum;

    let query = serviceClient
      .from('contract_hours_ledger')
      .select(
        `
        *,
        allocation:contract_hour_allocations!allocation_id(
          id,
          contrato_id,
          hour_type_id,
          hour_types!hour_type_id(key, display_name, modality)
        )
      `,
        { count: 'exact' }
      )
      .eq('allocation.contrato_id', contratoId);

    // Role-based access control
    if (highestRole === 'admin') {
      // Admin: access all ledger entries for this contract
    } else if (highestRole === 'equipo_directivo') {
      // Equipo directivo: only for sessions at their school
      // Resolve school from contract
      const { data: contrato } = await serviceClient
        .from('contratos')
        .select('clientes!inner(school_id)')
        .eq('id', contratoId)
        .single();

      const contractSchoolId = (contrato?.clientes as { school_id: number } | null | { school_id: number }[])
        ? Array.isArray(contrato?.clientes)
          ? (contrato?.clientes as { school_id: number }[])[0]?.school_id
          : (contrato?.clientes as { school_id: number } | null)?.school_id
        : undefined;

      const userSchoolIds = userRoles
        .filter((r) => r.school_id !== undefined && r.school_id !== null)
        .map((r) => String(r.school_id));

      if (!contractSchoolId || !userSchoolIds.includes(String(contractSchoolId))) {
        return sendAuthError(res, 'Acceso denegado: este contrato no pertenece a su institución', 403);
      }
    } else if (highestRole === 'consultor') {
      // Consultor: only sessions they facilitated
      if (consultant_id && consultant_id !== user.id) {
        return sendAuthError(res, 'Acceso denegado: solo puede ver sus propias entradas', 403);
      }
      query = query.not('session_id', 'is', null);
      // Filter by sessions where this consultant is a facilitator
      const { data: facilitatedSessionIds } = await serviceClient
        .from('session_facilitators')
        .select('session_id')
        .eq('user_id', user.id);

      const sessionIds = (facilitatedSessionIds || []).map((f: { session_id: string }) => f.session_id);
      if (sessionIds.length === 0) {
        return sendApiResponse(res, { ledger: [], total: 0, page: pageNum, page_size: pageSizeNum });
      }
      query = query.in('session_id', sessionIds);
    } else {
      return sendAuthError(res, 'Acceso denegado', 403);
    }

    // Optional filters
    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    // Note: hour_type_key filtering is handled post-query since deep nested
    // column filters are not reliably supported in all Supabase versions.

    // Sorting
    const ascending = sort === 'date_asc';
    query = query.order('session_date', { ascending });

    // Pagination
    query = query.range(offset, offset + pageSizeNum - 1);

    const { data: ledger, error: dbError, count } = await query;

    if (dbError) {
      return sendAuthError(res, 'Error al obtener libro de horas', 500, dbError.message);
    }

    return sendApiResponse(res, {
      ledger: ledger || [],
      total: count || 0,
      page: pageNum,
      page_size: pageSizeNum,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al obtener libro de horas', 500, message);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, contratoId: string) {
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);
  if (authError || !isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden crear entradas manuales en el libro de horas', 403);
  }

  const parsed = ManualLedgerEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendAuthError(
      res,
      `Datos inválidos: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
      400
    );
  }

  const { allocation_id, hours, status, session_date, notes } = parsed.data;

  try {
    const serviceClient = createServiceRoleClient();

    // Verify the allocation belongs to this contract
    const { data: allocation, error: allocError } = await serviceClient
      .from('contract_hour_allocations')
      .select('id, contrato_id')
      .eq('id', allocation_id)
      .eq('contrato_id', contratoId)
      .single();

    if (allocError || !allocation) {
      return sendAuthError(res, 'La asignación no pertenece a este contrato', 404);
    }

    const { data: ledgerEntry, error: insertError } = await serviceClient
      .from('contract_hours_ledger')
      .insert({
        allocation_id,
        session_id: null,
        hours,
        status,
        session_date,
        recorded_by: user!.id,
        is_over_budget: false,
        is_manual: true,
        notes: notes ?? null,
      })
      .select('*')
      .single();

    if (insertError) {
      return sendAuthError(res, 'Error al crear entrada en el libro de horas', 500, insertError.message);
    }

    return sendApiResponse(res, { ledger_entry: ledgerEntry }, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al crear entrada en el libro de horas', 500, message);
  }
}
