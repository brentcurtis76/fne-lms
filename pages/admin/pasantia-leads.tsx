import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { toast } from 'react-hot-toast';
import {
  Briefcase,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../components/layout/FunctionalPageHeader';
import { createServiceRoleClient, getServerSideUser } from '../../lib/api-auth';
import { ReportExporter } from '../../lib/exportUtils';
import { formatDateTime } from '../../lib/signups';
import { LEAD_STATUSES, type LeadStatus } from '../../lib/pasantias/leads';
import { PROGRAM_IDS, programById } from '../../lib/pasantias/cohort-public';
import { isGlobalAdmin } from '../../utils/roleUtils';
import {
  LEAD_CSV_HEADERS,
  LEAD_EXPORT_MESSAGES,
  LEAD_EXPORT_TOO_LARGE_CODE,
  LEAD_STATUS_LABELS,
  LeadExportError,
  LeadProgramLabels,
  LeadStatusBadge,
  NO_PROGRAM_FILTER,
  PasantiaLeadCard,
  collectLeadExportSnapshot,
  leadCsvRow,
  leadExportQueryString,
  leadFullName,
  leadsQueryString,
  type LeadExportSnapshotPayload,
  type LeadListFilters,
  type PasantiaLead,
} from '../../components/admin/PasantiaLeadCard';

/**
 * A8 — admin triage for Pasantías INSPIRA interest leads.
 *
 * Read/triage only: `pasantias_leads` grants no authenticated write (D-04), so
 * every mutation on this page goes through `PATCH /api/admin/pasantia-leads`,
 * which is where D-03's transition graph is enforced. The page never decides
 * whether a move is legal — it only offers the moves `canTransitionLead` allows
 * (derived in `allowedLeadTransitions`) and reports what the API answers.
 *
 * PASANT-B004 (C009): the list is paged by contact, the tab counts and the
 * matching total are exact database counts, every contact shows all of its
 * program interests, and the CSV contains every contact matching the filters —
 * not the page on screen — or nothing at all.
 */

type StatusTab = 'all' | LeadStatus;

interface LeadCounts {
  new: number;
  contacted: number;
  converted: number;
  dismissed: number;
  total: number;
}

interface LeadPagination {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

const EMPTY_COUNTS: LeadCounts = { new: 0, contacted: 0, converted: 0, dismissed: 0, total: 0 };

/** The API's default page size (`LEADS_DEFAULT_PAGE_SIZE`). */
const PAGE_SIZE = 50;

const PAGER_BUTTON_CLASSES =
  'inline-flex min-h-[40px] items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fbbf24]/70 disabled:cursor-not-allowed disabled:opacity-50';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  // The verified user (auth server), never the cookie's stored `user` (SM-B015).
  const user = await getServerSideUser(ctx);
  if (!user) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  const service = createServiceRoleClient();
  const isAdmin = await isGlobalAdmin(service, user.id);
  if (!isAdmin) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }

  return { props: {} };
};

export default function PasantiaLeadsAdminPage() {
  const [leads, setLeads] = useState<PasantiaLead[]>([]);
  const [counts, setCounts] = useState<LeadCounts>(EMPTY_COUNTS);
  const [pagination, setPagination] = useState<LeadPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [programFilter, setProgramFilter] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  // Debounced copy of `search`: the filter runs server-side, so a keystroke
  // must not be a request.
  const [appliedSearch, setAppliedSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Only the newest request may write the screen: a slow answer for the
  // previous filter must not overwrite the counts of the current one.
  const latestRequest = useRef(0);

  // Bumped by a successful save; the fetch effect below depends on it. The
  // refresh after a save is therefore built from the filters and page on screen
  // when the save ENDS. Calling the `fetchLeads` captured when the save BEGAN
  // would send the old context's request after the new one, and the
  // newest-request guard above would then let it win.
  const [reloadToken, setReloadToken] = useState(0);

  // Only a changed search resets the page. On mount (and after an edit that trims
  // back to the applied value) there is nothing to apply, so a pager click made
  // in the first 300 ms is not undone by a timer the admin never asked for.
  useEffect(() => {
    const next = search.trim();
    if (next === appliedSearch) return;
    const timer = setTimeout(() => {
      setAppliedSearch(next);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, appliedSearch]);

  const filters = useMemo<LeadListFilters>(
    () => ({
      status: statusTab === 'all' ? null : statusTab,
      search: appliedSearch,
      program: programFilter || null,
    }),
    [statusTab, appliedSearch, programFilter]
  );

  const fetchLeads = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/pasantia-leads?${leadsQueryString(filters, page, PAGE_SIZE)}`
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || 'Error al cargar los leads');
      }
      if (requestId !== latestRequest.current) return;

      const meta: LeadPagination | null = json.pagination ?? null;
      const lastPage = Math.max(1, meta?.pageCount ?? 1);
      if (page > lastPage) {
        // The filter set shrank under this page (or the link was stale): step
        // back to the last page that exists instead of showing an empty one.
        setPage(lastPage);
        return;
      }

      setLeads(json.leads ?? []);
      setCounts({ ...EMPTY_COUNTS, ...(json.counts ?? {}) });
      setPagination(meta);
    } catch (fetchError) {
      if (requestId !== latestRequest.current) return;
      const message = fetchError instanceof Error ? fetchError.message : 'Error al cargar los leads';
      setError(message);
      toast.error(message);
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
      }
    }
  }, [filters, page]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads, reloadToken]);

  const patchLead = useCallback(
    async (lead: PasantiaLead, patch: { status?: LeadStatus; notes?: string }) => {
      setSaving(true);
      try {
        const response = await fetch('/api/admin/pasantia-leads', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: lead.id, ...patch }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          // A denied transition answers with the moves that were legal.
          const allowed: string[] = Array.isArray(json.allowed) ? json.allowed : [];
          const suffix = allowed.length
            ? ` Estados permitidos: ${allowed
                .map((value) => LEAD_STATUS_LABELS[value as LeadStatus] ?? value)
                .join(', ')}.`
            : '';
          throw new Error(`${json.error || 'No se pudo guardar el cambio'}${suffix}`);
        }
        toast.success(patch.status ? 'Estado actualizado' : 'Nota guardada');
        setReloadToken((token) => token + 1);
      } catch (patchError) {
        toast.error(
          patchError instanceof Error ? patchError.message : 'No se pudo guardar el cambio'
        );
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const handleStatusChange = useCallback(
    (lead: PasantiaLead, next: LeadStatus) => {
      patchLead(lead, { status: next });
    },
    [patchLead]
  );

  const handleNotesSave = useCallback(
    (lead: PasantiaLead, notes: string) => {
      patchLead(lead, { notes });
    },
    [patchLead]
  );

  /**
   * CSV goes through `ReportExporter.exportToCSV`, never a hand-rolled
   * `join(',')`: `institution`, `message`, `source_path` and the three `utm_*`
   * are visitor-typed, and `csvEscape` → `neutralizeSpreadsheetFormula` is what
   * keeps `=cmd|…` out of the admin's spreadsheet.
   *
   * The CSV holds every contact matching the filters on screen, not the page on
   * screen, from ONE request answered from one database snapshot (C009). The
   * filter set is captured before that request, so changing a tab mid-export
   * cannot change what is exported. `collectLeadExportSnapshot` refuses
   * anything partial or inconsistent; the download happens only after the
   * whole answer has been checked.
   */
  const handleExport = async () => {
    if (exporting) return;
    const exportFilters: LeadListFilters = { ...filters };

    setExporting(true);
    setExportError(null);
    try {
      const contacts = await collectLeadExportSnapshot(async () => {
        const response = await fetch(
          `/api/admin/pasantia-leads?${leadExportQueryString(exportFilters)}`
        );
        if (!response.ok) {
          // An expired session, a held account, a refusal past the ceiling and
          // a server failure all land here: no file.
          const json = await response.json().catch(() => ({}));
          if (response.status === 413 && json.code === LEAD_EXPORT_TOO_LARGE_CODE) {
            throw new LeadExportError(LEAD_EXPORT_MESSAGES.tooLarge);
          }
          const reason = String(json.error || 'No se pudo leer la exportación de leads');
          throw new LeadExportError(`${reason.replace(/\.$/, '')}. No se descargó ningún archivo.`);
        }
        // A body cut short (a dropped connection, a stream the server ended
        // early) does not parse: that is an incomplete export, never a partial one.
        const json = await response.json().catch(() => {
          throw new LeadExportError(LEAD_EXPORT_MESSAGES.incomplete);
        });
        return json as LeadExportSnapshotPayload;
      });

      ReportExporter.exportToCSV({
        filename: `pasantias-leads-${new Date().toISOString().slice(0, 10)}`,
        title: 'Leads Pasantías INSPIRA',
        headers: [...LEAD_CSV_HEADERS],
        data: contacts.map(leadCsvRow),
        metadata: { totalRecords: contacts.length },
      });
      toast.success(`CSV exportado: ${contacts.length} contactos`);
    } catch (exportFailure) {
      const message =
        exportFailure instanceof LeadExportError
          ? exportFailure.message
          : 'No se pudo exportar el CSV. No se descargó ningún archivo; vuelve a intentarlo.';
      setExportError(message);
      toast.error(message);
    } finally {
      setExporting(false);
    }
  };

  const tabs: { key: StatusTab; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: counts.total },
    ...LEAD_STATUSES.map((status) => ({
      key: status as StatusTab,
      label: LEAD_STATUS_LABELS[status],
      count: counts[status],
    })),
  ];

  const pageCount = Math.max(1, pagination?.pageCount ?? 1);
  const firstShown = pagination && pagination.total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastShown = pagination ? Math.min(page * PAGE_SIZE, pagination.total) : 0;

  return (
    <MainLayout currentPage="pasantia-leads" pageTitle="Pasantías">
      <div className="min-h-screen bg-gray-50">
        <ResponsiveFunctionalPageHeader
          icon={<Briefcase className="h-6 w-6" />}
          title="Leads de Pasantías"
          subtitle="Interesados en las Pasantías INSPIRA Barcelona"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLeads}
              disabled={loading}
              data-testid="pasantia-leads-refresh"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              title="Actualizar"
              aria-label="Actualizar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              aria-busy={exporting}
              data-testid="pasantia-leads-export-csv"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              title="Exportar CSV de todos los contactos filtrados"
              aria-label="Exportar CSV de todos los contactos filtrados"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </ResponsiveFunctionalPageHeader>

        <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Estado del lead">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={statusTab === tab.key}
                onClick={() => {
                  setStatusTab(tab.key);
                  setPage(1);
                }}
                data-testid={`pasantia-leads-tab-${tab.key}`}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
                  statusTab === tab.key
                    ? 'border-[#0a0a0a] bg-[#0a0a0a] text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.label}
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    statusTab === tab.key ? 'bg-white/20' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                aria-hidden="true"
              />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nombre, correo o institución"
                aria-label="Buscar leads"
                data-testid="pasantia-leads-search"
                className="min-h-[40px] w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#fbbf24]/70"
              />
            </div>
            <select
              value={programFilter}
              onChange={(event) => {
                setProgramFilter(event.target.value);
                setPage(1);
              }}
              aria-label="Filtrar por programa"
              data-testid="pasantia-leads-program-filter"
              className="min-h-[40px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#fbbf24]/70 sm:w-auto"
            >
              <option value="">Todos los programas</option>
              {PROGRAM_IDS.map((programId) => (
                <option key={programId} value={programId}>
                  {programById(programId).name}
                </option>
              ))}
              <option value={NO_PROGRAM_FILTER}>Sin programa (histórico o sin clasificar)</option>
            </select>
          </div>

          {error && (
            <div
              role="alert"
              data-testid="pasantia-leads-error"
              className="flex flex-wrap items-center justify-between gap-3 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={fetchLeads}
                disabled={loading}
                data-testid="pasantia-leads-retry"
                className={PAGER_BUTTON_CLASSES}
              >
                Reintentar
              </button>
            </div>
          )}

          {exportError && (
            <div
              role="alert"
              data-testid="pasantia-leads-export-error"
              className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {exportError}
            </div>
          )}

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center border border-gray-200 bg-white">
              <div className="flex items-center gap-3 text-gray-600">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Cargando leads
              </div>
            </div>
          ) : error ? null : leads.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 border border-dashed border-gray-300 bg-white px-4 text-center">
              <Briefcase className="h-6 w-6 text-gray-400" aria-hidden="true" />
              <p className="text-sm text-gray-600">No hay leads que coincidan con los filtros.</p>
            </div>
          ) : (
            <>
              {/* Desktop: one row per contact, expandable in place. */}
              <div className="hidden overflow-x-auto border border-gray-200 bg-white shadow-sm md:block">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {[
                        'Fecha',
                        'Nombre',
                        'Correo',
                        'WhatsApp',
                        'Institución',
                        'Programas',
                        'Cargo',
                        'Personas',
                        'Estado',
                        'Programa enviado',
                        '',
                      ].map((label, index) => (
                        <th
                          key={label || `col-${index}`}
                          scope="col"
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {leads.map((lead) => (
                      <React.Fragment key={lead.id}>
                        <tr className="align-top">
                          <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                            {formatDateTime(lead.created_at)}
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {leadFullName(lead)}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{lead.email}</td>
                          <td className="px-3 py-2 text-gray-700">{lead.phone || '—'}</td>
                          <td className="px-3 py-2 text-gray-700">{lead.institution}</td>
                          <td className="px-3 py-2">
                            <LeadProgramLabels
                              lead={lead}
                              testId={`pasantia-lead-programs-${lead.id}`}
                            />
                          </td>
                          <td className="px-3 py-2 text-gray-700">{lead.role_title || '—'}</td>
                          <td className="px-3 py-2 text-gray-700">{lead.num_people ?? '—'}</td>
                          <td className="px-3 py-2">
                            <LeadStatusBadge status={lead.status} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                            {formatDateTime(lead.brochure_sent_at) || '—'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId((current) => (current === lead.id ? null : lead.id))
                              }
                              data-testid={`pasantia-lead-toggle-${lead.id}`}
                              aria-expanded={expandedId === lead.id}
                              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
                            >
                              {expandedId === lead.id ? (
                                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                              ) : (
                                <ChevronRight className="h-4 w-4" aria-hidden="true" />
                              )}
                              Detalle
                            </button>
                          </td>
                        </tr>
                        {expandedId === lead.id && (
                          <tr>
                            <td colSpan={11} className="p-0">
                              {/*
                                Both layouts stay mounted (Tailwind only hides
                                one with CSS), so each mount namespaces its ids
                                and testids or `htmlFor` binds to the hidden
                                desktop control.
                              */}
                              <PasantiaLeadCard
                                lead={lead}
                                busy={saving}
                                domPrefix="desktop-"
                                onStatusChange={handleStatusChange}
                                onNotesSave={handleNotesSave}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: no side-scrolling table on older school hardware. */}
              <div className="space-y-3 md:hidden">
                {leads.map((lead) => (
                  <div key={lead.id} className="border border-gray-200 bg-white shadow-sm">
                    <div className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-900">
                            {leadFullName(lead)}
                          </div>
                          <div className="truncate text-xs text-gray-500">{lead.email}</div>
                        </div>
                        <LeadStatusBadge status={lead.status} />
                      </div>
                      <div className="text-sm text-gray-700">{lead.institution}</div>
                      <LeadProgramLabels
                        lead={lead}
                        testId={`pasantia-lead-programs-mobile-${lead.id}`}
                      />
                      <div className="text-xs text-gray-500">
                        {formatDateTime(lead.created_at)}
                        {lead.phone ? ` · ${lead.phone}` : ''}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId((current) => (current === lead.id ? null : lead.id))
                        }
                        data-testid={`pasantia-lead-toggle-mobile-${lead.id}`}
                        aria-expanded={expandedId === lead.id}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
                      >
                        {expandedId === lead.id ? (
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        )}
                        Detalle
                      </button>
                    </div>
                    {expandedId === lead.id && (
                      <PasantiaLeadCard
                        lead={lead}
                        busy={saving}
                        domPrefix="mobile-"
                        onStatusChange={handleStatusChange}
                        onNotesSave={handleNotesSave}
                      />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {pagination && pagination.total > 0 && !error && (
            <nav
              aria-label="Paginación de leads"
              data-testid="pasantia-leads-pagination"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-sm text-gray-600" data-testid="pasantia-leads-range" aria-live="polite">
                {`Mostrando ${firstShown}–${lastShown} de ${pagination.total} ${
                  pagination.total === 1 ? 'contacto' : 'contactos'
                } · Página ${page} de ${pageCount}`}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPage(1)}
                  disabled={loading || page <= 1}
                  data-testid="pasantia-leads-page-first"
                  className={PAGER_BUTTON_CLASSES}
                >
                  Primera
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={loading || page <= 1}
                  data-testid="pasantia-leads-page-prev"
                  className={PAGER_BUTTON_CLASSES}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  disabled={loading || page >= pageCount}
                  data-testid="pasantia-leads-page-next"
                  className={PAGER_BUTTON_CLASSES}
                >
                  Siguiente
                </button>
                <button
                  type="button"
                  onClick={() => setPage(pageCount)}
                  disabled={loading || page >= pageCount}
                  data-testid="pasantia-leads-page-last"
                  className={PAGER_BUTTON_CLASSES}
                >
                  Última
                </button>
              </div>
            </nav>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
