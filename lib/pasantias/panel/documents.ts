/**
 * SERVER ONLY. Private files of the Pasantías panel.
 *
 * Bucket `pasantias-documents` is private and has no `storage.objects` policy:
 * only this service-role code reaches it, and only after the admin guard.
 *
 * - A stored object never carries a name a person chose: its path is
 *   `participants/<participant uuid>/<random uuid>.<ext>`, the extension taken
 *   from the SNIFFED type. The original file name is display metadata only.
 * - The type is decided by magic bytes (`file-type`), never by the browser's
 *   `Content-Type` or the file extension.
 * - The file is written first, then its metadata row; if the row fails the
 *   file is removed again, so no orphan object is left behind.
 * - A reader gets a 60-second signed URL, created per click.
 */
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import type { NextApiRequest } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import { fromBuffer } from 'file-type';
import { DOCUMENTS_BUCKET, recordActivity, toPanelDocument } from './server';
import {
  ALLOWED_MIME,
  LETTER_ASSET_KINDS,
  type ActivityAction,
  type DocumentKind,
  type LetterAssetKind,
  type LetterAssetsState,
  type PanelDocument,
} from './types';

type Service = SupabaseClient;

export const SIGNED_URL_SECONDS = 60;

/** The sniffed MIME type when it is one of the four allowed, else null. */
export async function sniffAllowedMime(buffer: Buffer): Promise<string | null> {
  const detected = await fromBuffer(buffer);
  return detected && ALLOWED_MIME[detected.mime] ? detected.mime : null;
}

export function documentStoragePath(participantId: string, mimeType: string): string {
  return `participants/${participantId}/${randomUUID()}.${ALLOWED_MIME[mimeType]}`;
}

export type ParsedUpload =
  | { ok: true; buffer: Buffer; originalName: string; fields: Record<string, string> }
  | { ok: false; reason: 'too_large' | 'no_file' | 'malformed' };

/**
 * Reads ONE file (field `file`) and the text fields of a multipart request.
 * The temp file formidable writes is always deleted, whatever the outcome.
 */
export async function parseSingleUpload(req: NextApiRequest, maxBytes: number): Promise<ParsedUpload> {
  const form = formidable({ maxFileSize: maxBytes, maxFiles: 1, maxFields: 6, maxFieldsSize: 4096, allowEmptyFiles: false });
  let parsed: { fields: formidable.Fields; files: formidable.Files };
  try {
    parsed = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
    });
  } catch (error) {
    const { code, httpCode } = (error ?? {}) as { code?: unknown; httpCode?: unknown };
    // formidable v2: 1009 = biggerThanMaxFileSize, 1015 = maxFilesExceeded.
    if (httpCode === 413 || code === 1009) return { ok: false, reason: 'too_large' };
    return { ok: false, reason: 'malformed' };
  }

  const entry = parsed.files.file;
  const file = Array.isArray(entry) ? entry[0] : entry;
  const paths = Object.values(parsed.files)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((f) => f?.filepath)
    .filter((p): p is string => typeof p === 'string');
  try {
    if (!file || !file.filepath || file.size <= 0) return { ok: false, reason: 'no_file' };
    if (file.size > maxBytes) return { ok: false, reason: 'too_large' };
    const buffer = await fs.readFile(file.filepath);
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.fields)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (typeof first === 'string') fields[key] = first;
    }
    return { ok: true, buffer, originalName: file.originalFilename ?? '', fields };
  } finally {
    await Promise.all(paths.map((p) => fs.unlink(p).catch(() => undefined)));
  }
}

export type StoreResult =
  | { ok: true; document: PanelDocument; activityLogged: boolean }
  | { ok: false; stage: 'upload' | 'row'; error: unknown };

/** Stores one file for a participant: object, metadata row, activity row. */
export async function storeDocument(
  supabase: Service,
  input: {
    participantId: string;
    kind: DocumentKind;
    description: string | null;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    /** null = stored by the automatic letter send. */
    actorId: string | null;
    action: Extract<ActivityAction, 'document_uploaded' | 'letter_generated'>;
  }
): Promise<StoreResult> {
  const storagePath = documentStoragePath(input.participantId, input.mimeType);
  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, input.buffer, { contentType: input.mimeType, upsert: false });
  if (uploadError) return { ok: false, stage: 'upload', error: uploadError };

  const { data, error: rowError } = await supabase
    .from('pasantias_panel_documents')
    .insert({
      participant_id: input.participantId,
      kind: input.kind,
      description: input.description,
      storage_path: storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.buffer.length,
      uploaded_by: input.actorId,
    })
    .select('id, participant_id, kind, description, file_name, mime_type, size_bytes, created_at')
    .maybeSingle();
  if (rowError || !data) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    return { ok: false, stage: 'row', error: rowError ?? { code: 'EMPTY_RESULT' } };
  }

  const logged = await recordActivity(supabase, {
    participantId: input.participantId,
    actorId: input.actorId,
    action: input.action,
    details: { kind: input.kind, file_name: input.fileName },
  });
  return { ok: true, document: toPanelDocument(data as unknown as Record<string, unknown>), activityLogged: logged.ok };
}

/* ------------------------------------------------------------- letter assets */

const LETTER_ASSET_DIR = 'letter-assets';

export function letterAssetPath(kind: LetterAssetKind): string {
  return `${LETTER_ASSET_DIR}/${kind}`;
}

/** Which of the two letter images are in the bucket. */
export async function readLetterAssetsState(
  supabase: Service
): Promise<{ ok: true; value: LetterAssetsState } | { ok: false; error: unknown }> {
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).list(LETTER_ASSET_DIR, { limit: 10 });
  if (error) return { ok: false, error };
  const names = new Set((data ?? []).map((entry) => entry.name));
  return { ok: true, value: { logo: names.has('logo'), signature: names.has('signature') } };
}

export interface LetterImage {
  data: Buffer;
  format: 'png' | 'jpg';
}

/** One stored letter image, or null when it has not been uploaded (or is not PNG/JPEG). */
export async function readLetterAsset(supabase: Service, kind: LetterAssetKind): Promise<LetterImage | null> {
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(letterAssetPath(kind));
  if (error || !data) return null;
  const buffer = Buffer.from(await data.arrayBuffer());
  const mime = await sniffAllowedMime(buffer);
  if (mime === 'image/png') return { data: buffer, format: 'png' };
  if (mime === 'image/jpeg') return { data: buffer, format: 'jpg' };
  return null;
}

export function isLetterAssetKind(value: unknown): value is LetterAssetKind {
  return typeof value === 'string' && (LETTER_ASSET_KINDS as readonly string[]).includes(value);
}
