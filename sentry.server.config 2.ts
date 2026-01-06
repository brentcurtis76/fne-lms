/**
 * Sentry Server Configuration
 *
 * Configures error tracking and performance monitoring for the Node.js server side
 * of the Genera application, including API routes and SSR.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENVIRONMENT = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = ENVIRONMENT === 'production';

// Only initialize Sentry if DSN is provided
if (SENTRY_DSN) {
  Sentry.init({
    // Data Source Name - connects to your Sentry project
    dsn: SENTRY_DSN,

    // Environment tracking
    environment: ENVIRONMENT,

    // Performance Monitoring - sample rate based on environment
    // Production: 10% of transactions, Development: 100% of transactions
    tracesSampleRate: IS_PRODUCTION ? 0.1 : 1.0,

    // Integrations
    integrations: [
      // HTTP integration for tracking outbound requests
      Sentry.httpIntegration({
        // @ts-ignore - tracePropagationTargets is valid but not in all type versions
        tracePropagationTargets: [
          'localhost',
          /^https:\/\/.*\.supabase\.co/
        ]
      } as any)
    ],

    // Filter and enhance events before sending to Sentry
    beforeSend(event, hint) {
      // Remove sensitive headers
      if (event.request?.headers) {
        // Authorization headers
        delete event.request.headers['authorization'];
        delete event.request.headers['Authorization'];

        // Cookie data
        delete event.request.headers['cookie'];
        delete event.request.headers['Cookie'];

        // API keys
        delete event.request.headers['x-api-key'];
        delete event.request.headers['X-API-Key'];
      }

      // Remove sensitive cookies
      if (event.request?.cookies) {
        delete event.request.cookies;
      }

      // Scrub sensitive data from context and extra
      if (event.contexts) {
        // Remove any Supabase service role keys
        Object.keys(event.contexts).forEach(key => {
          const context = event.contexts?.[key];
          if (context && typeof context === 'object') {
            delete (context as any).SUPABASE_SERVICE_ROLE_KEY;
            delete (context as any).supabaseServiceKey;
            delete (context as any).serviceRoleKey;
          }
        });
      }

      if (event.extra) {
        delete (event.extra as any).SUPABASE_SERVICE_ROLE_KEY;
        delete (event.extra as any).supabaseServiceKey;
        delete (event.extra as any).serviceRoleKey;
        delete (event.extra as any).password;
        delete (event.extra as any).token;
        delete (event.extra as any).apiKey;
      }

      // Add custom tags for better organization
      event.tags = {
        ...event.tags,
        platform: 'fne-lms',
        region: 'chile',
        runtime: 'server'
      };

      // Add server context
      event.contexts = {
        ...event.contexts,
        app: {
          app_name: 'Genera',
          app_version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'
        },
        runtime: {
          name: 'node',
          version: process.version
        }
      };

      // Add deployment info if available (Vercel)
      if (process.env.VERCEL) {
        event.contexts.deployment = {
          provider: 'vercel',
          region: process.env.VERCEL_REGION,
          git_commit: process.env.VERCEL_GIT_COMMIT_SHA
        };
      }

      return event;
    },

    // Ignore common non-critical errors
    ignoreErrors: [
      // Supabase session refresh (handled gracefully)
      'Auth session missing',
      'refresh_token_not_found',
      'Invalid Refresh Token',

      // Network timeouts (expected occasionally)
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',

      // Client disconnections (normal)
      'Client has already been connected',
      'Connection terminated unexpectedly',

      // Expected API errors
      'No autorizado',
      'Unauthorized',
      '401',
      '403',

      // Non-Error promise rejections
      'Non-Error promise rejection captured',

      // Rate limiting (expected)
      'Too many requests',
      '429'
    ],

    // Enable debug mode in development
    debug: !IS_PRODUCTION,

    // Release tracking
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,

    // Server-specific options
    serverName: process.env.VERCEL_REGION || 'local',

    // Maximum breadcrumbs to keep
    maxBreadcrumbs: 50,

    // Attach stack traces to messages
    attachStacktrace: true
  });

  // Log initialization in development
  if (!IS_PRODUCTION) {
    console.log('[Sentry Server] Initialized for environment:', ENVIRONMENT);
  }
} else {
  console.warn('[Sentry Server] DSN not configured. Error tracking is disabled.');
}
