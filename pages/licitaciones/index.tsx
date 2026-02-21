import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '@/components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { Plus, FileText, ChevronLeft, ChevronRight, Download, AlertTriangle } from 'lucide-react';
import { LicitacionEstado, ESTADO_DISPLAY, NEXT_ACTION } from '@/types/licitaciones';
import { LicitacionesExport, LicitacionExportRow } from '@/lib/licitacionesExport';

interface LicitacionRow {
  id: string;
  numero_licitacion: string;
  nombre_licitacion: string;
  estado: LicitacionEstado;
  year: number;
  created_at: string;
  fecha_publicacion?: string | null;
  fecha_limite_solicitud_bases?: string | null;
  fecha_limite_consultas?: string | null;
  fecha_inicio_propuestas?: string | null;
  fecha_limite_propuestas?: string | null;
  fecha_limite_evaluacion?: string | null;
  fecha_adjudicacion?: string | null;
  monto_minimo: number;
  monto_maximo: number;
  tipo_moneda: string;
  peso_evaluacion_tecnica: number;
  monto_adjudicado_uf?: number | null;
  contrato_id?: string | null;
  school_id?: number;
  programa_id?: string;
  schools?: { id: number; name: string } | null;
  programa?: { id: string; name: string } | null;
  ganador_ate?: { nombre_ate: string } | null;
}

interface SchoolOption {
  id: number;
  name: string;
}

interface ProgramaOption {
  id: string;
  name: string;
}

interface DeadlineItem {
  id: string;
  numero_licitacion: string;
  school_name: string;
  deadline_label: string;
  deadline_date: string;
  days_remaining: number;
}

function EstadoBadge({ estado }: { estado: LicitacionEstado }) {
  const info = ESTADO_DISPLAY[estado] || { label: estado, color: 'text-gray-700', bg: 'bg-gray-100' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${info.bg} ${info.color}`}>
      {info.label}
    </span>
  );
}

// Deadline fields to check for upcoming panel
const DEADLINE_FIELDS: Array<{ field: keyof LicitacionRow; label: string; relevantEstados: LicitacionEstado[] }> = [
  {
    field: 'fecha_limite_solicitud_bases',
    label: 'Plazo solicitud de bases',
    relevantEstados: ['recepcion_bases_pendiente'],
  },
  {
    field: 'fecha_limite_consultas',
    label: 'Plazo de consultas',
    relevantEstados: ['recepcion_bases_pendiente'],
  },
  {
    field: 'fecha_limite_propuestas',
    label: 'Plazo de propuestas',
    relevantEstados: ['propuestas_pendientes'],
  },
  {
    field: 'fecha_limite_evaluacion',
    label: 'Plazo de evaluación',
    relevantEstados: ['evaluacion_pendiente'],
  },
];

function getUpcomingDeadlines(licitaciones: LicitacionRow[]): DeadlineItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const items: DeadlineItem[] = [];

  for (const lic of licitaciones) {
    for (const df of DEADLINE_FIELDS) {
      if (!df.relevantEstados.includes(lic.estado)) continue;
      const dateStr = (lic[df.field] as string | null | undefined);
      if (!dateStr) continue;

      const deadline = new Date(dateStr + 'T00:00:00');
      const diffMs = deadline.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Show deadlines within next 3 business days (approx 4 calendar days)
      if (diffDays >= 0 && diffDays <= 4) {
        items.push({
          id: `${lic.id}-${df.field}`,
          numero_licitacion: lic.numero_licitacion,
          school_name: lic.schools?.name || '',
          deadline_label: df.label,
          deadline_date: dateStr,
          days_remaining: diffDays,
        });
      }
    }
  }

  // Sort by closest deadline first, limit to 5
  items.sort((a, b) => a.days_remaining - b.days_remaining);
  return items.slice(0, 5);
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export default function LicitacionesPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEncargado, setIsEncargado] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [encargadoSchoolName, setEncargadoSchoolName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [licitaciones, setLicitaciones] = useState<LicitacionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const LIMIT = 20;

  // Filters
  const [filterEstado, setFilterEstado] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [filterPrograma, setFilterPrograma] = useState('');

  // Filter options
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [programas, setProgramas] = useState<ProgramaOption[]>([]);

  // Upcoming deadlines (computed from current licitaciones)
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<DeadlineItem[]>([]);

  useEffect(() => {
    checkAuth();
  }, []);

  // Fire deadline check on load (fire-and-forget)
  useEffect(() => {
    if (!currentUser) return;
    fetch('/api/licitaciones/check-deadlines', { method: 'POST' })
      .catch(() => { /* intentionally silent */ });
  }, [currentUser]);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/auth/my-roles');
      const rolesData = await response.json();

      if (!response.ok) {
        toast.error('Error al verificar permisos');
        router.push('/dashboard');
        return;
      }

      // Roles include joined school data: { role_type, school_id, school: { name, ... } }
      const roles: Array<{ role_type: string; school_id?: number | null; school?: { name?: string } | null }> =
        rolesData.roles || rolesData.data?.roles || [];
      const roleTypes: string[] = roles.map((r) => r.role_type);
      const adminAccess = roleTypes.includes('admin');
      const encargadoAccess = roleTypes.includes('encargado_licitacion');

      if (!adminAccess && !encargadoAccess) {
        toast.error('No tiene permisos para acceder a licitaciones');
        router.push('/dashboard');
        return;
      }

      setCurrentUser(user);
      setIsAdmin(adminAccess);
      setIsEncargado(encargadoAccess);
      setUserRole(adminAccess ? 'admin' : 'encargado_licitacion');

      // Capture encargado school name for subtitle
      if (encargadoAccess && !adminAccess) {
        const encargadoRole = roles.find(r => r.role_type === 'encargado_licitacion');
        if (encargadoRole?.school?.name) {
          setEncargadoSchoolName(encargadoRole.school.name);
        }
      }

      // Load filter options
      if (adminAccess) {
        fetchFilterOptions();
      } else {
        fetchProgramas();
      }
    } catch {
      router.push('/login');
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const [schoolsResult, programasResult] = await Promise.all([
        supabase.from('schools').select('id, name').order('name'),
        supabase.from('programas').select('id, name').order('name'),
      ]);
      if (!schoolsResult.error) {
        setSchools(schoolsResult.data || []);
      }
      if (!programasResult.error) {
        setProgramas(programasResult.data || []);
      }
    } catch {
      // Non-critical — filters just won't have options
    }
  };

  const fetchProgramas = async () => {
    try {
      const { data, error } = await supabase
        .from('programas')
        .select('id, name')
        .order('name');
      if (!error) {
        setProgramas(data || []);
      }
    } catch {
      // Non-critical
    }
  };

  const fetchLicitaciones = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(LIMIT));
      if (filterEstado) params.set('estado', filterEstado);
      if (filterYear) params.set('year', filterYear);
      if (filterSchool) params.set('school_id', filterSchool);
      if (filterPrograma) params.set('programa_id', filterPrograma);

      const res = await fetch(`/api/licitaciones?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Error al cargar licitaciones');
        return;
      }

      const rows: LicitacionRow[] = json.data?.licitaciones || [];
      setLicitaciones(rows);
      setTotal(json.data?.total || 0);
      setUpcomingDeadlines(getUpcomingDeadlines(rows));
    } catch {
      toast.error('Error al cargar licitaciones');
    } finally {
      setLoading(false);
    }
  }, [currentUser, page, filterEstado, filterYear, filterSchool, filterPrograma]);

  useEffect(() => {
    if (currentUser) {
      fetchLicitaciones();
    }
  }, [fetchLicitaciones]);

  const handleExportExcel = async () => {
    if (!isAdmin) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('export', 'true');
      params.set('page', '1');
      params.set('limit', '50');
      if (filterEstado) params.set('estado', filterEstado);
      if (filterYear) params.set('year', filterYear);
      if (filterSchool) params.set('school_id', filterSchool);
      if (filterPrograma) params.set('programa_id', filterPrograma);

      const res = await fetch(`/api/licitaciones?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Error al exportar');
        return;
      }

      const rows: LicitacionExportRow[] = json.data?.licitaciones || [];
      if (rows.length === 0) {
        toast.error('No hay licitaciones para exportar');
        return;
      }

      LicitacionesExport.exportToExcel(rows);
      toast.success(`Exportando ${rows.length} licitaciones...`);
    } catch {
      toast.error('Error al exportar licitaciones');
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 1 + i);

  // Actionable licitaciones for encargado card
  const actionableLicitaciones = licitaciones.filter(l => NEXT_ACTION[l.estado]);

  return (
    <MainLayout
      user={currentUser as Parameters<typeof MainLayout>[0]['user']}
      currentPage="licitaciones"
      pageTitle="Licitaciones"
      isAdmin={isAdmin}
      userRole={userRole}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {isAdmin ? 'Licitaciones' : 'Mis Licitaciones'}
            </h1>
            {isEncargado && !isAdmin && encargadoSchoolName && (
              <p className="text-gray-500 mt-1 font-medium">
                Licitaciones de {encargadoSchoolName}
              </p>
            )}
            {(!isEncargado || isAdmin) && (
              <p className="text-gray-600 mt-1">
                Procesos de licitación de servicios ATE bajo Ley SEP
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                onClick={handleExportExcel}
                disabled={exporting}
                className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2"
              >
                <Download size={18} className="mr-2" />
                {exporting ? 'Exportando...' : 'Exportar a Excel'}
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => router.push('/licitaciones/nueva')}
                className="flex items-center px-4 py-2 bg-yellow-400 text-black rounded-lg hover:bg-yellow-500 transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2"
              >
                <Plus size={20} className="mr-2" />
                Nueva Licitación
              </button>
            )}
          </div>
        </div>

        {/* Encargado: Action Required Card */}
        {isEncargado && !isAdmin && actionableLicitaciones.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-yellow-800 mb-2 flex items-center gap-2">
              <AlertTriangle size={16} aria-hidden="true" />
              Acciones Requeridas ({actionableLicitaciones.length})
            </h3>
            <ul className="space-y-1">
              {actionableLicitaciones.slice(0, 5).map(lic => (
                <li key={lic.id}>
                  <button
                    onClick={() => router.push(`/licitaciones/${lic.id}`)}
                    className="text-sm text-left w-full text-gray-800 font-medium hover:text-gray-900 hover:underline focus:outline-none focus:ring-2 focus:ring-yellow-400 rounded"
                  >
                    <span className="font-semibold">{lic.numero_licitacion}</span>
                    {' — '}
                    {NEXT_ACTION[lic.estado] || ''}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Upcoming Deadlines Panel */}
        {upcomingDeadlines.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-yellow-800 mb-2 flex items-center gap-2">
              <AlertTriangle size={16} aria-hidden="true" />
              Próximos Vencimientos (próximos 3 días hábiles)
            </h3>
            <ul className="space-y-1">
              {upcomingDeadlines.map(item => (
                <li key={item.id} className="text-sm text-yellow-700">
                  <span className="font-medium">{item.numero_licitacion}</span>
                  {item.school_name && ` (${item.school_name})`}
                  {' — '}
                  {item.deadline_label}:{' '}
                  <span className="font-semibold">{formatDate(item.deadline_date)}</span>
                  {item.days_remaining === 0 && (
                    <span className="ml-2 text-red-600 font-bold">HOY</span>
                  )}
                  {item.days_remaining === 1 && (
                    <span className="ml-2 text-orange-600 font-semibold">mañana</span>
                  )}
                  {item.days_remaining > 1 && (
                    <span className="ml-2 text-yellow-600">en {item.days_remaining} días</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div>
              <label htmlFor="filter-estado" className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select
                id="filter-estado"
                value={filterEstado}
                onChange={e => { setFilterEstado(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              >
                <option value="">Todos los estados</option>
                {(Object.keys(ESTADO_DISPLAY) as LicitacionEstado[]).map(e => (
                  <option key={e} value={e}>{ESTADO_DISPLAY[e].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-year" className="block text-sm font-medium text-gray-700 mb-1">Año</label>
              <select
                id="filter-year"
                value={filterYear}
                onChange={e => { setFilterYear(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              >
                <option value="">Todos los años</option>
                {years.map(y => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
            {/* School filter — admin only */}
            {isAdmin && schools.length > 0 && (
              <div>
                <label htmlFor="filter-school" className="block text-sm font-medium text-gray-700 mb-1">Escuela</label>
                <select
                  id="filter-school"
                  value={filterSchool}
                  onChange={e => { setFilterSchool(e.target.value); setPage(1); }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                >
                  <option value="">Todas las escuelas</option>
                  {schools.map(s => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            {/* Program filter — all roles */}
            {programas.length > 0 && (
              <div>
                <label htmlFor="filter-programa" className="block text-sm font-medium text-gray-700 mb-1">Programa</label>
                <select
                  id="filter-programa"
                  value={filterPrograma}
                  onChange={e => { setFilterPrograma(e.target.value); setPage(1); }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                >
                  <option value="">Todos los programas</option>
                  {programas.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
          </div>
        ) : licitaciones.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <FileText size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay licitaciones</h3>
            <p className="text-gray-500">
              {isAdmin
                ? 'Crea la primera licitación con el botón "Nueva Licitación"'
                : 'No hay licitaciones asignadas a su escuela'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Número
                    </th>
                    {isAdmin && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Escuela
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acción Requerida
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Año
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha Publicación
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Creado
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {licitaciones.map(lic => {
                    const nextAction = NEXT_ACTION[lic.estado];
                    return (
                      <tr
                        key={lic.id}
                        onClick={() => router.push(`/licitaciones/${lic.id}`)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          <a
                            href={`/licitaciones/${lic.id}`}
                            className="hover:underline focus:outline-none focus:ring-2 focus:ring-yellow-400 rounded"
                            onClick={e => { e.preventDefault(); router.push(`/licitaciones/${lic.id}`); }}
                          >
                            {lic.numero_licitacion}
                          </a>
                        </td>
                        {isAdmin && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {lic.schools?.name || '-'}
                          </td>
                        )}
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                          {lic.nombre_licitacion}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <EstadoBadge estado={lic.estado} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {nextAction ? (
                            <span className="text-gray-900 font-semibold">{nextAction}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {lic.year}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatDate(lic.fecha_publicacion)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatDate(lic.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 px-2">
                <p className="text-sm text-gray-600">
                  Mostrando {((page - 1) * LIMIT) + 1}&ndash;{Math.min(page * LIMIT, total)} de {total}
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    aria-label="Página anterior"
                    className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2"
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  <span className="text-sm text-gray-700">
                    Página {page} de {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    aria-label="Página siguiente"
                    className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2"
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
