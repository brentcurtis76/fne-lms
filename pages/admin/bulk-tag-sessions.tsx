import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import MainLayout from '../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../components/layout/FunctionalPageHeader';
import { getUserPrimaryRole } from '../../utils/roleUtils';
import { Tag, Filter, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { getStatusBadge } from '../../lib/utils/session-ui-helpers';
import type { SessionStatus } from '../../lib/types/consultor-sessions.types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ============================================================
// Types
// ============================================================

interface HourType {
  id: string;
  key: string;
  display_name: string;
}

interface UnclassifiedSession {
  id: string;
  title: string;
  scheduled_date: string | null;
  status: string;
  hour_type_key: string | null;
  contrato_id: string | null;
  schools: { id: number; name: string } | null;
  session_facilitators: Array<{
    profiles: { first_name: string | null; last_name: string | null } | null;
  }> | null;
}

// ============================================================
// Page
// ============================================================

const BulkTagSessionsPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<UnclassifiedSession[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const [hourTypes, setHourTypes] = useState<HourType[]>([]);
  const [selectedHourTypeKey, setSelectedHourTypeKey] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSchoolId, setFilterSchoolId] = useState('');
  const [schools, setSchools] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    initAuth();
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (filterDateFrom) params.set('date_from', filterDateFrom);
      if (filterDateTo) params.set('date_to', filterDateTo);
      if (filterSchoolId) params.set('school_id', filterSchoolId);

      const res = await fetch(`/api/admin/bulk-tag-sessions?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Error al cargar sesiones');
        return;
      }
      setSessions(json.data?.sessions ?? []);
      setTotal(json.data?.total ?? 0);
    } catch {
      toast.error('Error de red al cargar sesiones');
    }
  }, [page, filterDateFrom, filterDateTo, filterSchoolId]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchSessions();
    }
  }, [user, isAdmin, fetchSessions]);

  const initAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      const role = await getUserPrimaryRole(session.user.id);
      if (role !== 'admin') {
        router.push('/dashboard');
        return;
      }
      setIsAdmin(true);
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const fetchHourTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/hour-types');
      if (!res.ok) return;
      const json = await res.json();
      const types: HourType[] = json.data?.hour_types ?? [];
      setHourTypes(types.filter((ht) => ht.key !== 'online_learning'));
    } catch {
      // Silently fail
    }
  }, []);

  const fetchSchools = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('id, name')
        .order('name');
      if (!error && data) {
        setSchools(data as Array<{ id: number; name: string }>);
      }
    } catch {
      // Silently fail
    }
  }, [supabase]);

  useEffect(() => {
    fetchHourTypes();
    fetchSchools();
  }, [fetchHourTypes, fetchSchools]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === sessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sessions.map((s) => s.id)));
    }
  };

  const handleBulkTag = async () => {
    if (selectedIds.size === 0) {
      toast.error('Debe seleccionar al menos una sesión');
      return;
    }
    if (!selectedHourTypeKey) {
      toast.error('Debe seleccionar un tipo de hora');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/bulk-tag-sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_ids: Array.from(selectedIds),
          hour_type_key: selectedHourTypeKey,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error ?? 'Error al clasificar sesiones');
        return;
      }

      toast.success(json.data?.message ?? 'Sesiones clasificadas correctamente');
      setSelectedIds(new Set());
      fetchSessions();
    } catch {
      toast.error('Error de red al clasificar sesiones');
    } finally {
      setSaving(false);
    }
  };

  const getFacilitatorName = (session: UnclassifiedSession): string => {
    const facilitators = session.session_facilitators ?? [];
    if (facilitators.length === 0) return '—';
    const first = facilitators[0].profiles;
    if (!first) return '—';
    return `${first.first_name ?? ''} ${first.last_name ?? ''}`.trim() || '—';
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    try {
      return format(new Date(dateStr + 'T00:00:00'), 'd MMM yyyy', { locale: es });
    } catch {
      return dateStr;
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand_primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-brand_primary mb-4">Acceso Denegado</h1>
          <p className="text-gray-600">No tiene permisos para acceder a esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="sessions"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
    >
      <ResponsiveFunctionalPageHeader
        icon={<Tag />}
        title="Clasificar Sesiones"
        subtitle="Asignar tipo de hora a sesiones históricas sin clasificar"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Info banner */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm mb-6">
          <Info className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p>Las sesiones clasificadas aquí aparecerán en reportes pero <strong>NO</strong> afectarán los saldos de horas del contrato.</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filtros</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label htmlFor="filter-date-from" className="block text-xs font-medium text-gray-600 mb-1">Fecha desde</label>
              <input
                id="filter-date-from"
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="filter-date-to" className="block text-xs font-medium text-gray-600 mb-1">Fecha hasta</label>
              <input
                id="filter-date-to"
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="filter-school" className="block text-xs font-medium text-gray-600 mb-1">Colegio</label>
              <select
                id="filter-school"
                value={filterSchoolId}
                onChange={(e) => { setFilterSchoolId(e.target.value); setPage(1); }}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent bg-white"
              >
                <option value="">Todos los colegios</option>
                {schools.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Sessions table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {total} sesión(es) sin clasificar
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={sessions.length > 0 && selectedIds.size === sessions.length}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300"
                      aria-label="Seleccionar todas las sesiones"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">Fecha</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">Título</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">Colegio</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">Consultor</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No hay sesiones sin clasificar con los filtros actuales
                    </td>
                  </tr>
                ) : (
                  sessions.map((session) => (
                    <tr
                      key={session.id}
                      className={`hover:bg-gray-50 transition-colors ${selectedIds.has(session.id) ? 'bg-yellow-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(session.id)}
                          onChange={() => handleToggleSelect(session.id)}
                          className="rounded border-gray-300"
                          aria-label={`Seleccionar sesión ${session.title}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDate(session.scheduled_date)}
                      </td>
                      <td className="px-4 py-3 text-gray-900 max-w-xs truncate">
                        {session.title}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {session.schools?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {getFacilitatorName(session)}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const badge = getStatusBadge(session.status as SessionStatus);
                          return (
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Página siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sticky bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="sticky bottom-0 z-10 bg-brand_primary text-white rounded-lg p-4 mt-4 flex flex-wrap items-center gap-4 shadow-lg">
            <span className="text-sm font-medium">
              {selectedIds.size} sesión(es) seleccionada(s)
            </span>
            <div className="flex items-center gap-2">
              <select
                value={selectedHourTypeKey}
                onChange={(e) => setSelectedHourTypeKey(e.target.value)}
                className="min-w-[180px] border border-white/30 bg-white/10 text-white rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent"
                aria-label="Tipo de hora para clasificación"
              >
                <option value="">Seleccione tipo de hora</option>
                {hourTypes.map((ht) => (
                  <option key={ht.key} value={ht.key}>
                    {ht.display_name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleBulkTag}
                disabled={saving || !selectedHourTypeKey}
                className="flex items-center gap-2 px-4 py-2 bg-brand_accent text-brand_primary rounded-md text-sm font-semibold hover:bg-brand_accent_hover transition-colors disabled:opacity-50"
              >
                <Tag className="h-4 w-4" />
                {saving ? 'Clasificando...' : 'Clasificar Seleccionadas'}
              </button>
            </div>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-2 text-sm text-white/70 hover:text-white underline"
            >
              Deseleccionar
            </button>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default BulkTagSessionsPage;
