/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Image optimization configuration
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'sxlogxqzmarhqsblmtj.supabase.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  
  // Optimize for development stability
  experimental: {
    // Reduce memory usage
    workerThreads: false,
    esmExternals: true,
    // Improve hot reload stability
    optimizePackageImports: ['@heroicons/react', 'lucide-react'],
  },
  
  // Better error handling
  onDemandEntries: {
    // Period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 60 * 1000,
    // Number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 5,
  },
  
  // Webpack optimizations for stability
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // Reduce memory usage in development
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ['**/node_modules/**', '**/.git/**', '**/.next/**'],
      }
      
      // Prevent memory leaks
      config.optimization.removeAvailableModules = false
      config.optimization.removeEmptyChunks = false
      config.optimization.splitChunks = false
    }
    
    return config
  },
  
  // Environment variables
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
}

module.exports = nextConfig