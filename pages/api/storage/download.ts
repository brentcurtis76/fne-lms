import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { requireVerifiedCaller, createApiSupabaseClient } from '../../../lib/api-auth';
import { authorizeStorageDownload } from '../../../lib/storage/download-authorization';

// Use service role to bypass RLS for storage operations
const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication (also holds a caller who must change their password)
    const caller = await requireVerifiedCaller(req, res);
    if (!caller.user) {
      return res.status(caller.status).json(caller.body);
    }
    const user = caller.user;

    const { url, filename } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'File URL is required' });
    }

    // Decode the URL (a value that does not decode is refused, EC-S1d)
    let fileUrl: string;
    let originalFilename: string;
    try {
      fileUrl = decodeURIComponent(url);
      originalFilename = filename ? decodeURIComponent(filename as string) : 'archivo';
    } catch {
      return res.status(400).json({ error: 'Ruta de archivo no válida' });
    }

    console.log('[Download API] Attempting to download:', fileUrl);

    // Extract bucket and path from the URL
    // Format: https://xxx.supabase.co/storage/v1/object/public/bucket/path
    let bucketName = '';
    let filePath = '';

    try {
      const parsedUrl = new URL(fileUrl);
      const pathParts = parsedUrl.pathname.split('/');

      // Find 'public' or 'sign' in path to determine bucket location
      const publicIndex = pathParts.indexOf('public');
      const signIndex = pathParts.indexOf('sign');
      const objectIndex = Math.max(publicIndex, signIndex);

      if (objectIndex !== -1 && objectIndex + 2 < pathParts.length) {
        bucketName = pathParts[objectIndex + 1];
        filePath = decodeURIComponent(pathParts.slice(objectIndex + 2).join('/'));
      }
    } catch (parseError) {
      console.error('[Download API] Error parsing URL:', parseError);
      return res.status(400).json({ error: 'Invalid file URL format' });
    }

    if (!bucketName || !filePath) {
      console.error('[Download API] Could not extract bucket/path from:', fileUrl);
      return res.status(400).json({ error: 'Could not parse storage path from URL' });
    }

    console.log('[Download API] Bucket:', bucketName, 'Path:', filePath);

    // Only a file the caller may see is read with the service key (EC-S1)
    const userClient = await createApiSupabaseClient(req, res);
    const decision = await authorizeStorageDownload(userClient, user.id, bucketName, filePath, fileUrl);
    if (decision.allowed === false) {
      return res.status(decision.status).json({ error: decision.error });
    }

    // Download the file from Supabase Storage
    const { data, error } = await supabaseService.storage
      .from(bucketName)
      .download(filePath);

    if (error) {
      console.error('[Download API] Supabase download error:', error);
      return res.status(500).json({ error: 'Failed to download file', details: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get the file as an ArrayBuffer
    const buffer = await data.arrayBuffer();

    // Determine content type from the file or use a default
    const contentType = data.type || 'application/octet-stream';

    // Set headers for file download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalFilename)}"`);
    res.setHeader('Content-Length', buffer.byteLength);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    // Send the file
    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('[Download API] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Increase the body size limit for file downloads
export const config = {
  api: {
    responseLimit: false,
  },
};
