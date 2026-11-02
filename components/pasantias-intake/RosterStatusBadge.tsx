import React from 'react';
import {
  rosterDisplayStatus,
  type RosterStatus,
} from '../../lib/pasantias/participants/types';

/** The roster states both screens name the same way. */
export const ROSTER_STATUS_LABELS = {
  open: 'Abierta',
  submitted: 'Enviada',
  reopened: 'Reabierta tras envío',
} as const;

const CLASSES = {
  open: 'border-gray-300 bg-white text-gray-800',
  submitted: 'border-brand_primary bg-brand_primary text-white',
  reopened: 'border-brand_accent bg-brand_accent text-brand_primary',
} as const;

export default function RosterStatusBadge({
  roster,
  testId,
}: {
  roster: { status: RosterStatus; lastSubmittedAt: string | null };
  testId?: string;
}) {
  const status = rosterDisplayStatus(roster);
  return (
    <span
      data-testid={testId}
      data-status={status}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CLASSES[status]}`}
    >
      {ROSTER_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * A timestamp in Chile's civil time, so every viewer reads the same clock time
 * FNE does. Falls back to the ISO date when the runtime lacks the time zone.
 */
export function formatInstant(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Santiago',
    }).format(date);
  } catch {
    return iso.slice(0, 10);
  }
}
