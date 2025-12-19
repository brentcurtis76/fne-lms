/**
 * Unit tests for lib/sanitize.ts
 * Tests HTML sanitization functions for XSS prevention
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeHtml,
  sanitizeHtmlStrict,
  sanitizeRichContent,
  sanitizeText,
  escapeHtml,
  isAllowedIframeSrc,
} from '../../lib/sanitize';

describe('sanitizeHtml', () => {
  it('should return empty string for null/undefined input', () => {
    expect(sanitizeHtml(null as any)).toBe('');
    expect(sanitizeHtml(undefined as any)).toBe('');
    expect(sanitizeHtml('')).toBe('');
  });

  it('should preserve safe HTML tags', () => {
    const input = '<p>Hello <strong>world</strong></p>';
    expect(sanitizeHtml(input)).toBe('<p>Hello <strong>world</strong></p>');
  });

  it('should remove script tags', () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    expect(sanitizeHtml(input)).toBe('<p>Hello</p>');
  });

  it('should remove onclick handlers', () => {
    const input = '<button onclick="alert(\'xss\')">Click</button>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onclick');
  });

  it('should remove javascript: URLs', () => {
    const input = '<a href="javascript:alert(\'xss\')">Click me</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
  });

  it('should preserve allowed attributes', () => {
    const input = '<a href="https://example.com" class="link" title="Example">Link</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('class="link"');
  });

  it('should handle nested malicious content', () => {
    const input = '<div><p><script>alert("xss")</script>Safe text</p></div>';
    expect(sanitizeHtml(input)).toBe('<div><p>Safe text</p></div>');
  });

  it('should remove data attributes', () => {
    const input = '<div data-malicious="payload">Content</div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('data-malicious');
  });

  it('should handle XSS via SVG', () => {
    const input = '<svg onload="alert(\'xss\')"><circle r="50"/></svg>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onload');
  });

  it('should handle XSS via img onerror', () => {
    const input = '<img src="x" onerror="alert(\'xss\')">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onerror');
  });

  it('should handle encoded XSS attempts', () => {
    const input = '<p>&#60;script&#62;alert("xss")&#60;/script&#62;</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script>');
  });
});

describe('sanitizeHtmlStrict', () => {
  it('should remove links and images', () => {
    const input = '<p>Text with <a href="https://example.com">link</a> and <img src="image.jpg"></p>';
    const result = sanitizeHtmlStrict(input);
    expect(result).not.toContain('<a');
    expect(result).not.toContain('<img');
    expect(result).toContain('Text with');
  });

  it('should preserve basic formatting', () => {
    const input = '<p><strong>Bold</strong> and <em>italic</em></p>';
    expect(sanitizeHtmlStrict(input)).toBe('<p><strong>Bold</strong> and <em>italic</em></p>');
  });

  it('should remove style attributes', () => {
    const input = '<p style="color: red">Text</p>';
    const result = sanitizeHtmlStrict(input);
    expect(result).not.toContain('style=');
  });
});

describe('sanitizeRichContent', () => {
  it('should allow YouTube iframes', () => {
    const input = '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>';
    const result = sanitizeRichContent(input);
    expect(result).toContain('youtube.com');
  });

  it('should allow YouTube-nocookie iframes', () => {
    const input = '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>';
    const result = sanitizeRichContent(input);
    expect(result).toContain('youtube-nocookie.com');
  });

  it('should allow Vimeo iframes', () => {
    const input = '<iframe src="https://player.vimeo.com/video/123456"></iframe>';
    const result = sanitizeRichContent(input);
    expect(result).toContain('vimeo.com');
  });

  it('should remove iframes from untrusted sources', () => {
    const input = '<iframe src="https://malicious-site.com/embed"></iframe>';
    const result = sanitizeRichContent(input);
    expect(result).not.toContain('malicious-site.com');
    expect(result).not.toContain('<iframe');
  });

  it('should preserve figure and figcaption', () => {
    const input = '<figure><img src="photo.jpg"><figcaption>Caption</figcaption></figure>';
    const result = sanitizeRichContent(input);
    expect(result).toContain('<figure>');
    expect(result).toContain('<figcaption>');
  });
});

describe('sanitizeText', () => {
  it('should strip all HTML tags', () => {
    const input = '<p>Hello <strong>world</strong>!</p>';
    expect(sanitizeText(input)).toBe('Hello world!');
  });

  it('should handle script tags', () => {
    const input = '<script>alert("xss")</script>Safe text';
    expect(sanitizeText(input)).toBe('Safe text');
  });

  it('should return empty string for null/undefined', () => {
    expect(sanitizeText(null as any)).toBe('');
    expect(sanitizeText(undefined as any)).toBe('');
  });

  it('should preserve plain text', () => {
    const input = 'Just plain text without HTML';
    expect(sanitizeText(input)).toBe('Just plain text without HTML');
  });
});

describe('escapeHtml', () => {
  it('should escape special characters', () => {
    const input = '<script>alert("xss")</script>';
    const result = escapeHtml(input);
    expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
  });

  it('should escape ampersands', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('should escape quotes', () => {
    expect(escapeHtml('Say "hello"')).toBe('Say &quot;hello&quot;');
    expect(escapeHtml("It's fine")).toBe('It&#x27;s fine');
  });

  it('should return empty string for null/undefined', () => {
    expect(escapeHtml(null as any)).toBe('');
    expect(escapeHtml(undefined as any)).toBe('');
  });

  it('should handle forward slashes', () => {
    expect(escapeHtml('</script>')).toContain('&#x2F;');
  });
});

describe('isAllowedIframeSrc', () => {
  it('should allow YouTube URLs', () => {
    expect(isAllowedIframeSrc('https://www.youtube.com/embed/abc123')).toBe(true);
    expect(isAllowedIframeSrc('https://youtube.com/embed/abc123')).toBe(true);
    expect(isAllowedIframeSrc('https://www.youtube-nocookie.com/embed/abc123')).toBe(true);
    expect(isAllowedIframeSrc('https://youtu.be/abc123')).toBe(true);
  });

  it('should allow Vimeo URLs', () => {
    expect(isAllowedIframeSrc('https://player.vimeo.com/video/123456')).toBe(true);
    expect(isAllowedIframeSrc('https://vimeo.com/123456')).toBe(true);
  });

  it('should reject non-allowed domains', () => {
    expect(isAllowedIframeSrc('https://malicious-site.com/embed')).toBe(false);
    expect(isAllowedIframeSrc('https://evil.youtube.com.attacker.com/embed')).toBe(false);
  });

  it('should reject invalid URLs', () => {
    expect(isAllowedIframeSrc('')).toBe(false);
    expect(isAllowedIframeSrc('not-a-url')).toBe(false);
    expect(isAllowedIframeSrc('javascript:alert(1)')).toBe(false);
  });

  it('should handle null/undefined', () => {
    expect(isAllowedIframeSrc(null as any)).toBe(false);
    expect(isAllowedIframeSrc(undefined as any)).toBe(false);
  });
});

// XSS Payload Tests - Common attack vectors
describe('XSS Attack Vector Tests', () => {
  // Payloads that should have executable code removed
  const executablePayloads = [
    { payload: '<script>alert(1)</script>', name: 'script tag' },
    { payload: '<img src=x onerror=alert(1)>', name: 'img onerror' },
    { payload: '<svg onload=alert(1)>', name: 'svg onload' },
    { payload: '<body onload=alert(1)>', name: 'body onload' },
    { payload: '<iframe src="javascript:alert(1)">', name: 'iframe javascript' },
    { payload: '<a href="javascript:alert(1)">click</a>', name: 'href javascript' },
    { payload: '<input onfocus=alert(1) autofocus>', name: 'input onfocus' },
    { payload: '<marquee onstart=alert(1)>', name: 'marquee onstart' },
    { payload: '<video><source onerror=alert(1)>', name: 'source onerror' },
    { payload: '<details open ontoggle=alert(1)>', name: 'details ontoggle' },
    { payload: '"><script>alert(1)</script>', name: 'attribute breakout script' },
    { payload: '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>', name: 'nested mXSS' },
    { payload: '<x onclick=alert(1)>click', name: 'custom element onclick' },
    { payload: '<form><button formaction=javascript:alert(1)>click', name: 'formaction javascript' },
  ];

  executablePayloads.forEach(({ payload, name }) => {
    it(`should neutralize XSS: ${name}`, () => {
      const result = sanitizeHtml(payload);
      // Check that event handlers are removed
      expect(result).not.toContain('onerror=');
      expect(result).not.toContain('onclick=');
      expect(result).not.toContain('onload=');
      expect(result).not.toContain('onfocus=');
      expect(result).not.toContain('ontoggle=');
      expect(result).not.toContain('onstart=');
      expect(result).not.toContain('formaction=');
      // Check script tags are removed
      expect(result).not.toContain('<script');
      // Check javascript: protocol in URLs is removed
      if (payload.includes('href=') || payload.includes('src=')) {
        expect(result).not.toContain('javascript:');
      }
    });
  });

  // Test that plain text is preserved (not executable)
  it('should preserve non-executable text content', () => {
    const input = "Text mentioning alert() function is fine";
    const result = sanitizeHtml(`<p>${input}</p>`);
    expect(result).toContain('alert()');
  });

  // Test CSS background URL (not executable in modern browsers with DOMPurify)
  it('should handle CSS background URLs safely', () => {
    const input = '<div style="background:url(javascript:alert(1))">text</div>';
    const result = sanitizeHtml(input);
    // DOMPurify sanitizes or removes dangerous CSS
    // The style may be kept but the javascript: URL should be sanitized
    expect(result).not.toContain('javascript:alert');
  });
});
