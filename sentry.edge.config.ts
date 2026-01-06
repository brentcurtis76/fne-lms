/**
 * Sentry Edge Configuration
 *
 * Configures error tracking for Edge Runtime functions in the Genera application.
 * Edge runtime has limited Node.js APIs, so this config is minimal.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENVIRONMENT = process.env.NODE_ENV || 'development';

// Only initialize Sentry if DSN is provided
if (SENTRY_DSN) {
  Sentry.init({
    // Data Source Name - connects to your Sentry project
    dsn: SENTRY_DSN,

    // Environment tracking
    environment: ENVIRONMENT,

    // Performance Monitoring - lower sample rate for edge due to higher volume
    tracesSampleRate: 0.1,

    // Filter and enhance events before sending to Sentry
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['Authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['Cookie'];
      }

      // Add custom tags
      event.tags = {
        ...event.tags,
        platform: 'fne-lms',
        region: 'chile',
        runtime: 'edge'
      };

      return event;
    },

    // Ignore common non-critical errors
    ignoreErrors: [
      'Auth session missing',
      'Network request failed',
      'Failed to fetch'
    ],

    // Enable debug mode in development
    debug: ENVIRONMENT !== 'production',

    // Release tracking
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined
  });
} else {
  console.warn('[Sentry Edge] DSN not configured. Error tracking is disabled.');
}
