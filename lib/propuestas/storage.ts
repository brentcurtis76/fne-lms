import { supabaseAdmin } from '@/lib/supabaseAdmin';

const BUCKET = 'propuestas';
const DEFAULT_EXPIRY = 3600; // 1 hour

/**
 * Resolve a storage path to a signed URL for browser display.
 * Returns null if path is falsy. Uses 1-hour expiry (resolved per-request).
 */
export async function resolveDisplayUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    return await getSignedUrl(path);
  } catch (err) {
    console.warn(`[resolveDisplayUrl] Could not resolve ${path}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getSignedUrl(path: string, expiresIn = DEFAULT_EXPIRY): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw new Error(`Failed to create signed URL for ${path}: ${error.message}`);
  return data.signedUrl;
}

/**
 * Thrown by a create-only `uploadFile` when an object is already at the path.
 *
 * It is its own type rather than a message a caller has to match on, because
 * the two failures mean opposite things: this one says someone else's object is
 * there and was left alone (usually fine, sometimes the whole point), while a
 * plain upload error says the bucket did not accept the write.
 */
export class StorageObjectExistsError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Object already exists at ${path}`);
    this.name = 'StorageObjectExistsError';
    this.path = path;
  }
}

/**
 * Whether a storage error is the already-exists conflict a create-only upload
 * produces. Matched on the SDK's error shape — `StorageApiError` carries both
 * the service code and the HTTP status — never on the message text, which is
 * not part of any contract.
 */
function isAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, status, statusCode } = error as {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  return code === 'ResourceAlreadyExists' || status === 409 || statusCode === '409';
}

export interface UploadFileOptions {
  /**
   * Replace an object already at `path`. Defaults to `true` — what the
   * propuestas generators want, since they own every path they write.
   *
   * Pass `false` where something else may legitimately own the object at that
   * path (see D-05's manual-override cache path in `lib/pasantias/pdf/serve.ts`)
   * and handle `StorageObjectExistsError`: with create-only, the bucket decides
   * who wins the race and this call never destroys the other writer's file.
   */
  upsert?: boolean;
}

export async function uploadFile(
  path: string,
  file: Buffer,
  contentType: string,
  options: UploadFileOptions = {}
): Promise<string> {
  const upsert = options.upsert ?? true;
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, file, { contentType, upsert });
    if (!error) return path;
    // A create-only conflict is terminal — the object exists, and a retry only
    // asks the same question again. It is also unreachable when upserting.
    if (!upsert && isAlreadyExistsError(error)) throw new StorageObjectExistsError(path);
    lastError = new Error(`Failed to upload ${path}: ${error.message}`);
  }
  throw lastError!;
}

export async function downloadFile(path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(path);
  if (error) throw new Error(`Failed to download ${path}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Check whether an object actually exists in the bucket at `path`.
 * Uses a metadata-only `list()` on the parent prefix (does NOT download the
 * file). Returns false for falsy paths or on any list error.
 *
 * Note: `createSignedUrl` is NOT a valid existence check — it returns a URL
 * for non-existent objects and only 404s when fetched. This is the correct
 * way to confirm a file is present before freezing its path into a snapshot.
 */
export async function fileExists(path: string | null | undefined): Promise<boolean> {
  if (!path) return false;
  const slashIndex = path.lastIndexOf('/');
  const dir = slashIndex >= 0 ? path.slice(0, slashIndex) : '';
  const name = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
  if (!name) return false;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(dir, { search: name, limit: 100 });
  if (error || !data) return false;
  return data.some((obj) => obj.name === name);
}
