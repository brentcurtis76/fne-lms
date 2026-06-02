import path from 'node:path';
import { NextApiRequest, NextApiResponse } from 'next';
import JSZip from 'jszip';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/api-auth';
import { authorizeProposalDownload } from '@/lib/propuestas-web/download-access';

/**
 * ZIP download API for propuesta web view.
 * POST /api/propuestas/web/[slug]/download-zip
 * Includes the generated proposal PDF plus all supporting documents captured
 * in the proposal snapshot. Requires the plain access code for validation.
 */

export const config = {
  api: {
    responseLimit: false,
  },
};

const MAX_TOTAL_SIZE_BYTES = 100 * 1024 * 1024;

const DownloadZipSchema = z.object({
  sessionCode: z.string().max(10).optional().default(''),
});

type SnapshotDocumentForZip = {
  id?: string;
  nombre?: string;
  tipo?: string;
  archivoPath?: string;
};

type ProposalSnapshotForZip = {
  serviceName?: string;
  licitacion?: {
    numero?: string;
  } | null;
  documents?: SnapshotDocumentForZip[];
};

const DOCUMENT_TYPE_FOLDER: Record<string, string> = {
  certificado_pertenencia: '01-certificados',
  carta_recomendacion: '02-cartas-recomendacion',
  evaluaciones_clientes: '04-evaluaciones',
  ficha_servicio: '05-fichas-servicio',
  otro: '99-otros',
};

function isSafeStoragePath(storagePath: unknown): storagePath is string {
  return (
    typeof storagePath === 'string' &&
    storagePath.length > 0 &&
    !storagePath.includes('\0') &&
    !storagePath.includes('..') &&
    !storagePath.startsWith('/') &&
    !storagePath.startsWith('\\')
  );
}

function sanitizeName(input: string | null | undefined, fallback: string, maxLength = 120): string {
  const sanitized = (input || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^\.+|\.+$/g, '')
    .substring(0, maxLength);

  return sanitized || fallback;
}

function fileNameFromDocument(doc: SnapshotDocumentForZip, fallback: string): string {
  const storagePath = doc.archivoPath || '';
  const storageBaseName = path.posix.basename(storagePath);
  const storageExtension = path.posix.extname(storageBaseName);
  const baseName = sanitizeName(doc.nombre || storageBaseName, fallback, 180);

  if (storageExtension && !path.posix.extname(baseName)) {
    return `${baseName}${storageExtension}`;
  }

  return baseName;
}

function uniquifyZipPath(zipPath: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(zipPath)) {
    usedPaths.add(zipPath);
    return zipPath;
  }

  const directory = path.posix.dirname(zipPath);
  const parsed = path.posix.parse(path.posix.basename(zipPath));
  let counter = 2;
  let candidate = '';

  do {
    candidate = path.posix.join(directory, `${parsed.name}-${counter}${parsed.ext}`);
    counter += 1;
  } while (usedPaths.has(candidate));

  usedPaths.add(candidate);
  return candidate;
}

async function downloadFromPropuestasBucket(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  storagePath: string
): Promise<Buffer | null> {
  const { data, error } = await serviceClient.storage
    .from('propuestas')
    .download(storagePath);

  if (error || !data) {
    return null;
  }

  return Buffer.from(await data.arrayBuffer());
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const { slug } = req.query;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Slug invalido' });
  }

  const bodyParse = DownloadZipSchema.safeParse(req.body);
  if (!bodyParse.success) {
    const errors = bodyParse.error.errors.map((e) => e.message).join('; ');
    return res.status(400).json({ error: `Datos invalidos: ${errors}` });
  }

  const { sessionCode } = bodyParse.data;

  try {
    const serviceClient = createServiceRoleClient();

    const { data: propuesta, error } = await serviceClient
      .from('propuesta_generadas')
      .select('id, access_code, web_status, snapshot_json, archivo_path, version')
      .eq('web_slug', slug)
      .eq('estado', 'completada')
      .single();

    if (error || !propuesta) {
      return res.status(404).json({ error: 'Propuesta no encontrada' });
    }

    if (propuesta.web_status === 'expired') {
      return res.status(410).json({ error: 'Esta propuesta ha expirado' });
    }

    const access = await authorizeProposalDownload(
      req,
      res,
      serviceClient,
      slug,
      propuesta.access_code,
      sessionCode
    );
    if (access.ok === false) {
      return res.status(access.status).json({
        error: access.error,
        ...(access.remaining != null ? { remaining: access.remaining } : {}),
      });
    }

    if (!isSafeStoragePath(propuesta.archivo_path)) {
      return res.status(422).json({ error: 'La propuesta PDF no esta disponible' });
    }

    const snapshot = propuesta.snapshot_json as ProposalSnapshotForZip | null;
    const supportingDocuments = Array.isArray(snapshot?.documents)
      ? snapshot.documents
      : [];

    const rootFolder = sanitizeName(
      snapshot?.licitacion?.numero || slug,
      'propuesta',
      100
    );

    const zip = new JSZip();
    const usedPaths = new Set<string>();
    const skippedFiles: string[] = [];
    let totalBytesProcessed = 0;

    const proposalPdf = await downloadFromPropuestasBucket(serviceClient, propuesta.archivo_path);
    if (!proposalPdf) {
      return res.status(422).json({ error: 'No se pudo descargar el PDF de la propuesta' });
    }

    totalBytesProcessed += proposalPdf.byteLength;
    if (totalBytesProcessed > MAX_TOTAL_SIZE_BYTES) {
      return res.status(413).json({
        error: `Los archivos superan el limite de descarga (${Math.round(MAX_TOTAL_SIZE_BYTES / 1024 / 1024)} MB). Descargue los archivos individualmente.`,
      });
    }

    const proposalFileName = sanitizeName(
      `propuesta-v${propuesta.version || 1}.pdf`,
      'propuesta.pdf',
      180
    );
    const proposalZipPath = uniquifyZipPath(
      `${rootFolder}/00-propuesta/${proposalFileName}`,
      usedPaths
    );
    zip.file(proposalZipPath, proposalPdf);

    for (const doc of supportingDocuments) {
      if (!isSafeStoragePath(doc.archivoPath)) {
        skippedFiles.push(doc.nombre || doc.id || 'documento-sin-ruta');
        continue;
      }

      const fileBuffer = await downloadFromPropuestasBucket(serviceClient, doc.archivoPath);
      if (!fileBuffer) {
        skippedFiles.push(doc.nombre || doc.id || path.posix.basename(doc.archivoPath));
        continue;
      }

      totalBytesProcessed += fileBuffer.byteLength;
      if (totalBytesProcessed > MAX_TOTAL_SIZE_BYTES) {
        return res.status(413).json({
          error: 'Los archivos superan el limite de descarga durante la generacion. Descargue los archivos individualmente.',
        });
      }

      const folder = DOCUMENT_TYPE_FOLDER[doc.tipo || ''] || '99-otros';
      const fileName = fileNameFromDocument(doc, doc.id ? `documento-${doc.id}` : 'documento');
      const documentZipPath = uniquifyZipPath(
        `${rootFolder}/01-documentos-respaldo/${folder}/${fileName}`,
        usedPaths
      );

      zip.file(documentZipPath, fileBuffer);
    }

    if (skippedFiles.length > 0) {
      const manifestPath = uniquifyZipPath(`${rootFolder}/_archivos_faltantes.txt`, usedPaths);
      zip.file(
        manifestPath,
        `Los siguientes archivos no pudieron ser incluidos en el ZIP:\n${skippedFiles.join('\n')}`
      );
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const safeZipName = `${rootFolder}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeZipName}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    return res.status(200).end(zipBuffer);
  } catch (err) {
    console.error('[propuesta-web/download-zip]', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
