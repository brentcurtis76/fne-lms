import React from 'react';
import { Button } from '../ui/kit';
import { countOf, formatCount, type Noun } from '../../lib/correos/labels';

/**
 * The page buttons under a Correos table: the kit's `Pagination` layout, with counts in the one Chilean form
 * (11.200) and the noun in singular or plural («1 persona»). Previous and next are always drawn; each is disabled
 * only at its end.
 */
export function Pager({
  page,
  pageSize,
  total,
  onPageChange,
  noun,
  'data-testid': testId,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  noun: Noun;
  'data-testid'?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  const range = from >= to ? formatCount(to) : `${formatCount(from)}–${formatCount(to)}`;
  return (
    <nav
      aria-label="Paginación"
      data-testid={testId}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-3 text-sm text-gray-700 nuevo:border-brand_primary/[0.12] nuevo:px-[14px] nuevo:py-[10px] nuevo:text-[0.8125rem] nuevo:text-gray-600"
    >
      <span aria-live="polite" data-testid={testId ? `${testId}-range` : undefined}>
        {total === 0 ? `Mostrando 0 de ${countOf(0, noun)}` : `Mostrando ${range} de ${countOf(total, noun)}`}
      </span>
      <span className="inline-flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
          data-testid={testId ? `${testId}-previous` : undefined}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={current >= pages}
          onClick={() => onPageChange(current + 1)}
          data-testid={testId ? `${testId}-next` : undefined}
        >
          Siguiente
        </Button>
      </span>
    </nav>
  );
}
