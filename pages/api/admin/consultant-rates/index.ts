import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { getUserRoles, getHighestRole } from '../../../../utils/roleUtils';

// ============================================================
// Zod schemas
// ============================================================

const CreateRateSchema = z.object({
  consultant_id: z.string().uuid('consultant_id debe ser un UUID válido'),
  hour_type_key: z.string().min(1, 'hour_type_key es requerido'),
  rate_eur: z
    .number()
    .min(0, 'La tarifa no puede ser negativa')
    .multipleOf(0.01, 'La tarifa debe tener como máximo 2 decimales'),
  effective_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'effective_from debe tener el formato YYYY-MM-DD'),
  effective_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'effective_to debe tener el formato YYYY-MM-DD')
    .optional()
    .nullable(),
});

// ============================================================
// Main handler
// ============================================================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin-consultant-rates-index');

  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  return handleMethodNotAllowed(res, ['GET', 'POST']);
}

// ============================================================
// GET — list rates with optional filters
// ============================================================

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (highestRole !== 'admin') {
      return sendAuthError(res, 'Solo administradores pueden listar todas las tarifas', 403);
    }

    const { consultant_id, hour_type_key, active_only } = req.query;

    // Resolve hour_type_key to hour_type_id if provided
    let hourTypeId: string | null = null;
    if (hour_type_key && typeof hour_type_key === 'string') {
      const { data: ht } = await serviceClient
        .from('hour_types')
        .select('id')
        .eq('key', hour_type_key)
        .single();
      if (ht) {
        hourTypeId = ht.id;
      }
    }

    // Build query: join consultant_rates with profiles and hour_types
    let query = serviceClient
      .from('consultant_rates')
      .select(
        `
        id,
        consultant_id,
        hour_type_id,
        rate_eur,
        effective_from,
        effective_to,
        created_at,
        updated_at,
        created_by,
        profiles:consultant_id ( id, first_name, last_name, email ),
        hour_types:hour_type_id ( id, key, display_name )
      `
      )
      .order('effective_from', { ascending: false });

    if (consultant_id && typeof consultant_id === 'string') {
      query = query.eq('consultant_id', consultant_id);
    }

    if (hourTypeId) {
      query = query.eq('hour_type_id', hourTypeId);
    }

    if (active_only === 'true') {
      // Active = effective_to is null OR effective_to > today
      const today = new Date().toISOString().slice(0, 10);
      query = query.or(`effective_to.is.null,effective_to.gt.${today}`);
    }

    const { data: rates, error: dbError } = await query;

    if (dbError) {
      return sendAuthError(res, 'Error al obtener tarifas de consultores', 500, dbError.message);
    }

    return sendApiResponse(res, { rates: rates ?? [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al listar tarifas', 500, message);
  }
}

// ============================================================
// POST — create a new rate
// ============================================================

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (highestRole !== 'admin') {
      return sendAuthError(res, 'Solo administradores pueden crear tarifas de consultores', 403);
    }

    const parsed = CreateRateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendAuthError(
        res,
        `Datos inválidos: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
        400
      );
    }

    const { consultant_id, hour_type_key, rate_eur, effective_from, effective_to } = parsed.data;

    // Resolve hour_type_key → hour_type_id
    const { data: hourType, error: htError } = await serviceClient
      .from('hour_types')
      .select('id, key, is_active')
      .eq('key', hour_type_key)
      .single();

    if (htError || !hourType) {
      return sendAuthError(
        res,
        `El tipo de hora '${hour_type_key}' no existe en el sistema.`,
        400
      );
    }

    // Verify consultant exists
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('id', consultant_id)
      .single();

    if (profileError || !profile) {
      return sendAuthError(res, 'El consultor especificado no existe.', 400);
    }

    // Insert rate — EXCLUDE constraint on (consultant_id, hour_type_id, daterange) will block overlaps
    const { data: inserted, error: insertError } = await serviceClient
      .from('consultant_rates')
      .insert({
        consultant_id,
        hour_type_id: hourType.id,
        rate_eur,
        effective_from,
        effective_to: effective_to ?? null,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (insertError) {
      // PostgreSQL exclusion constraint violation
      if (insertError.code === '23P01') {
        return sendAuthError(
          res,
          'Ya existe una tarifa activa para este consultor y tipo de hora en el período indicado. Los rangos de fechas no pueden superponerse.',
          409
        );
      }
      // Unique constraint
      if (insertError.code === '23505') {
        return sendAuthError(
          res,
          'Ya existe una tarifa con exactamente las mismas fechas para este consultor y tipo de hora.',
          409
        );
      }
      return sendAuthError(res, 'Error al crear la tarifa', 500, insertError.message);
    }

    return sendApiResponse(res, { rate: inserted }, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al crear tarifa', 500, message);
  }
}
