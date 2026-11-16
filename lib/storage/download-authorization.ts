import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Who may fetch which stored file through /api/storage/download and
 * /api/storage/download-url (EC-S1). Both routes read storage with the
 * service key, so this check is the only thing tying a file to the caller.
 */

export type DownloadDecision = { allowed: true } | { allowed: false; status: 400 | 403; error: string };

const INVALID_PATH: DownloadDecision = { allowed: false, status: 400, error: 'Ruta de archivo no válida' };
const FORBIDDEN: DownloadDecision = { allowed: false, status: 403, error: 'No tienes acceso a este archivo' };

const BUCKET_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const COMMUNITY_DOCUMENT_PATTERN =
  /^documents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//;
const MESSAGE_ATTACHMENTS_BUCKET = 'message-attachments';

/**
 * True only for a path the storage service cannot read differently than this
 * check does. storage-js puts the path into the request address unencoded and
 * the address is then normalised (encoded dots resolved), so a percent sign,
 * a dot segment, or anything the URL parser rewrites is refused.
 */
export function isSafeStoragePath(bucket: string, path: string): boolean {
  if (!BUCKET_PATTERN.test(bucket)) return false;
  if (!path || path.length > 1024) return false;
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    const code = path.charCodeAt(i);
    if (ch === '%' || ch === '\\' || ch === '?' || ch === '#' || code < 0x20 || code === 0x7f) return false;
  }
  if (path.startsWith('/') || path.endsWith('/') || path.includes('//')) return false;
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) return false;
  try {
    const normalised = decodeURIComponent(new URL('http://storage.invalid/' + bucket + '/' + path).pathname);
    return normalised === '/' + bucket + '/' + path;
  } catch {
    return false;
  }
}

export async function authorizeStorageDownload(
  userClient: SupabaseClient,
  userId: string,
  bucket: string,
  path: string,
  originalUrl?: string
): Promise<DownloadDecision> {
  if (!isSafeStoragePath(bucket, path)) return INVALID_PATH;

  if (bucket === (process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'resources')) {
    const match = COMMUNITY_DOCUMENT_PATTERN.exec(path);
    if (match) {
      const { data, error } = await userClient.rpc('can_access_workspace', {
        p_user_id: userId,
        p_workspace_id: match[1],
      });
      return data === true && !error ? { allowed: true } : FORBIDDEN;
    }
    if (path.toLowerCase().startsWith('documents/')) return FORBIDDEN;
    return { allowed: true };
  }

  if (bucket === MESSAGE_ATTACHMENTS_BUCKET) {
    const base =
      (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '') +
      '/storage/v1/object/public/message-attachments/';
    const candidates = Array.from(
      new Set([base + path, base + encodeURI(path), ...(originalUrl !== undefined ? [originalUrl] : [])])
    );
    // Exact values only; the table's own row rules decide whether the caller may read it.
    const { data, error } = await userClient
      .from('message_attachments')
      .select('id')
      .in('storage_path', candidates)
      .limit(1);
    return !error && Array.isArray(data) && data.length > 0 ? { allowed: true } : FORBIDDEN;
  }

  return FORBIDDEN;
}
