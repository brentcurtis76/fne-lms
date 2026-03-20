import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/api-auth';
import { verifyAccessCode } from '@/lib/propuestas-web/access-code';
import { getSignedUrl } from '@/lib/propuestas/storage';

/**
 * Document download API for propuesta web view.
 * POST /api/propuestas/web/[slug]/download-doc
 * Generates a signed URL for a document referenced in the snapshot.
 * Requires the plain access code for session validation.
 */

const DownloadSchema = z.object({
  documentId: z.string().min(1, 'ID de documento requerido'),
  sessionCode: z.string().min(1, 'Código de sesión requerido').max(10),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { slug } = req.query;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Slug inválido' });
  }

  const bodyParse = DownloadSchema.safeParse(req.body);
  if (!bodyParse.success) {
    const errors = bodyParse.error.errors.map((e) => e.message).join('; ');
    return res.status(400).json({ error: `Datos inválidos: ${errors}` });
  }

  const { documentId, sessionCode } = bodyParse.data;

  try {
    const serviceClient = createServiceRoleClient();

    const { data: propuesta, error } = await serviceClient
      .from('propuesta_generadas')
      .select('id, access_code, web_status, snapshot_json')
      .eq('web_slug', slug)
      .eq('estado', 'completada')
      .single();

    if (error || !propuesta) {
      return res.status(404).json({ error: 'Propuesta no encontrada' });
    }

    if (propuesta.web_status === 'expired') {
      return res.status(410).json({ error: 'Esta propuesta ha expirado' });
    }

    if (!propuesta.access_code) {
      return res.status(500).json({ error: 'Propuesta sin código de acceso configurado' });
    }

    // Validate session by re-verifying the access code
    const valid = await verifyAccessCode(sessionCode.toUpperCase(), propuesta.access_code);
    if (!valid) {
      return res.status(401).json({ error: 'Código de sesión inválido' });
    }

    // Look up the document in the snapshot
    const snapshot = propuesta.snapshot_json as Record<string, unknown> | null;
    if (!snapshot) {
      return res.status(500).json({ error: 'Snapshot no disponible' });
    }

    const documents = snapshot.documents as Array<{
      id: string;
      nombre: string;
      archivoPath: string;
    }> | undefined;

    const doc = documents?.find((d) => d.id === documentId);
    if (!doc) {
      return res.status(404).json({ error: 'Documento no encontrado en esta propuesta' });
    }

    // Generate signed URL (1 hour expiry)
    const url = await getSignedUrl(doc.archivoPath);

    return res.status(200).json({
      data: {
        url,
        filename: doc.nombre,
      },
    });
  } catch (err) {
    console.error('[propuesta-web/download-doc]', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
