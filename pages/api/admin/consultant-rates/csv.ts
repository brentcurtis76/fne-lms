import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { getUserRoles, getHighestRole } from '../../../../utils/roleUtils';
import { csvEscape } from '../../../../lib/exportUtils';

// ============================================================
// Handler
// ============================================================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin-consultant-rates-csv');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (highestRole !== 'admin') {
      return sendAuthError(res, 'Solo administradores pueden exportar tarifas de consultores', 403);
    }

    // Fetch all rates with joined consultant name and hour type
    const { data: rates, error: dbError } = await serviceClient
      .from('consultant_rates')
      .select(
        `
        id,
        rate_eur,
        effective_from,
        effective_to,
        profiles:consultant_id ( first_name, last_name ),
        hour_types:hour_type_id ( display_name )
      `
      )
      .order('effective_from', { ascending: false });

    if (dbError) {
      return sendAuthError(res, 'Error al obtener tarifas de consultores', 500, dbError.message);
    }

    // Build CSV
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `tarifas-consultores-${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // UTF-8 BOM for Excel
    res.write('\uFEFF');

    // Header row
    res.write('Consultor,Tipo de Hora,Tarifa EUR,Vigente Desde,Vigente Hasta\n');

    for (const rawRate of (rates ?? [])) {
      const rate = rawRate as unknown as {
        rate_eur: number;
        effective_from: string;
        effective_to: string | null;
        profiles: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
        hour_types: { display_name: string } | { display_name: string }[] | null;
      };
      const profileObj = Array.isArray(rate.profiles) ? rate.profiles[0] : rate.profiles;
      const hourTypeObj = Array.isArray(rate.hour_types) ? rate.hour_types[0] : rate.hour_types;
      const consultorName =
        profileObj
          ? `${profileObj.first_name ?? ''} ${profileObj.last_name ?? ''}`.trim()
          : '';
      const hourTypeName = hourTypeObj?.display_name ?? '';
      const rateEur = rate.rate_eur.toFixed(2);
      const desde = rate.effective_from ?? '';
      const hasta = rate.effective_to ?? '';

      res.write(
        [
          csvEscape(consultorName),
          csvEscape(hourTypeName),
          csvEscape(rateEur),
          csvEscape(desde),
          csvEscape(hasta),
        ].join(',') + '\n'
      );
    }

    res.end();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al exportar tarifas', 500, message);
  }
}
