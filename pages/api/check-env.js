// API route to check environment variables
export default function handler(req, res) {
  try {
    // Check Supabase environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const storageBucket = process.env.NEXT_PUBLIC_STORAGE_BUCKET;
    
    // Don't expose the actual keys in the response for security
    const envStatus = {
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl ? 'Set' : 'Not set',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey ? 'Set' : 'Not set',
      NEXT_PUBLIC_STORAGE_BUCKET: storageBucket || 'Not set (using fallback: resources)'
    };
    
    // Return environment status
    return res.status(200).json({
      success: true,
      environment: envStatus,
      missingVars: Object.entries(envStatus)
        .filter(([_, value]) => value === 'Not set')
        .map(([key]) => key)
    });
  } catch (error) {
    return res.status(500).json({ 
      error: 'Error checking environment variables', 
      details: error.message
    });
  }
}
