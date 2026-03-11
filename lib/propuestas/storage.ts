import { supabaseAdmin } from '@/lib/supabaseAdmin';

const BUCKET = 'propuestas';
const DEFAULT_EXPIRY = 3600; // 1 hour

export async function getSignedUrl(path: string, expiresIn = DEFAULT_EXPIRY): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw new Error(`Failed to create signed URL for ${path}: ${error.message}`);
  return data.signedUrl;
}

export async function uploadFile(path: string, file: Buffer, contentType: string): Promise<string> {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: true });
  if (error) throw new Error(`Failed to upload ${path}: ${error.message}`);
  return path;
}

export async function downloadFile(path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(path);
  if (error) throw new Error(`Failed to download ${path}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}
