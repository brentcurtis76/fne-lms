/**
 * Client-Side Instrumentation
 *
 * This file is imported by Next.js to initialize client-side Sentry.
 * It runs in the browser and handles error tracking and performance monitoring
 * for the client side of the FNE LMS application.
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

    // Session Replay - capture user sessions for debugging
    // Only enable in production to avoid overwhelming dev environment
    replaysSessionSampleRate: IS_PRODUCTION ? 0.1 : 0,
    replaysOnErrorSampleRate: IS_PRODUCTION ? 1.0 : 0,

    // Integrations
    integrations: [
      // Browser performance monitoring
      // @ts-ignore - tracePropagationTargets is valid but not in all type versions
      Sentry.browserTracingIntegration({
        // Track navigation and interactions
        tracePropagationTargets: [
          'localhost',
          /^https:\/\/fne-lms\.vercel\.app/,
          /^https:\/\/.*\.supabase\.co/
        ]
      }),

      // Session replay for visual debugging
      Sentry.replayIntegration({
        // Mask all text and block all media by default for privacy
        maskAllText: true,
        blockAllMedia: true
      })
    ],

    // Filter and enhance events before sending to Sentry
    beforeSend(event, hint) {
      // Remove sensitive cookie data
      if (event.request?.cookies) {
        delete event.request.cookies;
      }

      if (event.request?.headers) {
        // Remove authorization headers
        delete event.request.headers['authorization'];
        delete event.request.headers['Authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['Cookie'];
      }

      // Add custom tags for better organization
      event.tags = {
        ...event.tags,
        platform: 'fne-lms',
        region: 'chile',
        runtime: 'client'
      };

      // Add user role information if available
      if (event.user) {
        const roles = event.user.roles || event.contexts?.user?.roles;
        if (roles && Array.isArray(roles)) {
          event.tags.user_roles = roles.join(',');
          event.tags.primary_role = roles[0] || 'unknown';
        }
      }

      // Add breadcrumb context
      event.contexts = {
        ...event.contexts,
        app: {
          app_name: 'FNE LMS',
          app_version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'
        }
      };

      return event;
    },

    // Ignore common non-critical errors that don't require action
    ignoreErrors: [
      // Browser extension errors
      'top.GLOBALS',
      'fb_xd_fragment',
      'bmi_SafeAddOnload',
      'EBCallBackMessageReceived',

      // ResizeObserver loop errors (harmless)
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',

      // Network errors that are expected
      'NetworkError',
      'Network request failed',
      'Failed to fetch',
      'Load failed',

      // Chunk loading errors (retry typically works)
      'ChunkLoadError',
      'Loading chunk',
      'Loading CSS chunk',

      // Browser cancellations
      'cancelled',
      'Cancelled',
      'AbortError',

      // Non-Error promise rejections
      'Non-Error promise rejection captured',

      // Supabase session refresh (handled gracefully)
      'Auth session missing',
      'refresh_token_not_found',

      // User navigation cancellations
      'Navigation cancelled',
      'Route cancelled'
    ],

    // Ignore errors from certain URLs
    denyUrls: [
      // Browser extensions
      /extensions\//i,
      /^chrome:\/\//i,
      /^moz-extension:\/\//i,

      // Third-party scripts
      /google-analytics\.com/i,
      /googletagmanager\.com/i,
      /facebook\.net/i,
      /connect\.facebook\.net/i
    ],

    // Enable debug mode in development
    debug: !IS_PRODUCTION,

    // Release tracking
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || undefined
  });

  // Log initialization in development
  if (!IS_PRODUCTION) {
    console.log('[Sentry Client] Initialized for environment:', ENVIRONMENT);
  }
} else {
  console.warn('[Sentry Client] DSN not configured. Error tracking is disabled.');
}
