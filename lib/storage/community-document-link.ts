// F12d (EC-S3): where a community document's file is, read from its record,
// for the link route pages/api/community/documents/[id]/link.ts.
//
// A record says its store in storage_bucket: 'community-documents' (every
// upload since F12d) or empty / 'resources' (the old public store). Its
// storage_path is the object's key (documents/<workspace>/<folder>/<file>) or,
// in older rows, a full address of the store; the address is read with
// lib/storage/community-document-url.ts, which refuses other hosts, other
// stores and dot segments. Whatever the stored value, the object must lie
// inside documents/<the document's own workspace id>/; anything else is
// refused (null), so a record can never be used to sign someone else's file.

import { resolveCommunityDocumentUrl } from './community-document-url';
import { isSafeStoragePath } from './download-authorization';

export const COMMUNITY_DOCUMENTS_BUCKET = 'community-documents';
export const LEGACY_DOCUMENTS_BUCKET = 'resources';
export const DOCUMENT_LINK_SECONDS = 300;

/** The store a record names; null for a value that is not a documents store. */
export function documentStore(storedBucket: unknown): string | null {
  if (storedBucket === null || storedBucket === undefined || storedBucket === '') return LEGACY_DOCUMENTS_BUCKET;
  if (storedBucket === LEGACY_DOCUMENTS_BUCKET || storedBucket === COMMUNITY_DOCUMENTS_BUCKET) return storedBucket;
  return null;
}

/**
 * The object's name inside `bucket` for a stored key or old full address, or
 * null when it is not a file inside documents/<workspaceId>/.
 */
export function documentObjectName(
  storagePath: unknown,
  bucket: string,
  workspaceId: unknown,
  storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
): string | null {
  if (typeof storagePath !== 'string' || typeof workspaceId !== 'string' || !workspaceId) return null;
  const resolved = resolveCommunityDocumentUrl(storagePath, storageOrigin, bucket);
  if (!resolved) return null;

  let name = storagePath;
  if (/^[a-z][a-z\d+.-]*:/i.test(storagePath)) {
    // /storage/v1/object/<public|sign|authenticated>/<bucket>/<key...>
    const segments = new URL(resolved).pathname.split('/').slice(6);
    try {
      name = segments.map(decodeURIComponent).join('/');
    } catch {
      return null;
    }
  }

  const prefix = `documents/${workspaceId}/`;
  if (!name.startsWith(prefix) || name.length === prefix.length) return null;
  return isSafeStoragePath(bucket, name) ? name : null;
}
