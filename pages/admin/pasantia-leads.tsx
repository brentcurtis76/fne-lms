import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import { Briefcase, ChevronDown, ChevronRight, Download, Loader2, RefreshCw, Search } from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../components/layout/FunctionalPageHeader';
import { createServiceRoleClient } from '../../lib/api-auth';
import { ReportExporter } from '../../lib/exportUtils';
import { formatDateTime } from '../../lib/signups';
import { LEAD_STATUSES, type LeadStatus } from '../../lib/pasantias/leads';
import { isGlobalAdmin } from '../../utils/roleUtils';
import {
  LEAD_STATUS_LABELS,
  LeadStatusBadge,
  PasantiaLeadCard,
  leadFullName,
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
 */

type StatusTab = 'all' | LeadStatus;

interface LeadCounts {
  new: number;
  contacted: number;
  converted: number;
  dismissed: number;
  total: number;
}

const EMPTY_COUNTS: LeadCounts = { new: 0, contacted: 0, converted: 0, dismissed: 0, total: 0 };

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const supabase = createPagesServerClient(ctx);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  const service = createServiceRoleClient();
  const isAdmin = await isGlobalAdmin(service, session.user.id);
  if (!isAdmin) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }

  return { props: {} };
};

export default function PasantiaLeadsAdminPage() {
  const [leads, setLeads] = useState<PasantiaLead[]>([]);
  const [counts, setCounts] = useState<LeadCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  // Debounced copy of `search`: the filter runs server-side, so a keystroke
  // must not be a request.
  const [appliedSearch, setAppliedSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusTab !== 'all') params.set('status', statusTab);
      if (appliedSearch) params.set('search', appliedSearch);
      const query = params.toString();

      const response = await fetch(`/api/admin/pasantia-leads${query ? `?${query}` : ''}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || 'Error al cargar los leads');
      }
      setLeads(json.leads ?? []);
      setCounts({ ...EMPTY_COUNTS, ...(json.counts ?? {}) });
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Error al cargar los leads';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [statusTab, appliedSearch]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

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
        await fetchLeads();
      } catch (patchError) {
        toast.error(
          patchError instanceof Error ? patchError.message : 'No se pudo guardar el cambio'
        );
      } finally {
        setSaving(false);
      }
    },
    [fetchLeads]
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

  const exportRows = useMemo(
    () =>
      leads.map((lead) => ({
        Fecha: formatDateTime(lead.created_at),
        Nombre: leadFullName(lead),
        Email: lead.email,
        WhatsApp: lead.phone ?? '',
        Institución: lead.institution,
        Cargo: lead.role_title ?? '',
        Participantes: lead.num_people ?? '',
        Estado: LEAD_STATUS_LABELS[lead.status as LeadStatus] ?? lead.status,
        'Ficha enviada': formatDateTime(lead.brochure_sent_at),
        Mensaje: lead.message ?? '',
        'UTM source': lead.utm_source ?? '',
        'UTM medium': lead.utm_medium ?? '',
        'UTM campaign': lead.utm_campaign ?? '',
        'Ruta de origen': lead.source_path ?? '',
        'Versión aviso consentimiento': lead.consent_notice_version ?? '',
        Notas: lead.notes ?? '',
      })),
    [leads]
  );

  /**
   * CSV goes through `ReportExporter.exportToCSV`, never a hand-rolled
   * `join(',')`: `institution`, `message`, `source_path` and the three `utm_*`
   * are visitor-typed, and `csvEscape` → `neutralizeSpreadsheetFormula` is what
   * keeps `=cmd|…` out of the admin's spreadsheet. `headers` doubles as the key
   * path into each row, which is why the row keys ARE the es-CL labels.
   */
  const handleExport = () => {
    const headers = Object.keys(exportRows[0] ?? EMPTY_EXPORT_ROW);

    ReportExporter.exportToCSV({
      filename: `pasantias-leads-${leads[0]?.cohort ?? 'cohorte'}`,
      title: 'Leads Pasantías INSPIRA',
      headers,
      data: exportRows,
      metadata: { totalRecords: exportRows.length },
    });
  };

  const tabs: { key: StatusTab; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: counts.total },
    ...LEAD_STATUSES.map((status) => ({
      key: status as StatusTab,
      label: LEAD_STATUS_LABELS[status],
      count: counts[status],
    })),
  ];

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
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleExport}
              data-testid="pasantia-leads-export-csv"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50"
              title="Exportar CSV"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
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
                onClick={() => setStatusTab(tab.key)}
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

          <div className="relative max-w-md">
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

          {error && (
            <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center border border-gray-200 bg-white">
              <div className="flex items-center gap-3 text-gray-600">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Cargando leads
              </div>
            </div>
          ) : leads.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 border border-dashed border-gray-300 bg-white px-4 text-center">
              <Briefcase className="h-6 w-6 text-gray-400" aria-hidden="true" />
              <p className="text-sm text-gray-600">No hay leads que coincidan con los filtros.</p>
            </div>
          ) : (
            <>
              {/* Desktop: one row per lead, expandable in place. */}
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
                        'Cargo',
                        'Personas',
                        'Estado',
                        'Ficha enviada',
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
                            <td colSpan={10} className="p-0">
                              <PasantiaLeadCard
                                lead={lead}
                                busy={saving}
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
                        onStatusChange={handleStatusChange}
                        onNotesSave={handleNotesSave}
                      />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

/** Column set for an empty export, so the CSV still carries its headers. */
const EMPTY_EXPORT_ROW = {
  Fecha: '',
  Nombre: '',
  Email: '',
  WhatsApp: '',
  Institución: '',
  Cargo: '',
  Participantes: '',
  Estado: '',
  'Ficha enviada': '',
  Mensaje: '',
  'UTM source': '',
  'UTM medium': '',
  'UTM campaign': '',
  'Ruta de origen': '',
  'Versión aviso consentimiento': '',
  Notas: '',
};
