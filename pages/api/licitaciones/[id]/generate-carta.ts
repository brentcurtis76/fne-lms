/**
 * Generate Carta de Adjudicacion API
 * GET /api/licitaciones/[id]/generate-carta
 *
 * Generates a Carta de Adjudicacion .docx and stores it in Supabase storage.
 * State must be adjudicacion_pendiente and ganador_ate_id must be set.
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
import { uuidSchema } from '@/lib/validation/schemas';
import { generateCartaDocument } from '@/lib/cartaGenerator';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-generate-carta');

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
      return sendAuthError(res, 'No tiene permisos para generar la Carta de Adjudicacion', 403);
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

    // School scoping for encargado (must be checked before state to avoid leaking state info)
    if (!isAdmin && isEncargado) {
      const encargadoRole = userRoles.find(r => r.role_type === 'encargado_licitacion');
      const encargadoSchoolId = encargadoRole?.school_id != null ? Number(encargadoRole.school_id) : null;
      if (!encargadoRole || encargadoSchoolId !== licitacion.school_id) {
        return sendAuthError(res, 'No tiene permisos para esta licitacion', 403);
      }
    }

    // State check
    if (licitacion.estado !== 'adjudicacion_pendiente') {
      return sendAuthError(
        res,
        `La Carta de Adjudicacion solo puede generarse en estado "adjudicacion_pendiente". Estado actual: "${licitacion.estado}".`,
        422
      );
    }

    // Winner must be set
    if (!licitacion.ganador_ate_id) {
      return sendAuthError(res, 'Debe seleccionar un ATE ganador antes de generar la Carta de Adjudicacion.', 422);
    }

    // Fetch winner ATE (scoped to licitacion_id to prevent IDOR)
    const { data: ganadorAte } = await serviceClient
      .from('licitacion_ates')
      .select('nombre_ate, rut_ate, nombre_contacto')
      .eq('id', licitacion.ganador_ate_id)
      .eq('licitacion_id', licitacionId)
      .single();

    if (!ganadorAte) {
      return sendAuthError(res, 'ATE ganador no encontrado', 404);
    }

    // Fetch school
    const { data: school } = await serviceClient
      .from('schools')
      .select('name')
      .eq('id', licitacion.school_id)
      .single();

    if (!school) {
      return sendAuthError(res, 'Escuela no encontrada', 404);
    }

    // Fetch cliente for ciudad
    const { data: cliente } = await serviceClient
      .from('clientes')
      .select('ciudad, nombre_representante')
      .eq('id', licitacion.cliente_id)
      .single();

    const today = new Date().toISOString().split('T')[0];

    const docBuffer = await generateCartaDocument({
      licitacion: {
        nombre_licitacion: licitacion.nombre_licitacion,
        condiciones_pago: licitacion.condiciones_pago as string | null,
        monto_adjudicado_uf: licitacion.monto_adjudicado_uf ? Number(licitacion.monto_adjudicado_uf) : null,
        fecha_oferta_ganadora: licitacion.fecha_oferta_ganadora as string | null,
        contacto_coordinacion_nombre: licitacion.contacto_coordinacion_nombre as string | null,
        contacto_coordinacion_email: licitacion.contacto_coordinacion_email as string | null,
        contacto_coordinacion_telefono: licitacion.contacto_coordinacion_telefono as string | null,
      },
      ganadorAte: {
        nombre_ate: ganadorAte.nombre_ate,
        rut_ate: ganadorAte.rut_ate as string | null,
        nombre_contacto: ganadorAte.nombre_contacto as string | null,
      },
      school: {
        name: school.name,
        ciudad: cliente?.ciudad as string | null,
        director_nombre: cliente?.nombre_representante as string | null,
      },
      fechaEmision: today,
    });

    // Build storage path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const safeNumero = licitacion.numero_licitacion.replace(/[^a-zA-Z0-9-]/g, '_');
    const filename = `${timestamp}_${safeNumero}_carta-adjudicacion.docx`;
    const storagePath = `licitaciones/${licitacionId}/adjudicacion/${filename}`;

    // Upload to storage
    const { error: uploadError } = await serviceClient.storage
      .from('licitaciones')
      .upload(storagePath, docBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      });

    if (uploadError) {
      return sendAuthError(res, 'Error al almacenar la Carta generada', 500, uploadError.message);
    }

    // Insert document record
    const { data: docRecord, error: docInsertError } = await serviceClient
      .from('licitacion_documentos')
      .insert({
        licitacion_id: licitacionId,
        tipo: 'carta_adjudicacion_generada',
        nombre: `Carta Adjudicacion ${licitacion.numero_licitacion} — ${filename}`,
        storage_path: storagePath,
        file_name: filename,
        file_size: docBuffer.length,
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uploaded_by: user.id,
      })
      .select('*')
      .single();

    if (docInsertError) {
      await serviceClient.storage.from('licitaciones').remove([storagePath]);
      return sendAuthError(res, 'Error al registrar la Carta generada', 500, docInsertError.message);
    }

    // Update carta_adjudicacion_url on licitacion
    await serviceClient
      .from('licitaciones')
      .update({ carta_adjudicacion_url: storagePath })
      .eq('id', licitacionId);

    // Historial
    await serviceClient.from('licitacion_historial').insert({
      licitacion_id: licitacionId,
      accion: 'Carta de Adjudicacion generada',
      estado_anterior: licitacion.estado,
      estado_nuevo: licitacion.estado,
      detalles: { file_name: filename, storage_path: storagePath },
      user_id: user.id,
    });

    // Signed URL (1 hour)
    const { data: signedUrlData } = await serviceClient.storage
      .from('licitaciones')
      .createSignedUrl(storagePath, 3600);

    return sendApiResponse(res, {
      documento: docRecord,
      url: signedUrlData?.signedUrl || null,
      filename,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al generar la Carta de Adjudicacion', 500, message);
  }
}
