// F26 (N146): a contract's stored document value (contratos.contrato_url) comes
// in two shapes — an old full address of the contracts store (written by
// «Subir Contrato Firmado» and the PDF importer until F26) or the bare object
// name (written since F26). This turns either into the object's name inside
// CONTRACTS_BUCKET, or refuses (null) anything that points elsewhere or that the
// storage service could read differently. Old addresses are read through
// resolveCommunityDocumentUrl (same origin as NEXT_PUBLIC_SUPABASE_URL, this
// store only, no dot segments), as lib/storage/community-document-link.ts does;
// a one-folder key (`<folder>/<file>`) is accepted.
import { resolveCommunityDocumentUrl } from '../storage/community-document-url';
import { isSafeStoragePath } from '../storage/download-authorization';

export const CONTRACTS_BUCKET = 'contracts';

export function contractObjectName(stored: string | null): string | null {
  if (typeof stored !== 'string' || stored === '') return null;
  const resolved = resolveCommunityDocumentUrl(stored, process.env.NEXT_PUBLIC_SUPABASE_URL || '', CONTRACTS_BUCKET);
  if (!resolved) return null;

  let key = stored;
  if (/^[a-z][a-z\d+.-]*:/i.test(stored)) {
    // /storage/v1/object/<public|sign|authenticated>/contracts/<key...>
    const segments = new URL(resolved).pathname.split('/').slice(6);
    try {
      key = segments.map(decodeURIComponent).join('/');
    } catch {
      return null;
    }
  }

  return isSafeStoragePath(CONTRACTS_BUCKET, key) ? key : null;
}
