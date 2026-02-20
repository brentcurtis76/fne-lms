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
import { BasesTemplateSchema } from '@/types/licitaciones';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin-licitaciones-templates');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['GET', 'POST']);
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

    // Template management is admin-only (per Role Access Matrix)
    if (!isAdmin) {
      return sendAuthError(res, 'Solo administradores pueden gestionar plantillas', 403);
    }

    // ============================================================
    // GET — List all programs with their active templates
    // ============================================================
    if (req.method === 'GET') {
      // Fetch all active programs
      const { data: programas, error: programasError } = await serviceClient
        .from('programas')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre', { ascending: true });

      if (programasError) {
        return sendAuthError(res, 'Error al obtener programas', 500, programasError.message);
      }

      // Fetch active templates for each program
      const { data: templates, error: templatesError } = await serviceClient
        .from('programa_bases_templates')
        .select('*')
        .eq('is_active', true);

      if (templatesError) {
        return sendAuthError(res, 'Error al obtener plantillas', 500, templatesError.message);
      }

      const templatesByPrograma = new Map<string, Record<string, unknown>>();
      for (const t of (templates || [])) {
        templatesByPrograma.set(String(t.programa_id), t as Record<string, unknown>);
      }

      const result = (programas || []).map(p => ({
        programa: { id: String(p.id), nombre: String(p.nombre) },
        template: templatesByPrograma.get(String(p.id)) || null,
      }));

      return sendApiResponse(res, { programas: result });
    }

    // ============================================================
    // POST — Create new template version (deactivate current, insert new)
    // ============================================================
    if (req.method === 'POST') {
      const { programa_id, ...templateFields } = req.body as {
        programa_id?: string;
      } & Record<string, unknown>;

      if (!programa_id) {
        return sendAuthError(res, 'programa_id requerido', 400);
      }

      // Validate programa exists
      const { data: programa } = await serviceClient
        .from('programas')
        .select('id, nombre')
        .eq('id', programa_id)
        .single();

      if (!programa) {
        return sendAuthError(res, 'Programa no encontrado', 404);
      }

      const parseResult = BasesTemplateSchema.safeParse(templateFields);
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
      }

      const templateData = parseResult.data;

      // Find current active template (for versioning)
      const { data: currentTemplate } = await serviceClient
        .from('programa_bases_templates')
        .select('id, version')
        .eq('programa_id', programa_id)
        .eq('is_active', true)
        .single();

      const nextVersion = currentTemplate ? (Number(currentTemplate.version) + 1) : 1;

      // Deactivate current template if exists
      if (currentTemplate) {
        await serviceClient
          .from('programa_bases_templates')
          .update({ is_active: false })
          .eq('id', currentTemplate.id);
      }

      // Insert new template version
      const { data: newTemplate, error: insertError } = await serviceClient
        .from('programa_bases_templates')
        .insert({
          programa_id,
          nombre_servicio: templateData.nombre_servicio,
          objetivo: templateData.objetivo,
          objetivos_especificos: templateData.objetivos_especificos,
          especificaciones_admin: templateData.especificaciones_admin,
          resultados_esperados: templateData.resultados_esperados,
          requisitos_ate: templateData.requisitos_ate,
          documentos_adjuntar: templateData.documentos_adjuntar,
          condiciones_pago: templateData.condiciones_pago || null,
          version: nextVersion,
          is_active: true,
          created_by: user.id,
        })
        .select('*')
        .single();

      if (insertError) {
        // Reactivate old template if insert failed
        if (currentTemplate) {
          await serviceClient
            .from('programa_bases_templates')
            .update({ is_active: true })
            .eq('id', currentTemplate.id);
        }
        return sendAuthError(res, 'Error al guardar la plantilla', 500, insertError.message);
      }

      return sendApiResponse(res, { template: newTemplate }, 201);
    }

    return sendAuthError(res, 'Metodo no permitido', 405);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error inesperado', 500, message);
  }
}
