import React, { useEffect, useRef } from 'react';
import { Notice } from '../ui/kit';
import type { AddCounts } from '../../lib/correos/contacts';
import { countOf, formatCount, NOUNS, type Noun } from '../../lib/correos/labels';

const ROWS: { key: keyof AddCounts; label: string; testId: string }[] = [
  { key: 'accepted', label: 'Agregadas', testId: 'aceptadas' },
  { key: 'duplicate', label: 'Repetidas o que ya estaban en esas listas', testId: 'repetidas' },
  { key: 'blocked', label: 'Bloqueadas (no se agregaron)', testId: 'bloqueadas' },
  { key: 'left', label: 'Se dieron de baja por decisión propia, no se volvieron a agregar', testId: 'bajas' },
  { key: 'invalid', label: 'Direcciones mal escritas', testId: 'invalidas' },
];

const fmt = formatCount;

/**
 * The result of bringing people in: each count, and that they add up to the total. When it appears it is
 * scrolled into view and takes the focus (it is a status region, so a screen reader reads it out): the button
 * that started the work was at the foot of the form, far below.
 */
export function AddResult({ counts, noun = NOUNS.fila }: { counts: AddCounts; noun?: Noun }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    if (typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'start' });
    element.focus({ preventScroll: true });
  }, []);
  const sum = counts.accepted + counts.duplicate + counts.blocked + counts.left + counts.invalid;
  const adds = sum === counts.total;
  return (
    <div
      ref={box}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 scroll-mt-6 focus:outline-none"
      data-testid="correos-resultado"
    >
      <Notice tone={counts.accepted > 0 ? 'success' : 'neutral'} title="Listo.">
        {counts.total === 1 ? 'Se revisó' : 'Se revisaron'} {countOf(counts.total, noun)}.{' '}
        {counts.accepted === 1 ? 'Se agregó' : 'Se agregaron'} {fmt(counts.accepted)}.
      </Notice>
      <dl className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white nuevo:border-brand_primary/[0.12]">
        {ROWS.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
            <dt className="text-gray-700">{row.label}</dt>
            <dd className="font-semibold tabular-nums text-gray-900" data-testid={`correos-resultado-${row.testId}`}>
              {fmt(counts[row.key])}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
          <dt className="font-semibold text-gray-900">Total</dt>
          <dd className="font-semibold tabular-nums text-gray-900" data-testid="correos-resultado-total">
            {fmt(counts.total)}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-gray-700" data-testid="correos-resultado-suma">
        {adds
          ? `Las cinco cifras suman ${fmt(sum)}, el total.`
          : `Las cifras suman ${fmt(sum)} y el total es ${fmt(counts.total)}: avisa al equipo técnico.`}
      </p>
    </div>
  );
}
