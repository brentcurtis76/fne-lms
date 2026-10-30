import React, { useRef, useState } from 'react';
import { storedDateLabel } from '../../lib/pasantias/participants/dates';
import { displayRut } from '../../lib/pasantias/participants/rut';
import {
  FOCUS_LABELS,
  FUNDING_LABELS,
  type AdminIntakeParticipant,
  type AdminRoster,
} from '../../lib/pasantias/participants/types';
import { dietarySummary } from './ParticipantList';
import RosterStatusBadge, { formatInstant } from './RosterStatusBadge';

/**
 * F01: the roster's school-level funding as the admin reads it (read-only), or
 * "Datos del colegio pendientes" when the school has not saved it. Never a
 * guessed value.
 */
export function schoolFundingSummary(roster: Pick<AdminRoster, 'schoolFunding'>): string {
  const funding = roster.schoolFunding;
  if (!funding) return 'Datos del colegio pendientes';
  return `Pasajes: ${FUNDING_LABELS[funding.flightsFunding]} · Estadía: ${FUNDING_LABELS[funding.lodgingFunding]}`;
}

const BUTTON =
  'inline-flex min-h-[40px] items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent disabled:cursor-not-allowed disabled:opacity-50';

/** Whether the roster's link currently works, as the admin should read it. */
export function linkState(roster: Pick<AdminRoster, 'revokedAt' | 'expiresAt'>, now: number = Date.now()) {
  if (roster.revokedAt) return { key: 'revoked', label: 'Revocado' } as const;
  if (new Date(roster.expiresAt).getTime() <= now) return { key: 'expired', label: 'Vencido' } as const;
  return { key: 'active', label: `Vigente hasta ${formatInstant(roster.expiresAt)}` } as const;
}

/**
 * The link, shown ONCE after create or rotate. It lives only in the page's
 * React state: never stored, never re-fetchable — the database holds a hash.
 */
export function OneTimeLinkPanel({
  url,
  schoolName,
  rotated,
  onDismiss,
}: {
  url: string;
  schoolName: string;
  rotated: boolean;
  onDismiss: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'manual'>('idle');

  const copy = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(url);
        setCopied('copied');
        return;
      }
    } catch {
      // Fall through to manual selection.
    }
    inputRef.current?.select();
    setCopied('manual');
  };

  return (
    <section
      data-testid="intake-admin-link-panel"
      aria-labelledby="intake-admin-link-title"
      className="rounded-lg border-2 border-brand_accent bg-brand_accent/10 p-4"
    >
      <h2 id="intake-admin-link-title" className="font-mont text-lg font-bold">
        {rotated ? 'Nuevo enlace' : 'Enlace de la nómina'} · {schoolName}
      </h2>
      <p className="mt-1 text-sm font-semibold text-red-800">
        No se volverá a mostrar. Cópialo ahora y envíalo a la persona coordinadora del colegio.
        {rotated ? ' El enlace anterior ya no funciona.' : ''}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="intake-admin-link-url" className="sr-only">
          Enlace de la nómina
        </label>
        <input
          id="intake-admin-link-url"
          ref={inputRef}
          data-testid="intake-admin-link-url"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm"
        />
        <button type="button" data-testid="intake-admin-link-copy" onClick={() => void copy()} className={BUTTON}>
          {copied === 'copied' ? 'Copiado' : 'Copiar enlace'}
        </button>
        <button type="button" data-testid="intake-admin-link-dismiss" onClick={onDismiss} className={BUTTON}>
          Listo
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-700" aria-live="polite">
        {copied === 'copied'
          ? 'Enlace copiado al portapapeles.'
          : copied === 'manual'
            ? 'Selecciona el enlace y cópialo con Ctrl+C (o Cmd+C).'
            : ''}
      </p>
    </section>
  );
}

export function RosterTable({
  rosters,
  busy,
  selectedId,
  onView,
  onRotate,
  onRevoke,
}: {
  rosters: AdminRoster[];
  busy: boolean;
  selectedId: string | null;
  onView: (roster: AdminRoster) => void;
  onRotate: (roster: AdminRoster) => void;
  onRevoke: (roster: AdminRoster) => void;
}) {
  if (rosters.length === 0) {
    return (
      <p data-testid="intake-admin-empty" className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm">
        Aún no hay nóminas. Crea la primera con el formulario.
      </p>
    );
  }
  return (
    <ul className="space-y-3" data-testid="intake-admin-rosters">
      {rosters.map((roster) => {
        const link = linkState(roster);
        return (
          <li
            key={roster.id}
            data-testid={`intake-admin-roster-${roster.id}`}
            data-school={roster.schoolName}
            className={`rounded-lg border bg-white p-4 ${selectedId === roster.id ? 'border-brand_accent ring-2 ring-brand_accent/60' : 'border-gray-200'}`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="font-mont text-base font-semibold">{roster.schoolName}</p>
                <p className="text-sm text-gray-700">{roster.programName}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <RosterStatusBadge roster={roster} testId={`intake-admin-status-${roster.id}`} />
                  <span data-testid={`intake-admin-link-state-${roster.id}`} data-state={link.key} className="text-gray-700">
                    {link.label}
                  </span>
                  <span className="text-gray-700">· {roster.participantCount} personas</span>
                  {roster.lastSubmittedAt ? (
                    <span className="text-gray-700">· Último envío {formatInstant(roster.lastSubmittedAt)}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-gray-700" data-testid={`intake-admin-funding-${roster.id}`}>
                  {schoolFundingSummary(roster)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid={`intake-admin-view-${roster.id}`}
                  onClick={() => onView(roster)}
                  disabled={busy}
                  className={BUTTON}
                >
                  Ver detalle
                </button>
                <button
                  type="button"
                  data-testid={`intake-admin-rotate-${roster.id}`}
                  onClick={() => onRotate(roster)}
                  disabled={busy}
                  className={BUTTON}
                >
                  Nuevo enlace
                </button>
                <button
                  type="button"
                  data-testid={`intake-admin-revoke-${roster.id}`}
                  onClick={() => onRevoke(roster)}
                  disabled={busy || Boolean(roster.revokedAt)}
                  className={`${BUTTON} text-red-800`}
                >
                  Revocar
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function RosterDetail({
  roster,
  participants,
  onClose,
}: {
  roster: AdminRoster;
  participants: AdminIntakeParticipant[];
  onClose: () => void;
}) {
  return (
    <section
      data-testid="intake-admin-detail"
      aria-labelledby="intake-admin-detail-title"
      className="rounded-lg border border-gray-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="intake-admin-detail-title" className="font-mont text-lg font-bold">
            {roster.schoolName}
          </h2>
          <p className="text-sm text-gray-700">
            {roster.programName} · <RosterStatusBadge roster={roster} testId="intake-admin-detail-status" />
            {roster.submittedAt ? ` · Enviada ${formatInstant(roster.submittedAt)}` : ''}
          </p>
        </div>
        <button type="button" data-testid="intake-admin-detail-close" onClick={onClose} className={BUTTON}>
          Cerrar
        </button>
      </div>
      <div className="mt-3 rounded-md border border-gray-200 p-3" data-testid="intake-admin-detail-school">
        <h3 className="font-mont text-sm font-semibold">Datos del colegio</h3>
        <p className="mt-1 text-sm text-gray-700">{schoolFundingSummary(roster)}</p>
      </div>
      {participants.length === 0 ? (
        <p className="mt-3 text-sm text-gray-700" data-testid="intake-admin-detail-empty">
          El colegio aún no ha guardado personas.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm" data-testid="intake-admin-detail-table">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-3">Nombre</th>
                <th scope="col" className="py-2 pr-3">RUT</th>
                <th scope="col" className="py-2 pr-3">Pasaporte</th>
                <th scope="col" className="py-2 pr-3">Llegada</th>
                <th scope="col" className="py-2 pr-3">Regreso</th>
                <th scope="col" className="py-2 pr-3">Foco</th>
                <th scope="col" className="py-2 pr-3">Alimentación</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 align-top" data-testid={`intake-admin-participant-${p.id}`}>
                  <td className="py-2 pr-3 font-medium">
                    {p.firstNames} {p.lastNames}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3">{displayRut(p.rut)}</td>
                  <td className="py-2 pr-3">{p.passportNumber ?? '—'}</td>
                  <td className="py-2 pr-3">{storedDateLabel(roster.program, 'arrival', p.arrivalDate)}</td>
                  <td className="py-2 pr-3">{storedDateLabel(roster.program, 'departure', p.departureDate)}</td>
                  <td className="py-2 pr-3">{p.focus ? FOCUS_LABELS[p.focus] : 'Sin indicar'}</td>
                  <td className="py-2 pr-3">{dietarySummary(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
