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
  SessionReportInsert,
  ReportVisibility,
} from '../../../../lib/types/consultor-sessions.types';
import { transcribeAudio, generateReportSummary } from '../../../../lib/services/audio-transcription';

export const config = {
  api: {
    bodyParser: false, // Required for formidable multipart parsing
  },
};

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'audio/webm',
  'audio/aac',
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-audio-report');

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  return await handlePost(req, res, id);
}

/**
 * POST /api/sessions/[id]/audio-report
 * Upload audio, transcribe, generate AI summary, create report
 */
async function handlePost(req: NextApiRequest, res: NextApiResponse, sessionId: string) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch session
    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('id, status, title, session_date, objectives, schools(name), growth_communities(name)')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return sendAuthError(res, 'Sesión no encontrada', 404);
    }

    // Status guard: reject completada/cancelada (CRITICAL - from Architect review)
    if (session.status === 'completada' || session.status === 'cancelada') {
      return sendAuthError(
        res,
        'No se pueden crear informes en sesiones completadas o canceladas',
        403
      );
    }

    // Auth check: facilitator or admin only (copy from reports.ts)
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    let canCreate = false;

    if (highestRole === 'admin') {
      canCreate = true;
    } else {
      const { data: facilitatorCheck } = await serviceClient
        .from('session_facilitators')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (facilitatorCheck) {
        canCreate = true;
      }
    }

    if (!canCreate) {
      return sendAuthError(res, 'Solo facilitadores pueden crear informes', 403);
    }

    // CRITICAL: Report uniqueness check (Architect refinement #1)
    // Check for existing session_report by this author
    const { data: existingReport } = await serviceClient
      .from('session_reports')
      .select('id')
      .eq('session_id', sessionId)
      .eq('author_id', user.id)
      .eq('report_type', 'session_report')
      .single();

    if (existingReport) {
      return sendAuthError(res, 'Ya existe un informe de sesión para este autor', 400);
    }

    // Parse multipart form data
    const form = formidable({ maxFileSize: MAX_FILE_SIZE });

    const { fields, files } = await new Promise<{ fields: Record<string, unknown>; files: Record<string, unknown> }>(
      (resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) {
            reject(err);
          } else {
            resolve({ fields, files });
          }
        });
      }
    );

    // CRITICAL: Extract file from files.audio (not files.file) - Architect refinement #3
    const audioArray = Array.isArray(files.audio) ? files.audio : [files.audio];
    const audioFile = audioArray[0];

    if (!audioFile) {
      return sendAuthError(res, 'No se proporcionó ningún archivo de audio', 400);
    }

    // Validate MIME type
    const mimeType = audioFile.mimetype || 'application/octet-stream';
    if (!ALLOWED_AUDIO_MIME_TYPES.includes(mimeType)) {
      return sendAuthError(
        res,
        'Tipo de archivo no permitido. Se requiere un archivo de audio (MP3, WAV, M4A, OGG, WEBM, AAC)',
        400
      );
    }

    // Validate file size
    if (audioFile.size > MAX_FILE_SIZE) {
      return sendAuthError(res, 'Archivo excede el tamaño máximo de 25 MB', 400);
    }

    // Read file content
    const fileBuffer = readFileSync(audioFile.filepath);

    // Generate storage path
    const fileName = audioFile.originalFilename || 'audio';
    const uniqueId = randomUUID();
    const storagePath = `sessions/${sessionId}/${uniqueId}_${fileName}`;

    // CRITICAL: Upload using serviceClient (Architect refinement #2 - no RLS policies)
    const { data: uploadData, error: uploadError } = await serviceClient.storage
      .from('session-audio')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading to storage:', uploadError);
      return sendAuthError(res, 'Error al subir el archivo de audio', 500, uploadError.message);
    }

    // Transcribe audio
    let transcript: string;
    try {
      transcript = await transcribeAudio(fileBuffer, fileName);
    } catch (transcriptionError: unknown) {
      // Cleanup uploaded file
      await serviceClient.storage.from('session-audio').remove([storagePath]);

      if (transcriptionError instanceof Error) {
        console.error('Transcription error:', transcriptionError.message);
        return sendAuthError(
          res,
          'Error al transcribir el audio. Verifique el formato del archivo.',
          500,
          transcriptionError.message
        );
      }
      return sendAuthError(res, 'Error al transcribir el audio', 500);
    }

    // Build session context for AI summary
    // Supabase join returns schools and growth_communities as arrays
    const sessionData = session as {
      title: string;
      session_date: string;
      objectives: string | null;
      schools: { name: string }[] | { name: string } | null;
      growth_communities: { name: string }[] | { name: string } | null;
    };
    const schoolName = Array.isArray(sessionData.schools)
      ? sessionData.schools[0]?.name
      : sessionData.schools?.name;
    const gcName = Array.isArray(sessionData.growth_communities)
      ? sessionData.growth_communities[0]?.name
      : sessionData.growth_communities?.name;
    const sessionContext = {
      title: sessionData.title,
      date: sessionData.session_date,
      school: schoolName || 'Desconocida',
      gc: gcName || 'Desconocida',
      objectives: sessionData.objectives,
    };

    // Generate AI summary (graceful degradation built into function)
    const reportSummary = await generateReportSummary(transcript, sessionContext);

    // Format summary with key points and action items
    let formattedContent = reportSummary.summary;

    if (reportSummary.keyPoints.length > 0) {
      formattedContent += '\n\n## Puntos Clave\n\n';
      reportSummary.keyPoints.forEach((point, index) => {
        formattedContent += `${index + 1}. ${point}\n`;
      });
    }

    if (reportSummary.actionItems.length > 0) {
      formattedContent += '\n\n## Acciones a Seguir\n\n';
      reportSummary.actionItems.forEach((item, index) => {
        formattedContent += `${index + 1}. ${item}\n`;
      });
    }

    // Extract visibility from fields
    const visibilityField = Array.isArray(fields.visibility)
      ? fields.visibility[0]
      : fields.visibility;
    const finalVisibility: ReportVisibility =
      (visibilityField as ReportVisibility) || 'facilitators_only';

    if (!['facilitators_only', 'all_participants'].includes(finalVisibility)) {
      // Rollback: delete uploaded file
      await serviceClient.storage.from('session-audio').remove([storagePath]);
      return sendAuthError(res, 'Visibilidad inválida', 400);
    }

    // Store the storage path as audio_url reference (private bucket - signed URLs used for playback)
    const audioUrl = `storage://session-audio/${storagePath}`;

    // Create session_reports record
    const reportData: SessionReportInsert = {
      session_id: sessionId,
      author_id: user.id,
      content: formattedContent,
      audio_url: audioUrl,
      transcript: transcript,
      visibility: finalVisibility,
      report_type: 'session_report',
    };

    const { data: newReport, error: insertError } = await serviceClient
      .from('session_reports')
      .insert(reportData)
      .select('*')
      .single();

    if (insertError) {
      console.error('Error creating report:', insertError);
      // Rollback: delete uploaded file
      await serviceClient.storage.from('session-audio').remove([storagePath]);
      return sendAuthError(res, 'Error al crear informe', 500, insertError.message);
    }

    // Insert activity log (pattern from reports.ts)
    const activityLogEntry: SessionActivityLogInsert = {
      session_id: sessionId,
      user_id: user.id,
      action: 'report_filed',
      details: {
        report_type: 'session_report',
        source: 'audio',
        audio_file: fileName,
      },
    };

    const { error: logError } = await serviceClient
      .from('session_activity_log')
      .insert(activityLogEntry);

    if (logError) {
      console.error('Error inserting activity log:', logError);
      // Don't fail the request
    }

    // Generate signed URL for response (1-hour expiry)
    const { data: signedUrlData } = await serviceClient.storage
      .from('session-audio')
      .createSignedUrl(storagePath, 3600);

    const signedAudioUrl = signedUrlData?.signedUrl || null;

    return sendApiResponse(
      res,
      {
        report: newReport,
        transcript: transcript,
        summary: reportSummary,
        audio_url: signedAudioUrl,
      },
      201
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Audio report upload error:', error);
      return sendAuthError(res, 'Error inesperado al procesar el audio', 500, error.message);
    }
    return sendAuthError(res, 'Error inesperado al procesar el audio', 500);
  }
}
