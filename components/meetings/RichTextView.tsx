import React, { useMemo } from 'react';
import type { TipTapDoc } from '../../lib/tiptap/helpers';
import { docToSafeHtml } from '../../lib/tiptap/render';

interface RichTextViewProps {
  doc?: TipTapDoc | null;
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
  // Returns null when either (a) the doc is empty or (b) rendering throws —
  // the caller falls through to `fallbackText` below in both cases.
  // The sanitize + allowlist pipeline lives in `lib/tiptap/render.ts` so the
  // email renderer and this in-app view share one security invariant.
  const safe = useMemo(() => {
    const html = docToSafeHtml(doc);
    return html || null;
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
