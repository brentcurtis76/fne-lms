/**
 * Client-Side Instrumentation
 *
 * This file is imported by Next.js to initialize client-side Sentry.
 * It runs in the browser and handles error tracking and performance monitoring
 * for the client side of the Genera application.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from '@sentry/nextjs';
import type { Event } from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENVIRONMENT = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = ENVIRONMENT === 'production';

// Student identifiers (Ley 21.719) can reach an event through a URL (page,
// referrer, breadcrumbs, transaction name, spans), the request body or the
// Sentry user: URLs keep only their origin and the rest is dropped.
function urlOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function scrubStudentData<T extends Event>(event: T): T {
  if (event.request) {
    if (event.request.url) event.request.url = urlOrigin(event.request.url);
    delete event.request.query_string;
    delete event.request.data;
    if (event.request.headers) {
      delete event.request.headers['referer'];
      delete event.request.headers['Referer'];
    }
  }
  event.breadcrumbs?.forEach(({ data }) => {
    if (!data) return;
    for (const key of ['from', 'to', 'url']) {
      if (typeof data[key] === 'string') data[key] = urlOrigin(data[key]);
    }
    delete data['http.query'];
    delete data['http.fragment'];
  });
  delete event.user;
  delete event.transaction;
  delete event.spans;
  if (event.tags) delete event.tags.transaction;
  return event;
}

// Only initialize Sentry if DSN is provided
if (SENTRY_DSN) {
  Sentry.init({
    // Data Source Name - connects to your Sentry project
    dsn: SENTRY_DSN,

    // Environment tracking
    environment: ENVIRONMENT,

    // Tracing stays off until privacy approves a policy: transaction names
    // and spans can carry student identifiers.
    tracesSampleRate: 0,

    // Session Replay stays off in every environment and the replay
    // integration is not loaded: recording minors' sessions needs a privacy
    // decision first.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

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
          app_name: 'Genera',
          app_version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'
        }
      };

      return scrubStudentData(event);
    },

    // Drops every transaction, including one started with sampled: true.
    beforeSendTransaction: () => null,

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
