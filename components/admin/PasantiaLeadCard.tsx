import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  LEAD_STATUSES,
  canTransitionLead,
  type LeadStatus,
} from '../../lib/pasantias/leads';
import { formatDateTime } from '../../lib/signups';

/**
 * The expanded detail surface for one Pasantías lead, extracted from the page
 * for the same reason `TractorSignupCard` was: it can be rendered in jsdom
 * without MainLayout, next/router, the Supabase auth helpers or react-hot-toast,
 * which is what makes the hostile-value and transition-graph assertions cheap.
 *
 * Two things this component must never do, both of them A8 acceptance criteria:
 *
 * 1. `source_path` is browser-reported and stored byte-identical.
 *    `sanitizeSourcePath` only guarantees a single leading `/` and the absence
 *    of whitespace and control characters — it guarantees nothing about the
 *    rest, and a future importer is not obliged to call it at all. So the value
 *    is rendered as TEXT and is never linkified. Nothing in this file emits an
 *    anchor.
 * 2. `source_path` and the `utm_*` columns are not independent evidence. The
 *    public form posts `pathname + search`, so a visit to
 *    `/pasantias?utm_source=x` stores the same attribution twice. When that has
 *    happened the card says so rather than letting it read as corroboration.
 */

/** The row shape `GET /api/admin/pasantia-leads` returns. */
export interface PasantiaLead {
  id: string;
  cohort: string;
  first_name: string;
  last_name: string;
  email: string;
  institution: string;
  phone: string | null;
  role_title: string | null;
  num_people: number | null;
  message: string | null;
  notes: string | null;
  status: string;
  source_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  consent_accepted_at: string | null;
  consent_notice_version: string | null;
  marketing_opt_in: boolean;
  marketing_opt_in_at: string | null;
  brochure_sent_at: string | null;
  created_at: string;
  updated_at: string | null;
}

/** es-CL labels for the four statuses. The graph itself stays in `lib/pasantias/leads`. */
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  converted: 'Convertido',
  dismissed: 'Descartado',
};

const STATUS_BADGE_CLASSES: Record<LeadStatus, string> = {
  new: 'border-amber-200 bg-amber-50 text-amber-800',
  contacted: 'border-sky-200 bg-sky-50 text-sky-700',
  converted: 'border-green-200 bg-green-50 text-green-700',
  dismissed: 'border-gray-200 bg-gray-50 text-gray-700',
};

export function isKnownLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * The statuses this lead may legally move to, derived from `canTransitionLead`.
 *
 * Derived, never re-listed: a second hand-written copy of the D-03 graph in the
 * UI is exactly the propagation defect this project has already paid for.
 */
export function allowedLeadTransitions(current: string): LeadStatus[] {
  return LEAD_STATUSES.filter((candidate) => canTransitionLead(current, candidate));
}

export function LeadStatusBadge({ status }: { status: string }) {
  const classes = isKnownLeadStatus(status)
    ? STATUS_BADGE_CLASSES[status]
    : 'border-gray-200 bg-gray-50 text-gray-700';
  const label = isKnownLeadStatus(status) ? LEAD_STATUS_LABELS[status] : status;

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${classes}`}
    >
      {label}
    </span>
  );
}

export function leadFullName(lead: PasantiaLead): string {
  return `${lead.first_name} ${lead.last_name}`.trim();
}

/**
 * Whether the stored landing path already carries this lead's UTM values —
 * i.e. whether the two fields are one observation written down twice.
 */
export function sourcePathRepeatsUtm(lead: PasantiaLead): boolean {
  const path = lead.source_path;
  if (!path) return false;

  return [lead.utm_source, lead.utm_medium, lead.utm_campaign].some(
    (value) => Boolean(value) && path.includes(value as string)
  );
}

function Field({
  label,
  value,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  testId?: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 break-words text-gray-800" data-testid={testId}>
        {value || '—'}
      </div>
    </div>
  );
}

export interface PasantiaLeadCardProps {
  lead: PasantiaLead;
  busy?: boolean;
  onStatusChange: (lead: PasantiaLead, next: LeadStatus) => void;
  onNotesSave: (lead: PasantiaLead, notes: string) => void;
}

export function PasantiaLeadCard({
  lead,
  busy = false,
  onStatusChange,
  onNotesSave,
}: PasantiaLeadCardProps) {
  const [notes, setNotes] = useState(lead.notes ?? '');

  // The row is replaced by whatever the PATCH returned, so the draft follows it.
  useEffect(() => {
    setNotes(lead.notes ?? '');
  }, [lead.id, lead.notes]);

  const transitions = allowedLeadTransitions(lead.status);
  const repeatsUtm = sourcePathRepeatsUtm(lead);

  return (
    <div className="space-y-4 border-t border-gray-100 bg-gray-50 p-4 text-sm">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Mensaje" value={lead.message} testId={`lead-message-${lead.id}`} />
        <Field label="Cargo" value={lead.role_title} />
        <Field label="Participantes" value={lead.num_people ?? null} />
        <Field label="Cohorte" value={lead.cohort} />
        <Field
          label="Consentimiento"
          value={
            lead.consent_accepted_at
              ? `${formatDateTime(lead.consent_accepted_at)} · versión ${
                  lead.consent_notice_version ?? '—'
                }`
              : null
          }
          testId={`lead-consent-${lead.id}`}
        />
        <Field
          label="Marketing"
          value={
            lead.marketing_opt_in
              ? `Sí${lead.marketing_opt_in_at ? ` · ${formatDateTime(lead.marketing_opt_in_at)}` : ''}`
              : 'No'
          }
        />
      </div>

      <div className="border-t border-gray-200 pt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          Atribución
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="UTM source" value={lead.utm_source} testId={`lead-utm-source-${lead.id}`} />
          <Field label="UTM medium" value={lead.utm_medium} testId={`lead-utm-medium-${lead.id}`} />
          <Field
            label="UTM campaign"
            value={lead.utm_campaign}
            testId={`lead-utm-campaign-${lead.id}`}
          />
          {/*
            Text, never a link: the value is stored exactly as the browser
            reported it and nothing downstream re-checks it.
          */}
          <Field
            label="Ruta de origen"
            value={lead.source_path}
            testId={`lead-source-path-${lead.id}`}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          La ruta de origen la informa el navegador; se muestra tal cual quedó guardada y no es un
          enlace.
        </p>
        {repeatsUtm && (
          <p className="mt-1 text-xs text-gray-500" data-testid={`lead-attribution-shared-${lead.id}`}>
            Esta ruta ya incluye los mismos parámetros UTM: es una sola observación anotada dos
            veces, no dos señales de atribución distintas.
          </p>
        )}
      </div>

      <div className="grid gap-4 border-t border-gray-200 pt-4 sm:grid-cols-2">
        <div>
          <label
            className="text-xs uppercase tracking-wide text-gray-500"
            htmlFor={`lead-status-${lead.id}`}
          >
            Cambiar estado
          </label>
          {transitions.length === 0 ? (
            <div
              className="mt-1 rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-600"
              data-testid={`lead-status-final-${lead.id}`}
            >
              Estado final: no admite más cambios.
            </div>
          ) : (
            <select
              id={`lead-status-${lead.id}`}
              value=""
              disabled={busy}
              onChange={(event) => {
                const next = event.target.value;
                if (isKnownLeadStatus(next)) {
                  onStatusChange(lead, next);
                }
              }}
              data-testid={`lead-status-select-${lead.id}`}
              className="mt-1 min-h-[40px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#fbbf24]/70 disabled:opacity-50"
            >
              <option value="">Selecciona un estado</option>
              {transitions.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {LEAD_STATUS_LABELS[candidate]}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label
            className="text-xs uppercase tracking-wide text-gray-500"
            htmlFor={`lead-notes-${lead.id}`}
          >
            Notas internas
          </label>
          <textarea
            id={`lead-notes-${lead.id}`}
            value={notes}
            maxLength={2000}
            rows={3}
            disabled={busy}
            onChange={(event) => setNotes(event.target.value)}
            data-testid={`lead-notes-${lead.id}`}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#fbbf24]/70 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => onNotesSave(lead, notes)}
            disabled={busy}
            data-testid={`lead-notes-save-${lead.id}`}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            Guardar nota
          </button>
        </div>
      </div>
    </div>
  );
}
