/**
 * Unit tests for utils/urlValidator.ts
 * Tests URL validation for iframes, external links, and SSRF prevention
 */

import { describe, it, expect } from 'vitest';
import {
  isValidUrl,
  isSafeForIframe,
  isBlockedDomain,
  isExternalUrl,
  sanitizeUrl,
  extractYouTubeVideoId,
  extractVimeoVideoId,
  getSafeEmbedUrl,
} from '../../utils/urlValidator';

describe('isValidUrl', () => {
  it('should accept valid HTTPS URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('https://sub.example.com/path?query=1')).toBe(true);
  });

  it('should accept valid HTTP URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('should reject invalid URLs', () => {
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('file:///etc/passwd')).toBe(false);
  });

  it('should reject javascript: URLs', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });

  it('should reject data: URLs', () => {
    expect(isValidUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('should handle null/undefined', () => {
    expect(isValidUrl(null as any)).toBe(false);
    expect(isValidUrl(undefined as any)).toBe(false);
  });
});

describe('isSafeForIframe', () => {
  describe('YouTube URLs', () => {
    it('should allow YouTube embed URLs', () => {
      expect(isSafeForIframe('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(true);
      expect(isSafeForIframe('https://youtube.com/embed/dQw4w9WgXcQ')).toBe(true);
    });

    it('should allow YouTube-nocookie URLs', () => {
      expect(isSafeForIframe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe(true);
    });

    it('should allow youtu.be URLs', () => {
      expect(isSafeForIframe('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    });
  });

  describe('Vimeo URLs', () => {
    it('should allow Vimeo player URLs', () => {
      expect(isSafeForIframe('https://player.vimeo.com/video/123456')).toBe(true);
    });

    it('should allow Vimeo main URLs', () => {
      expect(isSafeForIframe('https://vimeo.com/123456')).toBe(true);
    });
  });

  describe('Google URLs', () => {
    it('should allow Google Docs URLs', () => {
      expect(isSafeForIframe('https://docs.google.com/document/d/abc123/edit')).toBe(true);
    });

    it('should allow Google Drive URLs', () => {
      expect(isSafeForIframe('https://drive.google.com/file/d/abc123/view')).toBe(true);
    });
  });

  describe('Blocked domains', () => {
    it('should reject localhost', () => {
      expect(isSafeForIframe('http://localhost:3000')).toBe(false);
      expect(isSafeForIframe('http://localhost/admin')).toBe(false);
    });

    it('should reject 127.0.0.1', () => {
      expect(isSafeForIframe('http://127.0.0.1:8080')).toBe(false);
    });

    it('should reject internal IPs', () => {
      expect(isSafeForIframe('http://0.0.0.0')).toBe(false);
    });

    it('should reject unknown external domains', () => {
      expect(isSafeForIframe('https://malicious-site.com/embed')).toBe(false);
      expect(isSafeForIframe('https://random-website.org')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should reject invalid URLs', () => {
      expect(isSafeForIframe('')).toBe(false);
      expect(isSafeForIframe('not-a-url')).toBe(false);
    });

    it('should reject look-alike domains', () => {
      expect(isSafeForIframe('https://youtube.com.attacker.com/embed')).toBe(false);
      expect(isSafeForIframe('https://fakeyoutube.com/embed')).toBe(false);
    });
  });
});

describe('isBlockedDomain', () => {
  it('should block localhost', () => {
    expect(isBlockedDomain('localhost')).toBe(true);
  });

  it('should block loopback IPs', () => {
    expect(isBlockedDomain('127.0.0.1')).toBe(true);
    expect(isBlockedDomain('0.0.0.0')).toBe(true);
    expect(isBlockedDomain('::1')).toBe(true);
  });

  it('should block .local domains', () => {
    expect(isBlockedDomain('myserver.local')).toBe(true);
  });

  it('should block .internal domains', () => {
    expect(isBlockedDomain('api.internal')).toBe(true);
  });

  it('should block metadata endpoints', () => {
    expect(isBlockedDomain('metadata.google.internal')).toBe(true);
    expect(isBlockedDomain('169.254.169.254')).toBe(true);
  });

  it('should allow public domains', () => {
    expect(isBlockedDomain('example.com')).toBe(false);
    expect(isBlockedDomain('google.com')).toBe(false);
  });
});

describe('isExternalUrl', () => {
  it('should accept external HTTPS URLs', () => {
    expect(isExternalUrl('https://example.com')).toBe(true);
    expect(isExternalUrl('https://google.com/search?q=test')).toBe(true);
  });

  it('should reject internal URLs', () => {
    expect(isExternalUrl('http://localhost:3000')).toBe(false);
    expect(isExternalUrl('http://127.0.0.1')).toBe(false);
  });

  it('should reject invalid URLs', () => {
    expect(isExternalUrl('')).toBe(false);
    expect(isExternalUrl('not-a-url')).toBe(false);
  });
});

describe('sanitizeUrl', () => {
  it('should return normalized URL for valid external URLs', () => {
    const result = sanitizeUrl('https://example.com/path');
    expect(result).toBe('https://example.com/path');
  });

  it('should return null for internal URLs', () => {
    expect(sanitizeUrl('http://localhost:3000')).toBe(null);
    expect(sanitizeUrl('http://127.0.0.1')).toBe(null);
  });

  it('should return null for invalid URLs', () => {
    expect(sanitizeUrl('')).toBe(null);
    expect(sanitizeUrl('javascript:alert(1)')).toBe(null);
  });
});

describe('extractYouTubeVideoId', () => {
  it('should extract ID from standard watch URLs', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('should extract ID from short URLs', () => {
    expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('should extract ID from embed URLs', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('should extract ID from shorts URLs', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('should handle URLs with additional parameters', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120')).toBe('dQw4w9WgXcQ');
  });

  it('should return null for invalid URLs', () => {
    expect(extractYouTubeVideoId('')).toBe(null);
    expect(extractYouTubeVideoId('https://vimeo.com/123456')).toBe(null);
    expect(extractYouTubeVideoId('https://youtube.com/watch?v=short')).toBe(null); // Too short
  });

  it('should validate video ID format', () => {
    // Valid: 11 chars with alphanumeric, - and _
    expect(extractYouTubeVideoId('https://youtube.com/watch?v=abc123DEF_-')).toBe('abc123DEF_-');
    // Invalid: contains special chars
    expect(extractYouTubeVideoId('https://youtube.com/watch?v=abc!@#$%^&*()')).toBe(null);
  });
});

describe('extractVimeoVideoId', () => {
  it('should extract ID from Vimeo URLs', () => {
    expect(extractVimeoVideoId('https://vimeo.com/123456789')).toBe('123456789');
  });

  it('should extract ID from player URLs', () => {
    expect(extractVimeoVideoId('https://player.vimeo.com/video/123456789')).toBe('123456789');
  });

  it('should return null for invalid URLs', () => {
    expect(extractVimeoVideoId('')).toBe(null);
    expect(extractVimeoVideoId('https://youtube.com/watch?v=abc123')).toBe(null);
  });
});

describe('getSafeEmbedUrl', () => {
  it('should return YouTube-nocookie embed URL for YouTube links', () => {
    const result = getSafeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('should return Vimeo player URL for Vimeo links', () => {
    const result = getSafeEmbedUrl('https://vimeo.com/123456789');
    expect(result).toBe('https://player.vimeo.com/video/123456789');
  });

  it('should return sanitized URL for allowed iframe domains', () => {
    const result = getSafeEmbedUrl('https://docs.google.com/document/d/abc123/edit');
    expect(result).toContain('docs.google.com');
  });

  it('should return null for disallowed domains', () => {
    expect(getSafeEmbedUrl('https://malicious-site.com/embed')).toBe(null);
  });

  it('should return null for invalid URLs', () => {
    expect(getSafeEmbedUrl('')).toBe(null);
    expect(getSafeEmbedUrl('javascript:alert(1)')).toBe(null);
  });
});

// SSRF Attack Vector Tests
describe('SSRF Prevention Tests', () => {
  const ssrfPayloads = [
    'http://localhost',
    'http://localhost:8080',
    'http://127.0.0.1',
    'http://127.0.0.1:3000/admin',
    'http://0.0.0.0',
    'http://[::1]',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal',
    'http://internal.server.local',
    'http://api.internal/secrets',
    'http://192.168.1.1',
    'http://10.0.0.1',
    'http://172.16.0.1',
  ];

  ssrfPayloads.forEach((payload) => {
    it(`should block SSRF payload: ${payload}`, () => {
      expect(isSafeForIframe(payload)).toBe(false);
      expect(isExternalUrl(payload)).toBe(false);
    });
  });
});
