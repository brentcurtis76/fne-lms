/**
 * Download ZIP API
 * POST /api/licitaciones/[id]/download-zip
 *
 * Generates a ZIP archive containing all documents for a licitacion,
 * organized in folders by document type category.
 *
 * Folder structure: LIC-YYYY-SCHOOL-SEQ/01-publicacion/...
 *
 * Access: admin=any licitacion, encargado=own school only.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import JSZip from 'jszip';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  logApiRequest,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import { getUserRoles } from '@/utils/roleUtils';
import { uuidSchema } from '@/lib/validation/schemas';
import { LicitacionDocumento } from '@/types/licitaciones';

export const config = {
  api: {
    responseLimit: false,
  },
};

// Maximum total size (100 MB) to prevent memory exhaustion on Vercel
const MAX_TOTAL_SIZE_BYTES = 100 * 1024 * 1024;

// Document tipo -> folder name mapping
const TIPO_FOLDER: Record<string, string> = {
  publicacion_imagen: '01-publicacion',
  bases_generadas: '02-bases',
  bases_enviadas: '02-bases',
  propuesta: '03-propuestas',
  evaluacion_generada: '04-evaluacion',
  evaluacion_firmada: '04-evaluacion',
  carta_adjudicacion_generada: '05-adjudicacion',
  carta_adjudicacion_firmada: '05-adjudicacion',
  otro: '06-otros',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-download-zip');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
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
      return sendAuthError(res, 'No tiene permisos para descargar documentos', 403);
    }

    // Fetch licitacion
    const { data: licitacion, error: licitError } = await serviceClient
      .from('licitaciones')
      .select('id, school_id, numero_licitacion')
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

    // Fetch all documents for this licitacion
    const { data: documentos, error: docError } = await serviceClient
      .from('licitacion_documentos')
      .select('*')
      .eq('licitacion_id', licitacionId)
      .order('created_at', { ascending: true });

    if (docError) {
      return sendAuthError(res, 'Error al obtener documentos', 500, docError.message);
    }

    if (!documentos || documentos.length === 0) {
      return sendAuthError(res, 'Esta licitacion no tiene documentos para descargar', 404);
    }

    // Size guard: check declared file sizes before downloading
    const declaredTotalSize = (documentos as LicitacionDocumento[]).reduce(
      (sum, doc) => sum + (doc.file_size || 0),
      0
    );
    if (declaredTotalSize > MAX_TOTAL_SIZE_BYTES) {
      return sendAuthError(
        res,
        `Los documentos superan el limite de descarga (${Math.round(MAX_TOTAL_SIZE_BYTES / 1024 / 1024)} MB). Descargue los archivos individualmente.`,
        413
      );
    }

    // Build ZIP
    const zip = new JSZip();
    const zipRootFolder = licitacion.numero_licitacion || licitacionId;

    let totalBytesProcessed = 0;

    for (const doc of documentos as LicitacionDocumento[]) {
      // Validate storage_path to prevent path traversal
      const storagePath = doc.storage_path;
      if (!storagePath || storagePath.includes('..') || storagePath.startsWith('/')) {
        // Skip invalid paths
        continue;
      }

      // Download file from Supabase Storage
      const { data: fileData, error: downloadError } = await serviceClient.storage
        .from('licitaciones')
        .download(storagePath);

      if (downloadError || !fileData) {
        // Log and skip missing files rather than failing the whole ZIP
        continue;
      }

      const fileBuffer = await fileData.arrayBuffer();
      totalBytesProcessed += fileBuffer.byteLength;

      if (totalBytesProcessed > MAX_TOTAL_SIZE_BYTES) {
        return sendAuthError(
          res,
          `Los documentos superan el limite de descarga durante la generacion. Descargue los archivos individualmente.`,
          413
        );
      }

      // Determine folder
      const folder = TIPO_FOLDER[doc.tipo] || '06-otros';
      const fileName = doc.file_name || `documento-${doc.id}`;

      // Add file to ZIP with folder structure
      zip.folder(`${zipRootFolder}/${folder}`)?.file(fileName, fileBuffer);
    }

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const safeZipName = (licitacion.numero_licitacion || licitacionId)
      .replace(/[^a-zA-Z0-9._\-]/g, '_')
      .replace(/"/g, '')
      .substring(0, 100);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeZipName}.zip"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.status(200).end(zipBuffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al generar el archivo ZIP', 500, message);
  }
}
