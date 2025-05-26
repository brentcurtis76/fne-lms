// API route to test Supabase bucket access
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default async function handler(req, res) {
  try {
    // Create Supabase client
    const supabase = createClientComponentClient()
    
    // List all buckets (if possible with the client)
    let bucketsInfo = { error: 'Cannot list buckets with client component' }
    
    // Try to access different potential buckets
    const potentialBuckets = ['resources', 'thumbnails', 'public', 'files', 'assets']
    const bucketResults = {}
    
    for (const bucket of potentialBuckets) {
      try {
        const { data: files, error } = await supabase.storage.from(bucket).list()
        bucketResults[bucket] = {
          accessible: !error,
          error: error ? error.message : null,
          files: files ? files.length : 0
        }
      } catch (e) {
        bucketResults[bucket] = {
          accessible: false,
          error: e.message,
          exception: true
        }
      }
    }
    
    // Get environment variables (without exposing sensitive data)
    const envInfo = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Not set',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set (hidden)' : 'Not set',
      NEXT_PUBLIC_STORAGE_BUCKET: process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'Not set (using fallback)'
    }
    
    return res.status(200).json({
      success: true,
      environment: envInfo,
      buckets: bucketResults
    })
  } catch (error) {
    return res.status(500).json({ 
      error: 'Unexpected error', 
      details: error.message,
      stack: error.stack
    })
  }
}
