import React, { useMemo } from 'react';
import { generateHTML } from '@tiptap/html';
import { meetingEditorExtensions } from '../../lib/tiptap/extensions';
import { isEmptyDoc } from '../../lib/tiptap/helpers';

interface RichTextViewProps {
  doc?: any;
  fallbackText?: string | null;
  className?: string;
  emptyText?: string;
}

const RichTextView: React.FC<RichTextViewProps> = ({
  doc,
  fallbackText,
  className = '',
  emptyText = '',
}) => {
  const html = useMemo(() => {
    if (!doc || isEmptyDoc(doc)) return null;
    try {
      return generateHTML(doc, meetingEditorExtensions);
    } catch (error) {
      console.warn('RichTextView: failed to render doc, using plaintext fallback', error);
      return null;
    }
  }, [doc]);

  if (html) {
    return (
      <div
        className={`prose prose-sm max-w-none text-gray-700 ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
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
