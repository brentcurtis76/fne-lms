import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasAssessmentWritePermission } from '@/lib/assessment-permissions';

/**
 * POST /api/admin/assessment-builder/templates/[templateId]/archive
 * Archives a published template
 *
 * POST /api/admin/assessment-builder/templates/[templateId]/archive?action=restore
 * Restores an archived template back to published
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  const hasPermission = await hasAssessmentWritePermission(supabaseClient, user.id);
  if (!hasPermission) {
    return res.status(403).json({ error: 'No tienes permiso para archivar templates' });
  }

  const { templateId } = req.query;
  const action = req.query.action as string;

  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId es requerido' });
  }

  try {
    // Get current template
    const { data: template, error: templateError } = await supabaseClient
      .from('assessment_templates')
      .select('id, name, status, is_archived')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Template no encontrado' });
    }

    if (action === 'restore') {
      // Restore from archive
      if (!template.is_archived) {
        return res.status(400).json({ error: 'El template no está archivado' });
      }

      const { error: updateError } = await supabaseClient
        .from('assessment_templates')
        .update({
          is_archived: false,
          archived_at: null,
          archived_by: null,
        })
        .eq('id', templateId);

      if (updateError) {
        console.error('Error restoring template:', updateError);
        return res.status(500).json({ error: 'Error al restaurar el template' });
      }

      return res.status(200).json({
        success: true,
        message: 'Template restaurado correctamente',
        template: {
          id: template.id,
          name: template.name,
          is_archived: false,
        },
      });
    } else {
      // Archive template
      if (template.is_archived) {
        return res.status(400).json({ error: 'El template ya está archivado' });
      }

      if (template.status === 'draft') {
        return res.status(400).json({
          error: 'Los templates en borrador deben ser eliminados, no archivados',
        });
      }

      const { error: updateError } = await supabaseClient
        .from('assessment_templates')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: user.id,
        })
        .eq('id', templateId);

      if (updateError) {
        console.error('Error archiving template:', updateError);
        return res.status(500).json({ error: 'Error al archivar el template' });
      }

      return res.status(200).json({
        success: true,
        message: 'Template archivado correctamente',
        template: {
          id: template.id,
          name: template.name,
          is_archived: true,
        },
      });
    }
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
}
