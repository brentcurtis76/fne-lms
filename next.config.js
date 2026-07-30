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
      // Permissions-Policy override for the meeting surface.
      //
      // The global rule above denies camera and microphone on every route.
      // That is right for the rest of the LMS and fatal for a Zoom embed: the
      // SDK calls getUserMedia from the page, and a denying Permissions-Policy
      // blocks it before the browser ever prompts the user.
      //
      // This entry is declared AFTER the global one on purpose. Both match a
      // /meet path; Next.js applies every matching header group in order, so
      // for a repeated key the later value is the one that survives. Verified
      // with `curl -I` against a dev server (evidence in
      // docs/planning/zoom-spike-results.md §1): /meet/* gets the permissive
      // policy and every other route keeps the restrictive one.
      //
      // `display-capture` is included for screen sharing. `geolocation` stays
      // denied — no meeting surface has any use for it.
      {
        source: '/meet/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=()',
          },
        ],
      },
    ];
  },

  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },

  webpack: (config, { dev, isServer }) => {
    // Client bundle: stub out Node.js-only modules referenced by transitive deps.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
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