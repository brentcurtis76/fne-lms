/** @type {import('next').NextConfig} */
const crypto = require('crypto');

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  generateBuildId: async () => {
    return `build-${Date.now()}`
  },

  eslint: {
    ignoreDuringBuilds: false,
    dirs: ['pages', 'components', 'lib', 'utils'],
  },
  typescript: {
    ignoreBuildErrors: false,
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'sxlogxqzmarhqsblxmtj.supabase.co',
        port: '',
        pathname: '/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },

  experimental: {
    esmExternals: true,
    optimizePackageImports: ['@heroicons/react', 'lucide-react'],
  },

  compress: true,
  poweredByHeader: false,
  generateEtags: true,
  optimizeFonts: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },

  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.optimization.removeAvailableModules = false
      config.optimization.removeEmptyChunks = false
      config.optimization.splitChunks = false
    }
    return config
  },

  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
}

module.exports = nextConfig;