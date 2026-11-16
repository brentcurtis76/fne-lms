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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication (also holds a caller who must change their password)
    const caller = await requireVerifiedCaller(req, res);
    if (!caller.user) {
      return res.status(caller.status).json(caller.body);
    }
    const user = caller.user;

    const { fileUrl, bucket = 'resources' } = req.body;

    if (!fileUrl) {
      return res.status(400).json({ error: 'File URL is required' });
    }

    // Only a non-empty string address and a string store name are used (EC-S1d)
    if (typeof fileUrl !== 'string' || typeof bucket !== 'string') {
      return res.status(400).json({ error: 'Ruta de archivo no válida' });
    }

    // Extract the bucket and file path; every branch only sets them, and the
    // single decision below is taken before anything is signed (EC-S1).
    // Public URLs have format: https://xxx.supabase.co/storage/v1/object/public/bucket/path
    let targetBucket = bucket;
    let filePath = '';

    try {
      const url = new URL(fileUrl);
      const pathParts = url.pathname.split('/');

      // Find the bucket name in the path and get everything after it
      const publicIndex = pathParts.indexOf('public');
      if (publicIndex !== -1 && publicIndex + 2 < pathParts.length) {
        // Path format: /storage/v1/object/public/bucket/...path
        const bucketFromUrl = pathParts[publicIndex + 1];
        filePath = pathParts.slice(publicIndex + 2).join('/');

        // Use the bucket from URL if it differs
        if (bucketFromUrl && bucketFromUrl !== bucket) {
          targetBucket = bucketFromUrl;
        }
      }

      // Fallback: try to extract path assuming standard format
      if (!filePath) {
        const match = fileUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
        if (match) {
          targetBucket = match[1];
          filePath = match[2];
        }
      }
    } catch (parseError) {
      console.error('Error parsing file URL:', parseError);
    }

    // If we couldn't parse the URL, try using it directly with the provided bucket
    if (!filePath) {
      // Maybe it's just a path, not a full URL
      filePath = fileUrl;
    }

    // Decode once; the decoded path is both what is checked and what is signed
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(String(filePath));
    } catch {
      return res.status(400).json({ error: 'Ruta de archivo no válida' });
    }

    const userClient = await createApiSupabaseClient(req, res);
    const decision = await authorizeStorageDownload(
      userClient,
      user.id,
      typeof targetBucket === 'string' ? targetBucket : '',
      decodedPath,
      typeof fileUrl === 'string' ? fileUrl : undefined
    );
    if (decision.allowed === false) {
      return res.status(decision.status).json({ error: decision.error });
    }

    const { data, error } = await supabaseService.storage
      .from(targetBucket)
      .createSignedUrl(decodedPath, 3600); // 1 hour expiry

    if (error) {
      console.error('Error creating signed URL:', error);
      return res.status(500).json({ error: 'Failed to generate download URL', details: error.message });
    }

    return res.status(200).json({ signedUrl: data.signedUrl });

  } catch (error) {
    console.error('Download URL API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
