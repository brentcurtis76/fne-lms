import React from 'react';

/**
 * An address that may wrap only at sensible points: before each `.` and `@` (a `<wbr>` there), never in the
 * middle of a word. A part longer than its cell still breaks rather than hiding behind the edge.
 */
export function AddressText({ address, className }: { address: string; className?: string }) {
  const parts = address.split(/(?=[.@])/);
  return (
    <span className={['whitespace-normal [overflow-wrap:break-word]', className].filter(Boolean).join(' ')}>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <wbr /> : null}
          {part}
        </React.Fragment>
      ))}
    </span>
  );
}
