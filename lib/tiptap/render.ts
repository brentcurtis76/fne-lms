import { generateHTML } from '@tiptap/html';
import DOMPurify from 'isomorphic-dompurify';
import { meetingEditorExtensions } from './extensions';
import { isEmptyDoc as isEmptyDocHelper, plainTextFromDoc } from './helpers';

const ALLOWED_TAGS = ['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'u', 'br'];

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
    .replace(/<(h2|h3|p|ul|ol|li|strong|em|u)(\s[^>]*)?>/gi, (_match, tag, attrs = '') => {
      const cleaned = (attrs || '').replace(/\sclass\s*=\s*"[^"]*"/gi, '').replace(/\sclass\s*=\s*'[^']*'/gi, '');
      const existingStyleMatch = /\sstyle\s*=\s*"([^"]*)"/i.exec(cleaned);
      const inline = INLINE_STYLES[tag.toLowerCase()];
      if (!inline) return `<${tag}${cleaned}>`;
      if (existingStyleMatch) {
        const merged = `${inline} ${existingStyleMatch[1]}`;
        const newAttrs = cleaned.replace(existingStyleMatch[0], ` style="${merged}"`);
        return `<${tag}${newAttrs}>`;
      }
      return `<${tag}${cleaned} style="${inline}">`;
    });
};

export const docToHtml = (doc: any): string => {
  if (!doc || isEmptyDocHelper(doc)) return '';
  let html: string;
  try {
    html = generateHTML(doc, meetingEditorExtensions);
  } catch (error) {
    return '';
  }
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS,
    ALLOWED_ATTR: [],
  });
  return applyInlineStyles(sanitized);
};

export const docToPlainText = (doc: any): string => plainTextFromDoc(doc);

export const isEmptyDoc = (doc: any): boolean => isEmptyDocHelper(doc);
