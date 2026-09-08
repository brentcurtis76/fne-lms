import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasAssessmentWritePermission } from '@/lib/assessment-permissions';
import { publishTemplate } from '@/lib/services/assessment-builder/publishTemplate';

/**
 * POST /api/admin/assessment-builder/templates/[templateId]/publish
 *
 * Publishes a draft template:
 * 1. Validates template has at least 1 module with 1 indicator
 * 2. Creates an immutable snapshot with full nested data
 * 3. Increments the version number
 * 4. Sets status to 'published'
 *
 * PR 3 (item 2): every frecuencia indicator must carry a complete
 * frequency_config (finite min < max, step > 0, unit, allowed_units containing
 * unit) or publishing fails with HTTP 400 listing the offending indicators. The
 * scorer would otherwise silently assume max = 100 for the whole instrument.
 *
 * PR 4 (pilot provisioning): steps 1-4 were extracted verbatim into
 * `lib/services/assessment-builder/publishTemplate.ts`; this handler keeps
 * auth, permission and containment checks and maps the service result to HTTP.
 *
 * PROC-CONTAIN-01 (A-01): a request carrying `upgradeExisting: true` is rejected
 * with HTTP 409 before any read or write. The former "upgrade existing
 * assignments" path matched old instances by AREA only (grade-blind) and
 * cloned them onto the new snapshot; it was removed from the service.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  // Permission check - query user_roles table
  const hasPermission = await hasAssessmentWritePermission(supabaseClient, user.id);
  if (!hasPermission) {
    return res.status(403).json({ error: 'No tienes permiso para publicar templates' });
  }

  const { templateId } = req.query;
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId es requerido' });
  }

  // Refuse the disabled upgrade flag before touching the database, so no
  // snapshot insert or status update can happen on a request that asked for it.
  const upgradeExistingRequested = Boolean(
    (req.body as { upgradeExisting?: unknown } | null | undefined)?.upgradeExisting
  );
  if (upgradeExistingRequested) {
    return res.status(409).json({
      error:
        'La actualización automática de evaluaciones existentes está deshabilitada. ' +
        'Publique el template sin esa opción; las evaluaciones existentes deben migrarse con un proceso que valide el nivel.',
      code: 'upgrade_existing_disabled',
    });
  }

  try {
    // Validation + snapshot + status flip live in the shared publication
    // service so the pilot-provisioning CLI and this route publish through
    // ONE validated code path. The result is mapped to the same HTTP shapes
    // this route always produced.
    const result = await publishTemplate(supabaseClient, templateId, { id: user.id });

    if (result.ok === false) {
      return res.status(result.status).json({
        error: result.error,
        ...(result.code !== undefined ? { code: result.code } : {}),
        ...(result.details !== undefined ? { details: result.details } : {}),
      });
    }

    return res.status(200).json({
      success: true,
      message: `Template publicado como versión ${result.newVersion}`,
      template: {
        id: result.template.id,
        name: result.template.name,
        area: result.template.area,
        status: result.template.status,
        version: result.template.version,
        isAlwaysGT: result.isAlwaysGT,
        requiresDualExpectations: result.requiresDualExpectations,
      },
      snapshot: {
        id: result.snapshot.id,
        version: result.snapshot.version,
        createdAt: result.snapshot.createdAt,
      },
      warnings: result.warnings.length > 0 ? result.warnings : undefined,
    });
  } catch (err: any) {
    console.error('Unexpected error publishing template:', err);
    return res.status(500).json({ error: err.message || 'Error al publicar template' });
  }
}
