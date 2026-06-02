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

export async function uploadFile(path: string, file: Buffer, contentType: string): Promise<string> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, file, { contentType, upsert: true });
    if (!error) return path;
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
