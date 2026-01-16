/**
 * Browser Info Utility
 *
 * Captures environment details for QA debugging context.
 */

import type { BrowserInfo } from '@/types/qa';

/**
 * Captures current browser environment information.
 *
 * @returns BrowserInfo object with userAgent, viewport, language, and platform
 */
export function getBrowserInfo(): BrowserInfo {
  if (typeof window === 'undefined') {
    // Server-side fallback
    return {
      userAgent: 'Server-side rendering',
      viewport: { width: 0, height: 0 },
      language: 'unknown',
      platform: 'server',
    };
  }

  return {
    userAgent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    language: navigator.language,
    platform: navigator.platform || 'unknown',
  };
}

/**
 * Determines the environment based on the current URL.
 *
 * @returns 'local' | 'staging' | 'production'
 */
export function detectEnvironment(): 'local' | 'staging' | 'production' {
  if (typeof window === 'undefined') {
    return 'local';
  }

  const hostname = window.location.hostname;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'local';
  }

  if (
    hostname.includes('staging') ||
    hostname.includes('preview') ||
    hostname.includes('vercel.app')
  ) {
    return 'staging';
  }

  return 'production';
}

/**
 * Gets detailed browser information for debugging.
 *
 * @returns Extended browser info including connection type, memory, etc.
 */
export function getExtendedBrowserInfo(): BrowserInfo & {
  screenResolution: { width: number; height: number };
  colorDepth: number;
  cookiesEnabled: boolean;
  onlineStatus: boolean;
  timezone: string;
  currentUrl: string;
} {
  const basicInfo = getBrowserInfo();

  if (typeof window === 'undefined') {
    return {
      ...basicInfo,
      screenResolution: { width: 0, height: 0 },
      colorDepth: 0,
      cookiesEnabled: false,
      onlineStatus: false,
      timezone: 'unknown',
      currentUrl: '',
    };
  }

  return {
    ...basicInfo,
    screenResolution: {
      width: window.screen.width,
      height: window.screen.height,
    },
    colorDepth: window.screen.colorDepth,
    cookiesEnabled: navigator.cookieEnabled,
    onlineStatus: navigator.onLine,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    currentUrl: window.location.href,
  };
}

/**
 * Formats browser info for display in reports.
 *
 * @param info - BrowserInfo object
 * @returns Formatted string for display
 */
export function formatBrowserInfo(info: BrowserInfo): string {
  return `
Navegador: ${info.userAgent}
Ventana: ${info.viewport.width}x${info.viewport.height}
Idioma: ${info.language}
Plataforma: ${info.platform}
`.trim();
}

export default getBrowserInfo;
