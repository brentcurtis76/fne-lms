import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { Validators } from '../../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../../utils/roleUtils';
import {
  SessionActivityLogInsert,
  SessionMaterialInsert,
  ContentVisibility,
} from '../../../../lib/types/consultor-sessions.types';
import { canViewSession, canContributeToSession, SessionAccessContext } from '../../../../lib/utils/session-policy';

export const config = {
  api: {
    bodyParser: false, // Disable Next.js body parser for multipart handling
  },
};

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-materials');

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  switch (req.method) {
    case 'GET':
      return await handleGet(req, res, id);
    case 'POST':
      return await handlePost(req, res, id);
    default:
      return handleMethodNotAllowed(res, ['GET', 'POST']);
  }
}

/**
 * GET /api/sessions/[id]/materials
 * List materials, visibility-filtered
 */
async function handleGet(req: NextApiRequest, res: NextApiResponse, sessionId: string) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch session
    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('id, growth_community_id, school_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return sendAuthError(res, 'Sesión no encontrada', 404);
    }

    // Determine user role
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    // Check if user is a facilitator for this session
    const { data: facilitatorCheck } = await serviceClient
      .from('session_facilitators')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();

    const isFacilitator = !!facilitatorCheck;

    // Use session-policy helper to check view access
    const accessContext: SessionAccessContext = {
      highestRole,
      userRoles,
      session: {
        school_id: session.school_id,
        growth_community_id: session.growth_community_id,
        status: 'programada', // Status not needed for view check
      },
      userId: user.id,
      isFacilitator,
    };

    if (!canViewSession(accessContext)) {
      return sendAuthError(res, 'Acceso denegado a esta sesión', 403);
    }

    // For visibility filtering, need to know if user can edit
    const isFacilitatorOrAdmin = highestRole === 'admin' || isFacilitator;

    // Fetch materials with uploader info
    const { data: materials, error: materialsError } = await serviceClient
      .from('session_materials')
      .select('*, profiles:uploaded_by(first_name, last_name, email)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (materialsError) {
      console.error('Error fetching materials:', materialsError);
      return sendAuthError(res, 'Error al obtener materiales', 500, materialsError.message);
    }

    // Visibility filtering
    let filteredMaterials = materials || [];

    if (!isFacilitatorOrAdmin) {
      // GC members see only all_participants materials
      filteredMaterials = filteredMaterials.filter((m) => m.visibility === 'all_participants');
    }

    // Generate signed URLs for downloads
    const materialsWithUrls = await Promise.all(
      filteredMaterials.map(async (material) => {
        try {
          const { data: signedUrlData } = await serviceClient.storage
            .from('session-materials')
            .createSignedUrl(material.storage_path, 3600); // 1 hour expiry

          return {
            ...material,
            download_url: signedUrlData?.signedUrl || null,
          };
        } catch (error) {
          console.error('Error generating signed URL:', error);
          return material;
        }
      })
    );

    return sendApiResponse(res, { materials: materialsWithUrls });
  } catch (error: any) {
    console.error('Get materials error:', error);
    return sendAuthError(res, 'Error inesperado al obtener materiales', 500, error.message);
  }
}

/**
 * POST /api/sessions/[id]/materials
 * Upload a material file
 */
async function handlePost(req: NextApiRequest, res: NextApiResponse, sessionId: string) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch session (need school_id for access context)
    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('id, status, school_id, growth_community_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return sendAuthError(res, 'Sesión no encontrada', 404);
    }

    // Auth check and status check: use session-policy helper
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    // Check if user is a facilitator
    const { data: facilitatorCheck } = await serviceClient
      .from('session_facilitators')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();

    const isFacilitator = !!facilitatorCheck;

    // Use session-policy helper to check contribute access
    const accessContext: SessionAccessContext = {
      highestRole,
      userRoles,
      session: {
        school_id: session.school_id,
        growth_community_id: session.growth_community_id,
        status: session.status,
      },
      userId: user.id,
      isFacilitator,
    };

    // Materials upload is restricted to facilitators (not GC leaders)
    const canUpload = highestRole === 'admin' || isFacilitator;

    if (!canUpload) {
      return sendAuthError(res, 'Solo facilitadores pueden subir materiales', 403);
    }

    // Also check that session is not completada/cancelada
    if (session.status === 'completada' || session.status === 'cancelada') {
      return sendAuthError(res, 'No se pueden subir materiales a sesiones completadas o canceladas', 403);
    }

    // Parse multipart form data
    const form = formidable({ maxFileSize: MAX_FILE_SIZE });

    const { fields, files } = await new Promise<{ fields: any; files: any }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          reject(err);
        } else {
          resolve({ fields, files });
        }
      });
    });

    // Extract file
    const fileArray = Array.isArray(files.file) ? files.file : [files.file];
    const file = fileArray[0];

    if (!file) {
      return sendAuthError(res, 'No se proporcionó ningún archivo', 400);
    }

    // Validate MIME type
    const mimeType = file.mimetype || 'application/octet-stream';
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return sendAuthError(res, 'Tipo de archivo no permitido', 400);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return sendAuthError(res, 'Archivo excede el tamaño máximo de 25 MB', 400);
    }

    // Read file content
    const fileBuffer = readFileSync(file.filepath);

    // Generate storage path
    const fileName = file.originalFilename || 'archivo';
    const fileExtension = fileName.split('.').pop() || '';
    const uniqueId = randomUUID();
    const storagePath = `sessions/${sessionId}/${uniqueId}_${fileName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await serviceClient.storage
      .from('session-materials')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading to storage:', uploadError);
      return sendAuthError(res, 'Error al subir archivo', 500, uploadError.message);
    }

    // Store the storage path as file_url reference (private bucket - signed URLs used for download)
    const fileUrl = `storage://session-materials/${storagePath}`;

    // Extract visibility from fields
    const visibilityField = Array.isArray(fields.visibility) ? fields.visibility[0] : fields.visibility;
    const descriptionField = Array.isArray(fields.description) ? fields.description[0] : fields.description;
    const finalVisibility: ContentVisibility = visibilityField || 'facilitators_only';

    if (!['facilitators_only', 'all_participants'].includes(finalVisibility)) {
      // Rollback: delete uploaded file
      await serviceClient.storage.from('session-materials').remove([storagePath]);
      return sendAuthError(res, 'Visibilidad inválida', 400);
    }

    // Insert material record
    const materialData: SessionMaterialInsert = {
      session_id: sessionId,
      uploaded_by: user.id,
      file_name: fileName,
      file_url: fileUrl,
      file_type: mimeType,
      file_size: file.size,
      storage_path: storagePath,
      description: descriptionField || null,
      visibility: finalVisibility,
    };

    const { data: newMaterial, error: insertError } = await serviceClient
      .from('session_materials')
      .insert(materialData)
      .select('*')
      .single();

    if (insertError) {
      console.error('Error inserting material record:', insertError);
      // Rollback: delete uploaded file
      await serviceClient.storage.from('session-materials').remove([storagePath]);
      return sendAuthError(res, 'Error al guardar registro de material', 500, insertError.message);
    }

    // Insert activity log
    const activityLogEntry: SessionActivityLogInsert = {
      session_id: sessionId,
      user_id: user.id,
      action: 'materials_uploaded',
      details: { file_name: fileName, file_size: file.size, visibility: finalVisibility },
    };

    const { error: logError } = await serviceClient
      .from('session_activity_log')
      .insert(activityLogEntry);

    if (logError) {
      console.error('Error inserting activity log:', logError);
      // Don't fail the request
    }

    return sendApiResponse(res, { material: newMaterial }, 201);
  } catch (error: any) {
    console.error('Upload material error:', error);
    return sendAuthError(res, 'Error inesperado al subir material', 500, error.message);
  }
}
