// F26b (EC-F2, EC-F3): where an Espacio Colaborativo file is, read from its
// row, for the link routes pages/api/community/post-media/[id].ts and
// pages/api/community/message-attachments/[id].ts.
//
// New rows store the object's key (post-media: <post id>/<index>.<ext>;
// message-attachments: <workspace or thread id>/<message id>/<file>). Older
// rows hold the store's full public address; the key inside it is used. The
// address is read with lib/storage/community-document-url.ts, which refuses
// other hosts, other stores and dot segments, exactly as
// lib/storage/community-document-link.ts does for documents. The callers add
// their own check that the key belongs to the row (its post or its message).

import { resolveCommunityDocumentUrl } from './community-document-url';
import { isSafeStoragePath } from './download-authorization';

export const POST_MEDIA_BUCKET = 'post-media';
export const MESSAGE_ATTACHMENTS_BUCKET = 'message-attachments';
export const FILE_LINK_SECONDS = 300;

/**
 * The object's key inside `bucket` for a stored bare key or an old full
 * address of that same store, or null for anything else.
 */
export function espacioObjectKey(
  stored: unknown,
  bucket: string,
  storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
): string | null {
  if (typeof stored !== 'string') return null;
  const resolved = resolveCommunityDocumentUrl(stored, storageOrigin, bucket);
  if (!resolved) return null;

  let key = stored;
  if (/^[a-z][a-z\d+.-]*:/i.test(stored)) {
    // /storage/v1/object/<public|sign|authenticated>/<bucket>/<key...>
    const segments = new URL(resolved).pathname.split('/').slice(6);
    try {
      key = segments.map(decodeURIComponent).join('/');
    } catch {
      return null;
    }
  }

  return isSafeStoragePath(bucket, key) ? key : null;
}
