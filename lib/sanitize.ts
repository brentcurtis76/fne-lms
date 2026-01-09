/**
 * HTML Sanitization Utility
 *
 * Uses DOMPurify to sanitize HTML content and prevent XSS attacks.
 * Works in both server-side (Node.js) and client-side (browser) environments.
 */

import DOMPurify from 'isomorphic-dompurify';

// M-3 FIX: Maximum HTML length to prevent DoS attacks
const MAX_HTML_LENGTH = 1_000_000; // 1MB

// Configuration for different sanitization contexts
const DEFAULT_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    // Text formatting
    'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'mark', 'small', 'del', 'ins', 'sub', 'sup',
    // Headings
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Lists
    'ul', 'ol', 'li',
    // Structure
    'div', 'span', 'blockquote', 'pre', 'code', 'hr',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    // Links and media
    'a', 'img',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'id',
    'target', 'rel', 'width', 'height',
    // Table attributes
    'colspan', 'rowspan', 'scope',
  ],
  // Note: 'style' attribute removed to prevent CSS-based XSS (javascript: in url())
  ALLOW_DATA_ATTR: false,
  // Force links to open safely
  ADD_ATTR: ['target', 'rel'],
};

// Strict config - no links, images, or styles
const STRICT_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'small',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'div', 'span', 'blockquote', 'pre', 'code',
  ],
  ALLOWED_ATTR: ['class', 'id'],
  ALLOW_DATA_ATTR: false,
};

// Rich content config - includes iframes for YouTube/Vimeo only
const RICH_CONTENT_CONFIG: DOMPurify.Config = {
  ...DEFAULT_CONFIG,
  ALLOWED_TAGS: [
    ...(DEFAULT_CONFIG.ALLOWED_TAGS as string[]),
    'iframe',
    'figure',
    'figcaption',
  ],
  ALLOWED_ATTR: [
    ...(DEFAULT_CONFIG.ALLOWED_ATTR as string[]),
    'frameborder', 'allow', 'allowfullscreen', 'loading',
  ],
};

/**
 * Sanitize HTML content with default configuration
 * Suitable for most content including rich text from editors
 * M-3 FIX: Added max length check to prevent DoS
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty || typeof dirty !== 'string') {
    return '';
  }

  // M-3 FIX: Prevent DoS by limiting input length
  if (dirty.length > MAX_HTML_LENGTH) {
    console.warn('[sanitize] HTML content exceeds maximum length, truncating');
    dirty = dirty.slice(0, MAX_HTML_LENGTH);
  }

  const clean = DOMPurify.sanitize(dirty, DEFAULT_CONFIG);

  // Post-process: ensure all links have safe attributes
  return postProcessLinks(clean);
}

/**
 * Sanitize HTML with strict configuration
 * Use for user-generated content that shouldn't include links/images
 * M-3 FIX: Added max length check to prevent DoS
 */
export function sanitizeHtmlStrict(dirty: string): string {
  if (!dirty || typeof dirty !== 'string') {
    return '';
  }

  // M-3 FIX: Prevent DoS by limiting input length
  if (dirty.length > MAX_HTML_LENGTH) {
    console.warn('[sanitize] HTML content exceeds maximum length, truncating');
    dirty = dirty.slice(0, MAX_HTML_LENGTH);
  }

  return DOMPurify.sanitize(dirty, STRICT_CONFIG);
}

/**
 * Sanitize HTML for rich content including safe iframes
 * Only allows YouTube and Vimeo embeds
 * M-3 FIX: Added max length check to prevent DoS
 *
 * Note: We filter iframes post-sanitization instead of using DOMPurify hooks
 * to avoid race conditions in concurrent sanitization calls.
 */
export function sanitizeRichContent(dirty: string): string {
  if (!dirty || typeof dirty !== 'string') {
    return '';
  }

  // M-3 FIX: Prevent DoS by limiting input length
  if (dirty.length > MAX_HTML_LENGTH) {
    console.warn('[sanitize] HTML content exceeds maximum length, truncating');
    dirty = dirty.slice(0, MAX_HTML_LENGTH);
  }

  // First pass: sanitize with DOMPurify
  const sanitized = DOMPurify.sanitize(dirty, RICH_CONTENT_CONFIG);

  // Second pass: filter out unsafe iframes
  const withSafeIframes = filterUnsafeIframes(sanitized);

  return postProcessLinks(withSafeIframes);
}

/**
 * Filter out iframes from untrusted sources
 * Uses DOM parsing when available, falls back to regex for server-side
 */
function filterUnsafeIframes(html: string): string {
  if (typeof window !== 'undefined' && window.DOMParser) {
    // Browser: use DOM API
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    doc.querySelectorAll('iframe').forEach(iframe => {
      const src = iframe.getAttribute('src') || '';
      if (!isAllowedIframeSrc(src)) {
        iframe.remove();
      }
    });

    return doc.body.innerHTML;
  }

  // Server-side: use regex to filter iframes (less robust but safe for this use case)
  return html.replace(
    /<iframe\s+[^>]*src=["']([^"']+)["'][^>]*>[\s\S]*?<\/iframe>/gi,
    (match, src) => {
      return isAllowedIframeSrc(src) ? match : '';
    }
  );
}

/**
 * Sanitize plain text - strips ALL HTML tags
 */
export function sanitizeText(dirty: string): string {
  if (!dirty || typeof dirty !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Check if an iframe src is from an allowed domain
 */
export function isAllowedIframeSrc(src: string): boolean {
  if (!src) return false;

  const allowedDomains = [
    'youtube.com',
    'www.youtube.com',
    'youtube-nocookie.com',
    'www.youtube-nocookie.com',
    'youtu.be',
    'player.vimeo.com',
    'vimeo.com',
  ];

  try {
    const url = new URL(src);
    return allowedDomains.some(domain =>
      url.hostname === domain || url.hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

/**
 * Post-process sanitized HTML to ensure links are safe
 */
function postProcessLinks(html: string): string {
  // Use DOMParser in browser or simple regex for server
  if (typeof window !== 'undefined' && window.DOMParser) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    doc.querySelectorAll('a').forEach(link => {
      // External links should open in new tab with security attributes
      const href = link.getAttribute('href') || '';
      if (href.startsWith('http://') || href.startsWith('https://')) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    });

    return doc.body.innerHTML;
  }

  // Server-side fallback: use regex (less robust but functional)
  return html.replace(
    /<a\s+([^>]*href=["'](https?:\/\/[^"']+)["'][^>]*)>/gi,
    (match, attrs, href) => {
      if (!attrs.includes('target=')) {
        attrs += ' target="_blank"';
      }
      if (!attrs.includes('rel=')) {
        attrs += ' rel="noopener noreferrer"';
      }
      return `<a ${attrs}>`;
    }
  );
}

/**
 * Escape HTML special characters for display as text
 * Use when you want to display HTML as literal text, not render it
 */
export function escapeHtml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return text.replace(/[&<>"'/]/g, char => escapeMap[char]);
}

const sanitize = {
  sanitizeHtml,
  sanitizeHtmlStrict,
  sanitizeRichContent,
  sanitizeText,
  escapeHtml,
  isAllowedIframeSrc,
};

export default sanitize;
