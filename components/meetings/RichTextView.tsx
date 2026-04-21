import React, { useMemo } from 'react';
import { generateHTML } from '@tiptap/html';
import DOMPurify from 'isomorphic-dompurify';
import { meetingEditorExtensions } from '../../lib/tiptap/extensions';
import { isEmptyDoc } from '../../lib/tiptap/helpers';

interface RichTextViewProps {
  doc?: any;
  fallbackText?: string | null;
  className?: string;
  emptyText?: string;
}

const ALLOWED_TAGS = ['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'u', 'br'];

const RichTextView: React.FC<RichTextViewProps> = ({
  doc,
  fallbackText,
  className = '',
  emptyText = '',
}) => {
  const safe = useMemo(() => {
    if (!doc || isEmptyDoc(doc)) return null;
    try {
      const html = generateHTML(doc, meetingEditorExtensions);
      return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ALLOWED_TAGS,
        ALLOWED_ATTR: [],
      });
    } catch (error) {
      console.warn('RichTextView: failed to render doc, using plaintext fallback', error);
      return null;
    }
  }, [doc]);

  if (safe) {
    return (
      <div
        className={`prose prose-sm max-w-none text-gray-700 ${className}`}
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    );
  }

  const text = (fallbackText ?? '').trim();
  if (!text) {
    return emptyText ? (
      <p className={`text-gray-500 italic ${className}`}>{emptyText}</p>
    ) : null;
  }

  return (
    <p className={`text-gray-700 whitespace-pre-wrap ${className}`}>{text}</p>
  );
};

export default RichTextView;
