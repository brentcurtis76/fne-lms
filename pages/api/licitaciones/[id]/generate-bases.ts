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
import { generateBasesDocument, BasesDocumentData } from '@/lib/docxGenerator';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-generate-bases');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { id } = req.query;
  const idParse = uuidSchema.safeParse(id);
  if (!idParse.success) {
    return sendAuthError(res, 'ID de licitacion invalido', 400);
  }
  const licitacionId = idParse.data;

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'No autorizado', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const roleTypes = userRoles.map(r => r.role_type);
    const isAdmin = roleTypes.includes('admin');
    const isEncargado = roleTypes.includes('encargado_licitacion');

    if (!isAdmin && !isEncargado) {
      return sendAuthError(res, 'No tiene permisos para generar Bases', 403);
    }

    // Fetch licitacion
    const { data: licitacion, error: licitError } = await serviceClient
      .from('licitaciones')
      .select('*')
      .eq('id', licitacionId)
      .single();

    if (licitError || !licitacion) {
      return sendAuthError(res, 'Licitacion no encontrada', 404);
    }

    // School scoping for encargado
    if (!isAdmin && isEncargado) {
      const encargadoRole = userRoles.find(r => r.role_type === 'encargado_licitacion');
      const encargadoSchoolId = encargadoRole?.school_id != null ? Number(encargadoRole.school_id) : null;
      if (!encargadoRole || encargadoSchoolId !== licitacion.school_id) {
        return sendAuthError(res, 'No tiene permisos para esta licitacion', 403);
      }
    }

    // Fetch school
    const { data: school } = await serviceClient
      .from('schools')
      .select('id, name, code')
      .eq('id', licitacion.school_id)
      .single();

    if (!school) {
      return sendAuthError(res, 'Escuela no encontrada', 404);
    }

    // Fetch cliente
    const { data: cliente } = await serviceClient
      .from('clientes')
      .select('id, nombre_legal, nombre_fantasia, rut, direccion, comuna, ciudad, nombre_representante, rut_representante')
      .eq('id', licitacion.cliente_id)
      .single();

    if (!cliente) {
      return sendAuthError(res, 'Cliente no encontrado', 404);
    }

    // Fetch programa - try 'name' first, then 'nombre'
    const { data: programaData } = await serviceClient
      .from('programas')
      .select('id, nombre')
      .eq('id', licitacion.programa_id)
      .single();

    // The programas table uses 'nombre' column (confirmed by DB agent and migrations)
    const programaNombre =
      (typeof programaData?.nombre === 'string' && programaData.nombre) ||
      '[Programa]';

    const programa = {
      id: licitacion.programa_id,
      nombre: programaNombre,
    };

    // Fetch active template for this program
    const { data: templateData, error: templateError } = await serviceClient
      .from('programa_bases_templates')
      .select('*')
      .eq('programa_id', licitacion.programa_id)
      .eq('is_active', true)
      .single();

    if (templateError || !templateData) {
      return sendAuthError(
        res,
        'No se encontro una plantilla activa para este programa. Configure la plantilla en /admin/licitaciones/templates antes de generar las Bases.',
        422
      );
    }

    // Fetch evaluation criteria for this program
    const { data: criteriosData } = await serviceClient
      .from('programa_evaluacion_criterios')
      .select('*')
      .eq('programa_id', licitacion.programa_id)
      .eq('is_active', true)
      .order('orden', { ascending: true });

    const criterios = (criteriosData || []).map(c => ({
      nombre_criterio: String(c.nombre_criterio),
      puntaje_maximo: Number(c.puntaje_maximo),
      descripcion: c.descripcion as string | null,
      orden: Number(c.orden),
    }));

    // Safely parse JSONB fields from template
    const parseJsonbArray = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.map(String);
      if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return []; }
      }
      return [];
    };

    const parseJsonbObject = (value: unknown): Record<string, string> => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, string>;
      }
      if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return {}; }
      }
      return {};
    };

    const docData: BasesDocumentData = {
      licitacion: {
        id: licitacion.id,
        numero_licitacion: licitacion.numero_licitacion,
        nombre_licitacion: licitacion.nombre_licitacion,
        year: licitacion.year,
        monto_minimo: licitacion.monto_minimo,
        monto_maximo: licitacion.monto_maximo,
        tipo_moneda: licitacion.tipo_moneda,
        duracion_minima: licitacion.duracion_minima,
        duracion_maxima: licitacion.duracion_maxima,
        peso_evaluacion_tecnica: licitacion.peso_evaluacion_tecnica,
        peso_evaluacion_economica: licitacion.peso_evaluacion_economica,
        email_licitacion: licitacion.email_licitacion,
        fecha_publicacion: licitacion.fecha_publicacion,
        fecha_limite_solicitud_bases: licitacion.fecha_limite_solicitud_bases,
        fecha_limite_consultas: licitacion.fecha_limite_consultas,
        fecha_inicio_propuestas: licitacion.fecha_inicio_propuestas,
        fecha_limite_propuestas: licitacion.fecha_limite_propuestas,
        fecha_limite_evaluacion: licitacion.fecha_limite_evaluacion,
        modalidad_preferida: licitacion.modalidad_preferida,
        participantes_estimados: licitacion.participantes_estimados,
      },
      school: {
        name: school.name,
        code: school.code,
      },
      cliente: {
        nombre_legal: cliente.nombre_legal,
        nombre_fantasia: cliente.nombre_fantasia,
        rut: cliente.rut,
        direccion: cliente.direccion,
        comuna: cliente.comuna,
        ciudad: cliente.ciudad,
        nombre_representante: cliente.nombre_representante,
        rut_representante: cliente.rut_representante,
      },
      programa,
      template: {
        nombre_servicio: String(templateData.nombre_servicio),
        objetivo: String(templateData.objetivo),
        objetivos_especificos: parseJsonbArray(templateData.objetivos_especificos),
        especificaciones_admin: parseJsonbObject(templateData.especificaciones_admin),
        resultados_esperados: parseJsonbArray(templateData.resultados_esperados),
        requisitos_ate: parseJsonbArray(templateData.requisitos_ate),
        documentos_adjuntar: parseJsonbArray(templateData.documentos_adjuntar),
        condiciones_pago: templateData.condiciones_pago as string | null,
      },
      criterios,
    };

    // Generate the document
    const docBuffer = await generateBasesDocument(docData);

    // Build storage path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const safeNumero = licitacion.numero_licitacion.replace(/[^a-zA-Z0-9-]/g, '_');
    const filename = `${timestamp}_${safeNumero}_bases.docx`;
    const storagePath = `licitaciones/${licitacionId}/bases_generadas/${filename}`;

    // Upload to Supabase storage
    const { error: uploadError } = await serviceClient.storage
      .from('licitaciones')
      .upload(storagePath, docBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      });

    if (uploadError) {
      return sendAuthError(res, 'Error al almacenar el documento generado', 500, uploadError.message);
    }

    // Insert licitacion_documentos record
    const { data: docRecord, error: docInsertError } = await serviceClient
      .from('licitacion_documentos')
      .insert({
        licitacion_id: licitacionId,
        tipo: 'bases_generadas',
        nombre: `Bases ${licitacion.numero_licitacion} — ${filename}`,
        storage_path: storagePath,
        file_name: filename,
        file_size: docBuffer.length,
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uploaded_by: user.id,
      })
      .select('*')
      .single();

    if (docInsertError) {
      // Rollback storage
      await serviceClient.storage.from('licitaciones').remove([storagePath]);
      return sendAuthError(res, 'Error al registrar el documento generado', 500, docInsertError.message);
    }

    // Create historial entry
    await serviceClient.from('licitacion_historial').insert({
      licitacion_id: licitacionId,
      accion: 'Bases generadas',
      estado_anterior: licitacion.estado,
      estado_nuevo: licitacion.estado,
      detalles: { file_name: filename, storage_path: storagePath, template_version: templateData.version },
      user_id: user.id,
    });

    // Generate signed URL (1 hour)
    const { data: signedUrlData } = await serviceClient.storage
      .from('licitaciones')
      .createSignedUrl(storagePath, 3600);

    return sendApiResponse(res, {
      documento: docRecord,
      download_url: signedUrlData?.signedUrl || null,
      filename,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al generar el documento de Bases', 500, message);
  }
}
