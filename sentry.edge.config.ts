/**
 * Sentry Edge Configuration
 *
 * Configures error tracking for Edge Runtime functions in the Genera application.
 * Edge runtime has limited Node.js APIs, so this config is minimal.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from '@sentry/nextjs';
import type { Event } from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENVIRONMENT = process.env.NODE_ENV || 'development';

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

      return scrubStudentData(event);
    },

    // Drops every transaction, including one started with sampled: true.
    beforeSendTransaction: () => null,

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
