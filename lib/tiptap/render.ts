import { generateHTML } from '@tiptap/html';
import DOMPurify from 'isomorphic-dompurify';
import { meetingEditorExtensions } from './extensions';
import { isEmptyDoc as isEmptyDocHelper, plainTextFromDoc } from './helpers';
import { MEETING_ALLOWED_TAGS, MEETING_ALLOWED_ATTR } from './sanitize';

const INLINE_STYLES: Record<string, string> = {
  h2: 'font-family: Arial, sans-serif; font-size: 20px; font-weight: 700; color: #0a0a0a; margin: 24px 0 12px 0; line-height: 1.3;',
  h3: 'font-family: Arial, sans-serif; font-size: 16px; font-weight: 700; color: #0a0a0a; margin: 20px 0 8px 0; line-height: 1.3;',
  p: 'font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333333; margin: 0 0 12px 0;',
  ul: 'font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333333; margin: 0 0 12px 0; padding-left: 24px;',
  ol: 'font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333333; margin: 0 0 12px 0; padding-left: 24px;',
  li: 'margin: 0 0 4px 0;',
  strong: 'font-weight: 700;',
  em: 'font-style: italic;',
  u: 'text-decoration: underline;',
};

const applyInlineStyles = (html: string): string => {
  return html
    // MEETING_ALLOWED_ATTR = [] so DOMPurify has already stripped every
    // attribute by the time we get here — no class-strip needed. The regex
    // still captures any `style` that downstream code might one day inject
    // via post-sanitize transforms.
    .replace(/<(h2|h3|p|ul|ol|li|strong|em|u)(\s[^>]*)?>/gi, (_match, tag, attrs = '') => {
      const existingStyleMatch = /\sstyle\s*=\s*"([^"]*)"/i.exec(attrs || '');
      const inline = INLINE_STYLES[tag.toLowerCase()];
      if (!inline) return `<${tag}${attrs || ''}>`;
      if (existingStyleMatch) {
        const merged = `${inline} ${existingStyleMatch[1]}`;
        const newAttrs = (attrs || '').replace(existingStyleMatch[0], ` style="${merged}"`);
        return `<${tag}${newAttrs}>`;
      }
      return `<${tag}${attrs || ''} style="${inline}">`;
    });
};

/**
 * generateHTML → DOMPurify sanitize, shared by the email renderer and the
 * in-app `RichTextView`. Returns '' for empty/invalid docs. Two call sites
 * previously reimplemented this pipeline with identical allowlists — this
 * is the security invariant they now share, so an allowlist change here
 * (e.g. when anchors are added — see `sanitize.ts` TODO) applies to both.
 */
export const docToSafeHtml = (doc: any): string => {
  if (!doc || isEmptyDocHelper(doc)) return '';
  let html: string;
  try {
    html = generateHTML(doc, meetingEditorExtensions);
  } catch (error) {
    return '';
  }
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: MEETING_ALLOWED_TAGS,
    ALLOWED_ATTR: MEETING_ALLOWED_ATTR,
  });
};

/**
 * Email-bound variant: safe HTML + inline styles so Gmail/Outlook render
 * correctly without a `<style>` block (those get stripped by most clients).
 */
export const docToHtml = (doc: any): string => {
  const safe = docToSafeHtml(doc);
  if (!safe) return '';
  return applyInlineStyles(safe);
};

export const docToPlainText = (doc: any): string => plainTextFromDoc(doc);

export const isEmptyDoc = (doc: any): boolean => isEmptyDocHelper(doc);
