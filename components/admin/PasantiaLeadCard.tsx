import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  JANUARY_COHORT_ID,
  LEAD_STATUSES,
  canTransitionLead,
  type LeadStatus,
} from '../../lib/pasantias/leads';
import { isProgramId, programById } from '../../lib/pasantias/cohort-public';
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
 *
 * PASANT-B004 adds the contact's program interests and the pure pieces of the
 * page's paged CSV export (`collectAllMatchingLeads`, `leadCsvRow`) here, for
 * the same reason: the export's completeness rules are the riskiest logic on
 * the page, and they are only cheap to test away from the page's dependencies.
 */

/** One program a contact asked about, with that interest's own consent evidence. */
export interface PasantiaLeadInterest {
  program: string;
  consent_accepted_at: string | null;
  consent_notice_version: string | null;
  created_at: string | null;
}

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
  /** Contract order. Absent on a PATCH response, which never reads interests. */
  program_interests?: PasantiaLeadInterest[];
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

/** The `program` filter value for contacts with no interest row. Mirrors the API. */
export const NO_PROGRAM_FILTER = 'sin-programa';

export type LeadProgramLabelKind = 'program' | 'historical' | 'unclassified' | 'unknown';

export interface LeadProgramLabel {
  /** Stable, DOM-safe key; never the raw stored value. */
  key: string;
  label: string;
  kind: LeadProgramLabelKind;
}

/**
 * What every surface (table, mobile list, card, CSV) says about a contact's
 * programs. Names come from `cohort-public`, the one source of program names.
 *
 * A contact with no interest row says so in words and never borrows a program:
 * before January the form had no program question, so an October contact's
 * interest is unknown, not INSPIRA. A January contact without an interest row
 * should not exist, and is labelled unclassified rather than guessed at.
 */
export function leadProgramLabels(lead: PasantiaLead): LeadProgramLabel[] {
  const interests = lead.program_interests ?? [];

  if (interests.length > 0) {
    return interests.map((interest, index): LeadProgramLabel =>
      isProgramId(interest.program)
        ? { key: interest.program, label: programById(interest.program).name, kind: 'program' }
        : {
            key: `unknown-${index}`,
            label: `Programa no reconocido: ${interest.program}`,
            kind: 'unknown',
          }
    );
  }

  if (lead.cohort !== JANUARY_COHORT_ID) {
    return [
      {
        key: 'historical',
        label: `Histórico (cohorte ${lead.cohort}) · sin programa registrado`,
        kind: 'historical',
      },
    ];
  }

  return [{ key: 'unclassified', label: 'Sin clasificar · sin programa registrado', kind: 'unclassified' }];
}

const PROGRAM_LABEL_CLASSES: Record<LeadProgramLabelKind, string> = {
  program: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  historical: 'border-gray-200 bg-gray-50 text-gray-600',
  unclassified: 'border-amber-200 bg-amber-50 text-amber-800',
  unknown: 'border-red-200 bg-red-50 text-red-700',
};

/** The labels as chips, for the table and the mobile list. */
export function LeadProgramLabels({ lead, testId }: { lead: PasantiaLead; testId?: string }) {
  return (
    <div className="flex flex-wrap gap-1" data-testid={testId}>
      {leadProgramLabels(lead).map((entry) => (
        <span
          key={entry.key}
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${PROGRAM_LABEL_CLASSES[entry.kind]}`}
        >
          {entry.label}
        </span>
      ))}
    </div>
  );
}

/** The filters the screen shows, captured as one value so an export can hold them still. */
export interface LeadListFilters {
  status: LeadStatus | null;
  search: string;
  program: string | null;
}

/** The GET query for one page of one filter set. Shared by the screen and the export. */
export function leadsQueryString(filters: LeadListFilters, page: number, pageSize: number): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  if (filters.program) params.set('program', filters.program);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return params.toString();
}

/**
 * CSV columns, in order. Each name is BOTH the printed header and the key
 * `ReportExporter.exportToCSV` reads from the row, so `leadCsvRow` is typed
 * against this list and a header without a value cannot compile.
 */
export const LEAD_CSV_HEADERS = [
  'Fecha',
  'Nombre',
  'Email',
  'WhatsApp',
  'Institución',
  'Cargo',
  'Participantes',
  'Cohorte',
  'Programas',
  'Estado',
  'Programa enviado',
  'Mensaje',
  'UTM source',
  'UTM medium',
  'UTM campaign',
  'Ruta de origen',
  'Versión aviso consentimiento',
  'Notas',
] as const;

export type LeadCsvRow = Record<(typeof LEAD_CSV_HEADERS)[number], string>;

/**
 * Text bound for a CSV cell. A bare CR is a row break to most spreadsheet
 * readers, but `csvEscape` quotes only on `,` `"` `\n` — so a lone CR would end
 * the row mid-cell. Normalizing line endings to `\n` here lets the shared
 * exporter's own quoting (and its formula neutralization) do the rest.
 */
function csvText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n?/g, '\n');
}

export function leadCsvRow(lead: PasantiaLead): LeadCsvRow {
  return {
    Fecha: formatDateTime(lead.created_at),
    Nombre: csvText(leadFullName(lead)),
    Email: csvText(lead.email),
    WhatsApp: csvText(lead.phone),
    Institución: csvText(lead.institution),
    Cargo: csvText(lead.role_title),
    Participantes: csvText(lead.num_people),
    Cohorte: csvText(lead.cohort),
    Programas: csvText(
      leadProgramLabels(lead)
        .map((entry) => entry.label)
        .join('; ')
    ),
    Estado: isKnownLeadStatus(lead.status) ? LEAD_STATUS_LABELS[lead.status] : csvText(lead.status),
    // "Programa enviado", never the ficha: `brochure_sent_at` is stamped by the
    // auto-reply that mails the PRICED programme; the ficha is the price-free
    // public download and is never emailed (D-02).
    'Programa enviado': formatDateTime(lead.brochure_sent_at),
    Mensaje: csvText(lead.message),
    'UTM source': csvText(lead.utm_source),
    'UTM medium': csvText(lead.utm_medium),
    'UTM campaign': csvText(lead.utm_campaign),
    'Ruta de origen': csvText(lead.source_path),
    'Versión aviso consentimiento': csvText(lead.consent_notice_version),
    Notas: csvText(lead.notes),
  };
}

/** One page as `GET /api/admin/pasantia-leads` answers it. */
export interface LeadPagePayload {
  leads: PasantiaLead[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  watermark: string | null;
}

/** The export walks pages of the API's maximum size (`LEADS_MAX_PAGE_SIZE`). */
export const LEAD_EXPORT_PAGE_SIZE = 500;

/** 100 000 contacts. Past this the export refuses instead of running unbounded. */
export const LEAD_EXPORT_MAX_PAGES = 200;

export const LEAD_EXPORT_MESSAGES = {
  changed:
    'Los leads cambiaron mientras se exportaban. No se descargó ningún archivo; vuelve a intentarlo.',
  incomplete:
    'La exportación quedó incompleta o inconsistente. No se descargó ningún archivo; vuelve a intentarlo.',
  tooLarge: 'Hay demasiados leads para exportar de una vez. Aplica un filtro y vuelve a intentarlo.',
} as const;

/** A refusal to hand over a partial or inconsistent CSV. Its message is the es-CL reason. */
export class LeadExportError extends Error {}

/**
 * Microseconds since the epoch for a PostgREST `timestamptz`. `Date.parse`
 * keeps only milliseconds, and contacts inserted together differ below that,
 * so the fraction is read separately. `null` for anything unrecognized.
 */
export function timestampMicros(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(
    value
  );
  if (!match) return null;
  const offset =
    match[3] === 'Z'
      ? 'Z'
      : match[3].length === 3
        ? `${match[3]}:00`
        : `${match[3].slice(0, 3)}:${match[3].slice(-2)}`;
  const millis = Date.parse(`${match[1].replace(' ', 'T')}${offset}`);
  if (Number.isNaN(millis)) return null;
  const fraction = Number((match[2] ?? '').padEnd(6, '0').slice(0, 6));
  return millis * 1000 + fraction;
}

/** Whether `a` comes strictly before `b` in the API's order: newest first, then id descending. */
function precedesInListOrder(a: PasantiaLead, b: PasantiaLead): boolean {
  const aTime = timestampMicros(a.created_at);
  const bTime = timestampMicros(b.created_at);
  if (aTime === null || bTime === null) return false;
  if (aTime !== bTime) return aTime > bTime;
  return a.id > b.id;
}

/**
 * Every contact matching ONE filter set, or a `LeadExportError` — never a
 * partial list.
 *
 * `fetchPage` must close over a filter set captured once, before the first
 * call; it must throw on any non-OK response (an expired session included).
 * The first page fixes the total and the watermark. Every later page must
 * repeat both exactly, be full (or, on the last page, hold exactly the
 * remainder), carry no id seen before and continue the newest-first order. The
 * total walked must equal the total announced. Any departure means the table
 * moved or a page went missing, and the export stops rather than guess.
 *
 * Nothing is checked after the last page here: the route answers a page only if
 * its watermark read before that page's data equals the one read after it
 * (409 otherwise, which `fetchPage` turns into a throw). That is what covers a
 * write landing inside the LAST page's read. It is detection over `updated_at`,
 * not a snapshot of the table.
 */
export async function collectAllMatchingLeads(
  fetchPage: (page: number, pageSize: number) => Promise<LeadPagePayload>,
  pageSize: number = LEAD_EXPORT_PAGE_SIZE
): Promise<PasantiaLead[]> {
  const first = await fetchPage(1, pageSize);
  const total = first?.pagination?.total;
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0) {
    throw new LeadExportError(LEAD_EXPORT_MESSAGES.incomplete);
  }

  const pageCount = Math.ceil(total / pageSize);
  if (pageCount > LEAD_EXPORT_MAX_PAGES) {
    throw new LeadExportError(LEAD_EXPORT_MESSAGES.tooLarge);
  }

  const watermark = first.watermark;
  const collected: PasantiaLead[] = [];
  const seen = new Set<string>();

  const accept = (payload: LeadPagePayload, page: number) => {
    const meta = payload?.pagination;
    if (
      !meta ||
      meta.page !== page ||
      meta.pageSize !== pageSize ||
      meta.total !== total ||
      payload.watermark !== watermark
    ) {
      throw new LeadExportError(LEAD_EXPORT_MESSAGES.changed);
    }

    const leads = Array.isArray(payload.leads) ? payload.leads : [];
    const expectedRows = page < pageCount ? pageSize : total - pageSize * (pageCount - 1);
    if (leads.length !== expectedRows) {
      throw new LeadExportError(LEAD_EXPORT_MESSAGES.incomplete);
    }

    for (const lead of leads) {
      if (!lead || typeof lead.id !== 'string' || seen.has(lead.id)) {
        throw new LeadExportError(LEAD_EXPORT_MESSAGES.changed);
      }
      const previous = collected[collected.length - 1];
      if (previous && !precedesInListOrder(previous, lead)) {
        throw new LeadExportError(LEAD_EXPORT_MESSAGES.changed);
      }
      seen.add(lead.id);
      collected.push(lead);
    }
  };

  if (pageCount === 0) {
    // An empty result is a valid export (headers only), but only if the page
    // agrees that it is empty.
    if (!Array.isArray(first.leads) || first.leads.length !== 0) {
      throw new LeadExportError(LEAD_EXPORT_MESSAGES.incomplete);
    }
    return [];
  }

  accept(first, 1);
  for (let page = 2; page <= pageCount; page += 1) {
    accept(await fetchPage(page, pageSize), page);
  }

  if (collected.length !== total) {
    throw new LeadExportError(LEAD_EXPORT_MESSAGES.incomplete);
  }
  return collected;
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
  const interests = lead.program_interests ?? [];
  const programLabels = leadProgramLabels(lead);

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
          Programas de interés
        </div>
        {/*
          Each interest carries its own consent: a person who asked about both
          programs accepted the notice twice, possibly in different versions.
        */}
        <ul className="mt-3 space-y-1 text-gray-800" data-testid={dom('lead-programs')}>
          {programLabels.map((entry, index) => {
            const interest = interests.length > 0 ? interests[index] : null;
            return (
              <li key={entry.key} data-testid={dom(`lead-program-${entry.key}`)}>
                <span className="font-medium">{entry.label}</span>
                {interest && (
                  <span className="text-gray-600">
                    {' · consentimiento '}
                    {interest.consent_accepted_at
                      ? formatDateTime(interest.consent_accepted_at)
                      : '—'}
                    {` · versión ${interest.consent_notice_version ?? '—'}`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {interests.length === 0 && (
          <p className="mt-1 text-xs text-gray-500">
            Este contacto no tiene un interés por programa registrado; no se le asigna ninguno.
          </p>
        )}
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
