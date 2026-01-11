import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

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
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: { user }, error: authError } = await supabaseService.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }

    const { fileUrl, bucket = 'resources' } = req.body;

    if (!fileUrl) {
      return res.status(400).json({ error: 'File URL is required' });
    }

    // Extract the file path from the public URL
    // Public URLs have format: https://xxx.supabase.co/storage/v1/object/public/bucket/path
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
          // Generate signed URL with the correct bucket
          const { data, error } = await supabaseService.storage
            .from(bucketFromUrl)
            .createSignedUrl(filePath, 3600); // 1 hour expiry

          if (error) {
            console.error('Error creating signed URL:', error);
            return res.status(500).json({ error: 'Failed to generate download URL', details: error.message });
          }

          return res.status(200).json({ signedUrl: data.signedUrl });
        }
      }

      // Fallback: try to extract path assuming standard format
      if (!filePath) {
        const match = fileUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
        if (match) {
          const bucketFromUrl = match[1];
          filePath = match[2];

          const { data, error } = await supabaseService.storage
            .from(bucketFromUrl)
            .createSignedUrl(filePath, 3600);

          if (error) {
            console.error('Error creating signed URL:', error);
            return res.status(500).json({ error: 'Failed to generate download URL', details: error.message });
          }

          return res.status(200).json({ signedUrl: data.signedUrl });
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

    const { data, error } = await supabaseService.storage
      .from(bucket)
      .createSignedUrl(filePath, 3600); // 1 hour expiry

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
