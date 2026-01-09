/**
 * URL Validation Utility
 *
 * Validates and sanitizes URLs for safe usage in the application.
 * Prevents SSRF, open redirect, and iframe injection attacks.
 */

// Allowed protocols for URLs
const ALLOWED_PROTOCOLS = ['https:', 'http:'];

// M-1 FIX: Maximum URL length to prevent ReDoS attacks
const MAX_URL_LENGTH = 2048;

// Domains that are always safe for iframe embedding
const SAFE_IFRAME_DOMAINS = [
  // Video platforms
  'youtube.com',
  'www.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'player.vimeo.com',
  'vimeo.com',
  // Document embedding
  'docs.google.com',
  'drive.google.com',
  // Educational platforms
  'canva.com',
  'www.canva.com',
  'prezi.com',
  'www.prezi.com',
  // Microsoft
  'onedrive.live.com',
  'office.com',
  '*.sharepoint.com',
];

// Domains that should never be loaded (internal/sensitive)
const BLOCKED_DOMAINS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '*.local',
  '*.internal',
  '*.corp',
  'metadata.google.internal',
  '169.254.169.254', // AWS metadata
  'metadata.azure.com',
];

// Private IP ranges that should be blocked (SSRF prevention)
const PRIVATE_IP_PATTERNS = [
  /^127\.\d+\.\d+\.\d+$/, // Loopback 127.0.0.0/8
  /^10\.\d+\.\d+\.\d+$/, // Private 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/, // Private 172.16.0.0/12
  /^192\.168\.\d+\.\d+$/, // Private 192.168.0.0/16
  /^169\.254\.\d+\.\d+$/, // Link-local 169.254.0.0/16
  /^0\.0\.0\.0$/, // All zeros
  /^\[?::1\]?$/, // IPv6 loopback
  /^\[?fe80:/i, // IPv6 link-local
  /^\[?fc00:/i, // IPv6 unique local
  /^\[?fd/i, // IPv6 unique local
];

/**
 * Check if a URL is valid and uses an allowed protocol
 * M-1 FIX: Added length check to prevent ReDoS attacks
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // M-1 FIX: Prevent ReDoS by limiting URL length
  if (url.length > MAX_URL_LENGTH) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Check if a URL is safe for iframe embedding
 */
export function isSafeForIframe(url: string): boolean {
  if (!isValidUrl(url)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Check if it's a blocked domain
    if (isBlockedDomain(hostname)) {
      return false;
    }

    // Check if it matches a safe domain
    return SAFE_IFRAME_DOMAINS.some(domain => {
      if (domain.startsWith('*.')) {
        // Wildcard match
        const baseDomain = domain.slice(2);
        return hostname === baseDomain || hostname.endsWith('.' + baseDomain);
      }
      return hostname === domain;
    });
  } catch {
    return false;
  }
}

/**
 * Check if a hostname is a private IP address
 */
function isPrivateIP(hostname: string): boolean {
  // Remove brackets from IPv6
  const cleanHostname = hostname.replace(/^\[|\]$/g, '');
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(cleanHostname));
}

/**
 * Check if a domain is blocked (internal/sensitive)
 */
export function isBlockedDomain(hostname: string): boolean {
  const lowerHostname = hostname.toLowerCase();

  // Check against blocked domain list
  const isBlockedByList = BLOCKED_DOMAINS.some(blocked => {
    if (blocked.startsWith('*.')) {
      const suffix = blocked.slice(1); // Keep the dot
      return lowerHostname.endsWith(suffix);
    }
    return lowerHostname === blocked;
  });

  if (isBlockedByList) {
    return true;
  }

  // Check if it's a private IP address
  return isPrivateIP(lowerHostname);
}

/**
 * Check if URL is a valid external link (not internal/localhost)
 */
export function isExternalUrl(url: string): boolean {
  if (!isValidUrl(url)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return !isBlockedDomain(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Validate a URL and return a safe version or null
 */
export function sanitizeUrl(url: string): string | null {
  if (!isValidUrl(url)) {
    return null;
  }

  try {
    const parsed = new URL(url);

    // Block internal domains
    if (isBlockedDomain(parsed.hostname)) {
      return null;
    }

    // Normalize the URL
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Extract YouTube video ID from various URL formats
 * M-1 FIX: Added length check to prevent ReDoS attacks
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // M-1 FIX: Prevent ReDoS by limiting URL length before regex matching
  if (url.length > MAX_URL_LENGTH) {
    return null;
  }

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      // Validate video ID format (11 characters, alphanumeric with - and _)
      const videoId = match[1];
      if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return videoId;
      }
    }
  }

  return null;
}

/**
 * Extract Vimeo video ID from URL
 * M-1 FIX: Added length check to prevent ReDoS attacks
 */
export function extractVimeoVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // M-1 FIX: Prevent ReDoS by limiting URL length before regex matching
  if (url.length > MAX_URL_LENGTH) {
    return null;
  }

  const patterns = [
    /vimeo\.com\/(\d+)/,
    /player\.vimeo\.com\/video\/(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Get safe embed URL for video platforms
 */
export function getSafeEmbedUrl(url: string): string | null {
  const youtubeId = extractYouTubeVideoId(url);
  if (youtubeId) {
    return `https://www.youtube-nocookie.com/embed/${youtubeId}`;
  }

  const vimeoId = extractVimeoVideoId(url);
  if (vimeoId) {
    return `https://player.vimeo.com/video/${vimeoId}`;
  }

  // For other URLs, check if they're safe for iframe
  if (isSafeForIframe(url)) {
    return sanitizeUrl(url);
  }

  return null;
}

const urlValidator = {
  isValidUrl,
  isSafeForIframe,
  isBlockedDomain,
  isExternalUrl,
  sanitizeUrl,
  extractYouTubeVideoId,
  extractVimeoVideoId,
  getSafeEmbedUrl,
};

export default urlValidator;
