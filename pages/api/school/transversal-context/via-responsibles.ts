import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasDirectivoPermissionForSchool, isFullDirectivoScope } from '@/lib/permissions/directivo';
import {
  getSchoolViaOverview,
  listResponsibleCandidates,
  writeSchoolViaResponsible,
  type SchoolViaMode,
} from '@/lib/services/assessment-builder/schoolViaAssignmentService';

/**
 * Registros del equipo directivo (migration 20261008120000).
 *
 * GET  ?school_id=N  → every school-level vía with its published templates,
 *                      current responsible and pending delivery; plus the
 *                      Equipo Directivo candidates when the caller may write.
 * POST { school_id, area, user_id, mode: 'assign' | 'replace' }
 *                    → assign / re-send / replace through the locked RPCs.
 *
 * Authorization is always decided against the REQUESTED school:
 * - read: admin, equipo_directivo of that school, or a consultor assigned to
 *   it (hasDirectivoPermissionForSchool: multi-role people are matched on the
 *   requested school, not on their first role);
 * - write: admin or equipo_directivo of that school only. The RPC re-checks
 *   the actor and the candidate inside the write transaction.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['GET', 'POST']);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const rawSchoolId = req.method === 'GET' ? req.query.school_id : req.body?.school_id;
  const schoolId = Number(rawSchoolId);
  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    return res.status(400).json({ error: 'Se requiere school_id' });
  }

  const serviceClient = createServiceRoleClient();
  const permission = await hasDirectivoPermissionForSchool(serviceClient, user.id, schoolId);
  if (!permission.hasPermission) {
    return res.status(403).json({ error: 'No tiene acceso a esta escuela' });
  }
  const canWrite = isFullDirectivoScope(permission);

  if (req.method === 'GET') {
    const overview = await getSchoolViaOverview(schoolId);
    if (overview.kind === 'error') {
      return res.status(500).json({ error: overview.message });
    }
    let vias = overview.vias;
    if (permission.via === 'consultor') {
      // N1: a consultor sees only the instruments the database lets them read
      // (admins and the school's Equipo Directivo manage delivery and keep
      // seeing every eligible instrument). Asked with the consultor's own
      // session; an unreadable answer fails closed.
      const sessionClient = await createApiSupabaseClient(req, res);
      const { data: readableRows, error: readableError } = await sessionClient.rpc('auth_readable_template_ids');
      if (readableError) {
        console.error('[via-responsibles] readable instruments read failed:', readableError.message);
        return res.status(500).json({ error: 'No se pudo leer el estado de los registros del equipo directivo.' });
      }
      const readable = new Set<string>(
        (Array.isArray(readableRows) ? readableRows : []).map((row: any) =>
          typeof row === 'string' ? row : row?.auth_readable_template_ids
        )
      );
      vias = vias.map((via) => ({
        ...via,
        templates: via.templates.filter((t) => readable.has(t.id)),
        pendingTemplates: via.pendingTemplates.filter((t) => readable.has(t.id)),
      }));
    }
    let candidates: { id: string; name: string; email: string | null }[] = [];
    if (canWrite) {
      const list = await listResponsibleCandidates(schoolId);
      if (list.kind === 'error') return res.status(500).json({ error: list.message });
      candidates = list.people;
    }
    return res.status(200).json({ vias, candidates, canWrite });
  }

  if (!canWrite) {
    return res.status(403).json({
      code: 'assignment_write_forbidden',
      error: 'Solo el equipo directivo y los administradores pueden asignar responsables',
    });
  }

  const { area, user_id: userId, mode } = req.body ?? {};
  if (typeof area !== 'string' || !area || typeof userId !== 'string' || !userId || (mode !== 'assign' && mode !== 'replace')) {
    return res.status(400).json({ error: 'Se requiere area, user_id y mode (assign | replace)' });
  }

  const result = await writeSchoolViaResponsible({
    mode: mode as SchoolViaMode,
    schoolId,
    area,
    userId,
    by: user.id,
  });

  if (result.kind === 'error') {
    return res.status(result.status).json({ code: result.code, error: result.message, templates: result.templates });
  }
  return res.status(200).json({ mode: result.mode, details: result.details });
}
