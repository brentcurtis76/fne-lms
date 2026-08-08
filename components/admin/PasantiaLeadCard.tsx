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
 *
 * The comparison is per key on DECODED values, never a substring scan of the
 * whole path. Substring was wrong in both directions: the `utm_*` columns store
 * the decoded value (`pasantias e2e`) while the path stores the encoded one
 * (`pasantias%20e2e`) — and `sanitizeSourcePath` refuses any stored path
 * carrying whitespace, so the decoded form can never appear there and the check
 * was structurally dead for every multi-word value. In the other direction a
 * short value (`utm_source=pasantias` against `/pasantias`) matched incidentally
 * and claimed a repeat that was not one.
 *
 * `source_path` is a path and not an absolute URL, so the params come from the
 * substring after the first `?` rather than from `new URL()`. No `?` means no
 * params, which is `false` and not a throw.
 */
export function sourcePathRepeatsUtm(lead: PasantiaLead): boolean {
  const path = lead.source_path;
  if (!path) return false;

  const queryStart = path.indexOf('?');
  if (queryStart === -1) return false;

  const params = new URLSearchParams(path.slice(queryStart + 1));

  return ([
    ['utm_source', lead.utm_source],
    ['utm_medium', lead.utm_medium],
    ['utm_campaign', lead.utm_campaign],
  ] as const).some(([key, value]) => Boolean(value) && params.get(key) === value);
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
  /**
   * Namespaces every `id` and `data-testid` this card emits. The admin page
   * mounts the card in BOTH its layouts (Tailwind hides one with CSS, it does
   * not unmount it), so each mount must pass a distinct prefix or the document
   * ends up with duplicate ids and `htmlFor` binds to the hidden one.
   */
  domPrefix?: string;
  onStatusChange: (lead: PasantiaLead, next: LeadStatus) => void;
  onNotesSave: (lead: PasantiaLead, notes: string) => void;
}

export function PasantiaLeadCard({
  lead,
  busy = false,
  domPrefix = '',
  onStatusChange,
  onNotesSave,
}: PasantiaLeadCardProps) {
  const [notes, setNotes] = useState(lead.notes ?? '');

  // The row is replaced by whatever the PATCH returned, so the draft follows it.
  useEffect(() => {
    setNotes(lead.notes ?? '');
  }, [lead.id, lead.notes]);

  const dom = (name: string) => `${domPrefix}${name}-${lead.id}`;
  const transitions = allowedLeadTransitions(lead.status);
  const repeatsUtm = sourcePathRepeatsUtm(lead);

  return (
    <div className="space-y-4 border-t border-gray-100 bg-gray-50 p-4 text-sm">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Mensaje" value={lead.message} testId={dom('lead-message')} />
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
          testId={dom('lead-consent')}
        />
        <Field
          label="Marketing"
          value={
            lead.marketing_opt_in
              ? `Sí${lead.marketing_opt_in_at ? ` · ${formatDateTime(lead.marketing_opt_in_at)}` : ''}`
              : 'No'
          }
        />
        {/*
          "Programa enviado", not the ficha: the timestamp is stamped by the
          auto-reply that mails the priced programme (`sendLeadAutoReply` →
          BROCHURE_PATH). The ficha is the price-free public download and is
          never emailed (D-02).
        */}
        <Field
          label="Programa enviado"
          value={formatDateTime(lead.brochure_sent_at)}
          testId={dom('lead-brochure-sent')}
        />
      </div>

      <div className="border-t border-gray-200 pt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          Atribución
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="UTM source" value={lead.utm_source} testId={dom('lead-utm-source')} />
          <Field label="UTM medium" value={lead.utm_medium} testId={dom('lead-utm-medium')} />
          <Field
            label="UTM campaign"
            value={lead.utm_campaign}
            testId={dom('lead-utm-campaign')}
          />
          {/*
            Text, never a link: the value is stored exactly as the browser
            reported it and nothing downstream re-checks it.
          */}
          <Field
            label="Ruta de origen"
            value={lead.source_path}
            testId={dom('lead-source-path')}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          La ruta de origen la informa el navegador; se muestra tal cual quedó guardada y no es un
          enlace.
        </p>
        {repeatsUtm && (
          <p className="mt-1 text-xs text-gray-500" data-testid={dom('lead-attribution-shared')}>
            Esta ruta ya incluye los mismos parámetros UTM: es una sola observación anotada dos
            veces, no dos señales de atribución distintas.
          </p>
        )}
      </div>

      <div className="grid gap-4 border-t border-gray-200 pt-4 sm:grid-cols-2">
        <div>
          {/*
            The caption is a <label htmlFor> only in the branch that renders the
            control it names. A terminal lead has no <select>, so a label there
            would point at an id that is not in the document and a screen reader
            would announce a control that does not exist.
          */}
          {transitions.length === 0 ? (
            <>
              <div className="text-xs uppercase tracking-wide text-gray-500">Cambiar estado</div>
              <div
                className="mt-1 rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-600"
                data-testid={dom('lead-status-final')}
              >
                Estado final: no admite más cambios.
              </div>
            </>
          ) : (
            <>
              <label
                className="text-xs uppercase tracking-wide text-gray-500"
                htmlFor={dom('lead-status')}
              >
                Cambiar estado
              </label>
              <select
                id={dom('lead-status')}
                value=""
                disabled={busy}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isKnownLeadStatus(next)) {
                    onStatusChange(lead, next);
                  }
                }}
                data-testid={dom('lead-status-select')}
                className="mt-1 min-h-[40px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#fbbf24]/70 disabled:opacity-50"
              >
                <option value="">Selecciona un estado</option>
                {transitions.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {LEAD_STATUS_LABELS[candidate]}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        <div>
          <label
            className="text-xs uppercase tracking-wide text-gray-500"
            htmlFor={dom('lead-notes')}
          >
            Notas internas
          </label>
          <textarea
            id={dom('lead-notes')}
            value={notes}
            maxLength={2000}
            rows={3}
            disabled={busy}
            onChange={(event) => setNotes(event.target.value)}
            data-testid={dom('lead-notes')}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#fbbf24]/70 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => onNotesSave(lead, notes)}
            disabled={busy}
            data-testid={dom('lead-notes-save')}
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
