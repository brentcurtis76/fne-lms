/**
 * Web Vitals Collection Hook
 *
 * Collects Core Web Vitals metrics from real user sessions
 * and reports them to the QA vitals API.
 *
 * Uses the web-vitals library to measure:
 * - LCP: Largest Contentful Paint
 * - INP: Interaction to Next Paint (replaces FID)
 * - CLS: Cumulative Layout Shift
 * - FCP: First Contentful Paint
 * - TTFB: Time to First Byte
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

// Types for web-vitals metrics
type VitalName = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';

interface WebVitalMetric {
  name: VitalName;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  navigationType: string;
}

// Generate a simple session ID for grouping metrics
const generateSessionId = (): string => {
  if (typeof window === 'undefined') return '';
  let sessionId = sessionStorage.getItem('qa_vitals_session_id');
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('qa_vitals_session_id', sessionId);
  }
  return sessionId;
};

// Debounced reporter to avoid excessive API calls
const createReporter = () => {
  const queue: Array<{
    page_url: string;
    vital_name: VitalName;
    value: number;
    user_agent: string;
    session_id: string;
  }> = [];
  let timeoutId: NodeJS.Timeout | null = null;

  const flush = async () => {
    if (queue.length === 0) return;

    const batch = [...queue];
    queue.length = 0;

    // Report each vital (could be batched in future)
    for (const vital of batch) {
      try {
        await fetch('/api/qa/vitals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(vital),
        });
      } catch (error) {
        // Silently fail - vitals collection should not interrupt user experience
        console.debug('Failed to report vital:', error);
      }
    }
  };

  return (metric: WebVitalMetric, pageUrl: string) => {
    queue.push({
      page_url: pageUrl,
      vital_name: metric.name,
      value: metric.value,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      session_id: generateSessionId(),
    });

    // Debounce: wait 1 second before sending
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(flush, 1000);
  };
};

const reporter = createReporter();

/**
 * Hook to collect and report Web Vitals
 *
 * @param enabled - Whether to collect vitals (default: true in production)
 */
export function useWebVitals(enabled = true) {
  const router = useRouter();
  const initializedRef = useRef(false);

  useEffect(() => {
    // Only run once and only if enabled
    if (!enabled || initializedRef.current || typeof window === 'undefined') {
      return;
    }

    initializedRef.current = true;

    // Dynamic import of web-vitals to avoid SSR issues
    const loadWebVitals = async () => {
      try {
        // web-vitals must be installed: npm install web-vitals
        const { onLCP, onINP, onCLS, onFCP, onTTFB } = await import('web-vitals');

        const currentUrl = window.location.pathname;

        // Report each vital when it becomes available
        onLCP((metric) => reporter(metric as WebVitalMetric, currentUrl));
        onINP((metric) => reporter(metric as WebVitalMetric, currentUrl));
        onCLS((metric) => reporter(metric as WebVitalMetric, currentUrl));
        onFCP((metric) => reporter(metric as WebVitalMetric, currentUrl));
        onTTFB((metric) => reporter(metric as WebVitalMetric, currentUrl));
      } catch (error) {
        // web-vitals not installed or import failed
        console.debug('Web vitals collection not available:', error);
      }
    };

    loadWebVitals();
  }, [enabled]);

  // Re-measure on route change (for SPAs)
  useEffect(() => {
    if (!enabled) return;

    const handleRouteChange = async () => {
      try {
        const { onLCP, onINP, onCLS, onFCP, onTTFB } = await import('web-vitals');
        const currentUrl = window.location.pathname;

        // Note: Not all metrics re-measure on soft navigation
        // CLS and INP can accumulate across the page lifecycle
        onLCP((metric) => reporter(metric as WebVitalMetric, currentUrl));
        onFCP((metric) => reporter(metric as WebVitalMetric, currentUrl));
        onTTFB((metric) => reporter(metric as WebVitalMetric, currentUrl));
      } catch {
        // Silently ignore
      }
    };

    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [enabled, router.events]);
}

/**
 * Standalone function to manually report a vital
 * Useful for custom measurements
 */
export async function reportVital(
  vitalName: VitalName,
  value: number,
  pageUrl?: string
) {
  try {
    await fetch('/api/qa/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_url: pageUrl || (typeof window !== 'undefined' ? window.location.pathname : '/'),
        vital_name: vitalName,
        value,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        session_id: generateSessionId(),
      }),
    });
  } catch (error) {
    console.debug('Failed to report vital:', error);
  }
}

export default useWebVitals;
